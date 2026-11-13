import type { FairReplyCase } from './case/types';
import { readCaseProperty, readMirroredCase, listMirroredCases } from './jira/store';
import { refreshCaseFromIssue } from './runtime';
import { atRiskView, complaintStatusView, coverageView, draftView, refreshAtRiskRows } from './rovo/view';

interface ActionPayload {
  issueKey?: string;
  horizonHours?: number;
  context?: { jira?: { issueKey?: string } };
}

interface ActionContext {
  extension?: { issue?: { key?: string } };
}

function issueKeyFrom(payload: ActionPayload, context?: ActionContext): string | null {
  return payload.issueKey || payload.context?.jira?.issueKey || context?.extension?.issue?.key || null;
}

async function loadCase(issueKey: string): Promise<FairReplyCase | null> {
  return (await readCaseProperty(issueKey)) ?? (await readMirroredCase(issueKey));
}

/** Status and coverage re-analyse public replies the stored case has not seen yet. */
async function loadFreshCase(issueKey: string): Promise<FairReplyCase | null> {
  const record = await loadCase(issueKey);
  if (!record) return null;
  return refreshCaseFromIssue(issueKey, record);
}

export async function getComplaintStatus(payload: ActionPayload = {}, context?: ActionContext) {
  const issueKey = issueKeyFrom(payload, context);
  if (!issueKey) return { error: 'Provide an issue key.' };
  return complaintStatusView(issueKey, await loadFreshCase(issueKey));
}

/** A missing or unusable horizon stays on the 48-hour default. */
export function horizonHoursFrom(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 48;
  return value;
}

export async function listAtRisk(payload: ActionPayload = {}) {
  const horizonHours = horizonHoursFrom(payload.horizonHours);
  const now = new Date();
  try {
    const rows = await listMirroredCases();
    const refreshed = await refreshAtRiskRows(rows, now, horizonHours, refreshCaseFromIssue);
    return { ...atRiskView(refreshed.rows, now, horizonHours, refreshed.stats), error: null as string | null };
  } catch (error) {
    return {
      ...atRiskView([], now, horizonHours),
      error: error instanceof Error ? error.message : 'Could not read the complaint index.',
    };
  }
}

export async function checkCoverage(payload: ActionPayload = {}, context?: ActionContext) {
  const issueKey = issueKeyFrom(payload, context);
  if (!issueKey) return { error: 'Provide an issue key.' };
  return coverageView(issueKey, await loadFreshCase(issueKey));
}

/** Returns a draft acknowledgement. Does not post a comment. */
export async function draftAck(payload: ActionPayload = {}, context?: ActionContext) {
  const issueKey = issueKeyFrom(payload, context);
  if (!issueKey) return { error: 'Provide an issue key.', sent: false };
  return draftView(issueKey, await loadCase(issueKey));
}
