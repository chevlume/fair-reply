import { Queue } from '@forge/events';
import type { FairReplyCase } from './case/types';
import { analyseTicket } from './case/analyse';
import { isLlmEnabled } from './detect/hybrid';
import { publicRepliesNeedRefresh, refreshStoredCase } from './case/refresh';
import { fetchComments, fetchIssue, mirrorCase, postInternalComment, readCaseProperty, writeCaseProperty, type IssueContent } from './jira/store';
import { logInfo } from './log';
import { nextCreateFetchAttempt } from './workflow/intake';
import { observeDoneTransition, readIssueStatus } from './workflow/resolutionWatch';
import { createForgeLlmClient } from './detect/forgeLlm';

export const QUEUE_KEY = 'fair-reply-queue';

export type QueueBody = {
  issueKey: string;
  issueId?: string;
  eventType?: string;
  statusName?: string | null;
  statusCategoryKey?: string | null;
  /** How many delayed re-fetches have already been queued after a create 404. */
  retryCount?: number;
} & Record<string, unknown>;

type TriggerEvent = {
  issue?: { id?: string; key?: string; fields?: { status?: { name?: string; statusCategory?: { key?: string } } } };
  changelog?: { items?: Array<{ field?: string; toString?: string }> };
  eventType?: string;
  selfGenerated?: boolean;
};

async function enqueue(body: QueueBody, delayInSeconds?: number, reason?: string): Promise<void> {
  const queue = new Queue<QueueBody>({ key: QUEUE_KEY });
  await queue.push(delayInSeconds === undefined ? { body } : { body, delayInSeconds });
  logInfo({
    stage: 'queue-push',
    reason: reason ?? 'event',
    eventType: body.eventType ?? null,
    issueKey: body.issueKey,
    issueId: body.issueId ?? null,
    retryCount: body.retryCount ?? 0,
    delayInSeconds: delayInSeconds ?? 0,
  });
}

/** Product trigger. Enqueues work and returns quickly. ignoreSelf is also set in the manifest. */
export async function handler(event: TriggerEvent): Promise<void> {
  const issueKey = event.issue?.key;
  const issueId = event.issue?.id;
  logInfo({
    stage: 'trigger',
    eventType: event.eventType ?? null,
    issueKey: issueKey ?? null,
    issueId: issueId ?? null,
  });
  if (event.selfGenerated) {
    logInfo({ stage: 'trigger-exit', reason: 'self-generated', eventType: event.eventType ?? null, issueKey: issueKey ?? null, issueId: issueId ?? null });
    return;
  }
  if (!issueKey) {
    logInfo({ stage: 'trigger-exit', reason: 'missing-issue-key', eventType: event.eventType ?? null, issueKey: null, issueId: issueId ?? null });
    return;
  }
  const status = readIssueStatus(event);
  const body: QueueBody = {
    issueKey,
    issueId,
    eventType: event.eventType,
    statusName: status.statusName,
    statusCategoryKey: status.statusCategoryKey,
  };
  try {
    await enqueue(body);
  } catch (error) {
    logInfo({
      stage: 'trigger-exit',
      reason: 'queue-push-failed',
      eventType: event.eventType ?? null,
      issueKey,
      issueId: issueId ?? null,
      error: error instanceof Error ? error.message : 'queue-push-failed',
    });
    throw error;
  }
}

async function retryMissingCreate(body: QueueBody): Promise<void> {
  const decision = nextCreateFetchAttempt(body);
  if (decision.action === 'retry') {
    await enqueue({ ...body, retryCount: decision.retryCount }, decision.delayInSeconds, 'issue-not-visible');
    return;
  }
  logInfo({
    stage: 'consumer-exit',
    reason: decision.reason,
    eventType: body.eventType ?? null,
    issueKey: body.issueKey,
    issueId: body.issueId ?? null,
    retryCount: body.retryCount ?? 0,
  });
}

