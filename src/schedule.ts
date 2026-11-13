import { findRecentIssues, listMirroredCases, mirrorCase, postInternalComment, readCaseProperty, readMirroredCase } from './jira/store';
import { logInfo } from './log';
import { analyseIssueNow, persistCase } from './runtime';
import { SWEEP_ANALYSE_LIMIT, SWEEP_JQL, SWEEP_PAGE_SIZE } from './workflow/intake';
import { reminderText, shouldRemind } from './workflow/remind';

/**
 * Five-minute sweep, the shortest Forge scheduledTrigger interval.
 * First backfills recent work items that never received a case, then posts deadline notes.
 * The backfill runs even when the KVS mirror is unavailable.
 */
export async function handler(): Promise<void> {
  await sweepRecentIssues();
  await remindDueCases();
}

async function sweepRecentIssues(): Promise<void> {
  let found: Awaited<ReturnType<typeof findRecentIssues>> = [];
  try {
    found = await findRecentIssues(SWEEP_JQL, SWEEP_PAGE_SIZE);
  } catch (error) {
    logInfo({
      stage: 'sweep-exit',
      reason: 'search-failed',
      error: error instanceof Error ? error.message : 'search-failed',
    });
    return;
  }
  let slots = SWEEP_ANALYSE_LIMIT;
  let analysed = 0;
  let mirrored = 0;
  let kvsReadable = true;
  for (const row of found) {
    if (slots <= 0) break;
    if (!row.hasCase) {
      slots -= 1;
      try {
        const result = await analyseIssueNow(row.key);
        if (result === 'written') analysed += 1;
        else logInfo({ stage: 'sweep-skip', issueKey: row.key, reason: result === 'present' ? 'case-already-stored' : 'issue-not-found' });
      } catch (error) {
        logInfo({
          stage: 'sweep-skip',
          issueKey: row.key,
          reason: 'analyse-failed',
          error: error instanceof Error ? error.message : 'analyse-failed',
        });
      }
      continue;
    }
    if (!kvsReadable) continue;
    const copied = await copyStoredCaseToMirror(row.key);
    if (copied === 'failed') kvsReadable = false;
    else if (copied === 'mirrored') {
      slots -= 1;
      mirrored += 1;
    }
  }
  logInfo({ stage: 'sweep', scanned: found.length, analysed, mirrored });
}

/** Copy an existing issue property into KVS. Does not re-analyse. Already mirrored is a no-op. */
async function copyStoredCaseToMirror(issueKey: string): Promise<'mirrored' | 'present' | 'skipped' | 'failed'> {
  let existing: Awaited<ReturnType<typeof readMirroredCase>>;
  try {
    existing = await readMirroredCase(issueKey);
  } catch (error) {
    logInfo({
      stage: 'sweep-skip',
      issueKey,
      reason: 'mirror-failed',
      error: error instanceof Error ? error.message : 'mirror-failed',
    });
    return 'failed';
  }
  if (existing) return 'present';
  let stored: Awaited<ReturnType<typeof readCaseProperty>>;
  try {
    stored = await readCaseProperty(issueKey);
  } catch (error) {
    logInfo({
      stage: 'sweep-skip',
      issueKey,
      reason: 'property-unreadable',
      error: error instanceof Error ? error.message : 'property-unreadable',
    });
    return 'skipped';
  }
  if (!stored) {
    logInfo({ stage: 'sweep-skip', issueKey, reason: 'property-missing' });
    return 'skipped';
  }
  try {
    await mirrorCase(issueKey, stored);
    return 'mirrored';
  } catch (error) {
    logInfo({
      stage: 'sweep-skip',
      issueKey,
      reason: 'mirror-failed',
      error: error instanceof Error ? error.message : 'mirror-failed',
    });
    return 'failed';
  }
}

async function remindDueCases(): Promise<void> {
  const now = new Date();
  const rows = await listMirroredCases();
  for (const row of rows) {
    if (!shouldRemind(row.record, now)) continue;
    await postInternalComment(row.issueKey, reminderText(row.record, row.issueKey));
    await persistCase(row.issueKey, { ...row.record, remindedAt: now.toISOString() });
  }
}
