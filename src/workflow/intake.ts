/** Product event for a newly created work item. */
export const CREATED_ISSUE_EVENT = 'avi:jira:created:issue';

/** Extra fetches after the first 404 on a create. The issue is often not readable yet. */
export const CREATE_FETCH_RETRY_LIMIT = 3;

/** Delay before the next fetch. Forge allows 0 to 900 seconds. */
export const CREATE_FETCH_RETRY_DELAY_SECONDS = 15;

/** One page of issues the app can see. No further pages. */
export const SWEEP_PAGE_SIZE = 50;

/** At most this many writes per scheduled run, shared by new cases and KVS mirrors. */
export const SWEEP_ANALYSE_LIMIT = 8;

/** Recent work items only. The app user already limits this to projects it can browse. */
export const SWEEP_JQL = 'created >= -1d ORDER BY created DESC';

export function nextCreateFetchAttempt(input: {
  eventType?: string;
  retryCount?: number;
}):
  | { action: 'retry'; retryCount: number; delayInSeconds: number }
  | { action: 'stop'; reason: 'issue-not-found' | 'issue-not-visible-retries-exhausted' } {
  if (input.eventType !== CREATED_ISSUE_EVENT) return { action: 'stop', reason: 'issue-not-found' };
  const retryCount = input.retryCount ?? 0;
  if (retryCount >= CREATE_FETCH_RETRY_LIMIT) {
    return { action: 'stop', reason: 'issue-not-visible-retries-exhausted' };
  }
  return {
    action: 'retry',
    retryCount: retryCount + 1,
    delayInSeconds: CREATE_FETCH_RETRY_DELAY_SECONDS,
  };
}