async function analyseFetchedIssue(
  issueKey: string,
  issue: IssueContent,
  status: { statusName: string | null; statusCategoryKey: string | null },
): Promise<void> {
  const comments = await fetchComments(issueKey);
  const previous = await readCaseProperty(issueKey);
  const llmEnabled = isLlmEnabled();
  const record = await analyseTicket({
    summary: issue.summary,
    description: issue.description,
    created: issue.created,
    customerComments: comments.filter((comment) => comment.author === 'customer').map((comment) => comment.body),
    agentPublicReplies: comments.filter((comment) => comment.public && comment.author === 'agent').map((comment) => comment.body),
    publicComments: comments.filter((comment) => comment.public).map((comment) => comment.body),
    previous,
    llmEnabled,
    llmComplete: llmEnabled
      ? async (text) => (await createForgeLlmClient())(text)
      : undefined,
  });
  const watched = observeDoneTransition(record, status, new Date().toISOString());
  await persistCase(issueKey, watched.record);
  if (watched.note) await postInternalComment(issueKey, watched.note);
}

/** Async consumer. Rules by default. Forge LLM only when FAIR_REPLY_LLM=on. */
export async function consume(event: { body?: QueueBody }): Promise<void> {
  const body = event.body;
  const issueKey = body?.issueKey;
  logInfo({
    stage: 'consumer',
    eventType: body?.eventType ?? null,
    issueKey: issueKey ?? null,
    issueId: body?.issueId ?? null,
    retryCount: body?.retryCount ?? 0,
  });
  if (!issueKey || !body) {
    logInfo({ stage: 'consumer-exit', reason: 'missing-issue-key', eventType: body?.eventType ?? null, issueKey: null, issueId: body?.issueId ?? null });
    return;
  }
  const issue = await fetchIssue(issueKey);
  if (!issue) {
    await retryMissingCreate(body);
    return;
  }
  await analyseFetchedIssue(issueKey, issue, {
    statusName: body.statusName ?? null,
    statusCategoryKey: body.statusCategoryKey ?? null,
  });
}

/**
 * Write a case when the scheduled sweep finds a work item with no `fairreply.case` yet.
 * A second read avoids overwriting a case that landed between the search and this call.
 */
export async function analyseIssueNow(issueKey: string): Promise<'written' | 'missing' | 'present'> {
  const existing = await readCaseProperty(issueKey);
  if (existing) return 'present';
  const issue = await fetchIssue(issueKey);
  if (!issue) return 'missing';
  await analyseFetchedIssue(issueKey, issue, { statusName: null, statusCategoryKey: null });
  return 'written';
}

/**
 * If public comments are newer than the stored case, analyse them here.
 * Does not wait for the queue and does not post a comment or reminder.
 */
export async function refreshCaseFromIssue(issueKey: string, record: FairReplyCase): Promise<FairReplyCase> {
  const comments = await fetchComments(issueKey);
  const publicComments = comments.filter((comment) => comment.public).map((comment) => comment.body);
  const agentPublicReplies = comments.filter((comment) => comment.public && comment.author === 'agent').map((comment) => comment.body);
  if (!publicRepliesNeedRefresh(record, publicComments)) return record;
  const issue = await fetchIssue(issueKey);
  if (!issue) return record;
  const refreshed = await refreshStoredCase(record, {
    summary: issue.summary,
    description: issue.description,
    created: issue.created,
    customerComments: comments.filter((comment) => comment.author === 'customer').map((comment) => comment.body),
    agentPublicReplies,
    publicComments,
  });
  if (!refreshed.refreshed) return record;
  await persistCase(issueKey, refreshed.record);
  return refreshed.record;
}

export async function persistCase(issueKey: string, record: FairReplyCase): Promise<void> {
  await writeCaseProperty(issueKey, record);
  try {
    await mirrorCase(issueKey, record);
  } catch (error) {
    console.warn('Fair Reply stored the issue property but could not mirror it to KVS', error);
  }
}
