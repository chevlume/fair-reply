import { beforeEach, describe, expect, it, vi } from 'vitest';
import { caseStorageKey, KVS_INDEX_KEY } from '../src/case/types';
import { CREATE_FETCH_RETRY_DELAY_SECONDS, CREATE_FETCH_RETRY_LIMIT, CREATED_ISSUE_EVENT, SWEEP_ANALYSE_LIMIT, SWEEP_JQL, SWEEP_PAGE_SIZE } from '../src/workflow/intake';

const mocks = vi.hoisted(() => ({
  push: vi.fn(async (_event: unknown) => ({ jobId: 'job-1' })),
  requestJira: vi.fn(),
  kvsGet: vi.fn(async (_key: string): Promise<unknown> => ({ issueKeys: [] as string[] })),
  kvsSet: vi.fn(async (_key: string, _value: unknown) => undefined),
}));

vi.mock('@forge/events', () => ({
  Queue: class {
    push(event: unknown) {
      return mocks.push(event);
    }
  },
}));

vi.mock('@forge/api', () => ({
  asApp: () => ({ requestJira: mocks.requestJira }),
  route: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((sum, part, index) => sum + part + (values[index] ?? ''), ''),
}));

vi.mock('@forge/kvs', () => ({
  kvs: {
    get: mocks.kvsGet,
    set: mocks.kvsSet,
  },
}));

function http(status: number, body: unknown = {}) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}

const created = '2026-11-06T09:02:00.000Z';

function issueBody(key: string) {
  return {
    key,
    fields: {
      summary: 'Horario',
      description: '¿Cuál es el horario de la oficina?',
      created,
    },
  };
}

describe('create fetch retry', () => {
  beforeEach(() => {
    mocks.push.mockClear();
    mocks.requestJira.mockReset();
    mocks.kvsGet.mockReset();
    mocks.kvsSet.mockReset();
    mocks.kvsGet.mockResolvedValue({ issueKeys: [] });
  });

  it('re-enqueues a create when the work item is not readable yet', async () => {
    mocks.requestJira.mockResolvedValue(http(404));
    const { consume } = await import('../src/runtime');
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    await consume({ body: { issueKey: 'SUP-9', issueId: '10009', eventType: CREATED_ISSUE_EVENT } });
    expect(mocks.push).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledWith({
      body: { issueKey: 'SUP-9', issueId: '10009', eventType: CREATED_ISSUE_EVENT, retryCount: 1 },
      delayInSeconds: CREATE_FETCH_RETRY_DELAY_SECONDS,
    });
    const lines = info.mock.calls.map((call) => JSON.parse(String(call[0])) as { stage: string; reason?: string; issueKey?: string });
    expect(lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ stage: 'consumer', eventType: CREATED_ISSUE_EVENT, issueKey: 'SUP-9', issueId: '10009' }),
      expect.objectContaining({ stage: 'queue-push', reason: 'issue-not-visible', retryCount: 1, delayInSeconds: CREATE_FETCH_RETRY_DELAY_SECONDS }),
    ]));
    info.mockRestore();
  });

  it('stops after the bounded retry count and does not retry a non-create 404', async () => {
    mocks.requestJira.mockResolvedValue(http(404));
    const { consume } = await import('../src/runtime');
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    await consume({
      body: { issueKey: 'SUP-9', eventType: CREATED_ISSUE_EVENT, retryCount: CREATE_FETCH_RETRY_LIMIT },
    });
    await consume({ body: { issueKey: 'SUP-8', eventType: 'avi:jira:commented:issue' } });
    expect(mocks.push).not.toHaveBeenCalled();
    const lines = info.mock.calls.map((call) => JSON.parse(String(call[0])) as { reason?: string; issueKey?: string });
    expect(lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: 'issue-not-visible-retries-exhausted', issueKey: 'SUP-9' }),
      expect.objectContaining({ reason: 'issue-not-found', issueKey: 'SUP-8' }),
    ]));
    info.mockRestore();
  });

  it('logs the trigger and the queue push', async () => {
    const { handler } = await import('../src/runtime');
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    await handler({ eventType: CREATED_ISSUE_EVENT, issue: { id: '10001', key: 'SUP-1' } });
    expect(mocks.push).toHaveBeenCalledWith({
      body: expect.objectContaining({ issueKey: 'SUP-1', issueId: '10001', eventType: CREATED_ISSUE_EVENT }),
    });
    const lines = info.mock.calls.map((call) => JSON.parse(String(call[0])) as { stage: string });
    expect(lines.map((line) => line.stage)).toEqual(['trigger', 'queue-push']);
    info.mockRestore();
  });
});

describe('scheduled sweep', () => {
  beforeEach(() => {
    mocks.push.mockClear();
    mocks.requestJira.mockReset();
    mocks.kvsGet.mockReset();
    mocks.kvsSet.mockReset();
    mocks.kvsGet.mockResolvedValue({ issueKeys: [] });
  });

  it('analyses only issues on the page that have no case, and caps the writes', async () => {
    const writes: string[] = [];
    const keys = Array.from({ length: SWEEP_ANALYSE_LIMIT + 2 }, (_, index) => `SUP-${index + 1}`);
    mocks.requestJira.mockImplementation(async (url: string, init?: { method?: string; body?: string }) => {
      if (String(url).includes('/search/jql')) {
        const body = JSON.parse(init?.body ?? '{}') as { jql?: string; maxResults?: number };
        expect(body.jql).toBe(SWEEP_JQL);
        expect(body.maxResults).toBe(SWEEP_PAGE_SIZE);
        return http(200, {
          issues: [
            { key: 'SUP-DONE', properties: { 'fairreply.case': { isComplaint: false } } },
            ...keys.map((key) => ({ key })),
          ],
        });
      }
      const key = String(url).match(/issue\/([^/?]+)/)?.[1] ?? '';
      if (String(url).includes('/comment')) return http(200, { comments: [], total: 0 });
      if (String(url).includes('/properties/fairreply.case') && init?.method === 'PUT') {
        writes.push(key);
        return http(204);
      }
      if (String(url).includes('/properties/fairreply.case')) return http(404);
      if (String(url).includes('/rest/api/3/issue/')) return http(200, issueBody(key));
      return http(500, {});
    });
    const { handler } = await import('../src/schedule');
    await handler();
    expect(writes).toEqual(keys.slice(0, SWEEP_ANALYSE_LIMIT));
    expect(writes).not.toContain('SUP-DONE');
  });

  it('still backfills when the KVS mirror is unauthorized', async () => {
    const writes: string[] = [];
    mocks.kvsGet.mockRejectedValue(Object.assign(new Error('Request principal is not authorized to use storage resource'), { code: 'PRINCIPAL_NOT_AUTHORIZED' }));
    mocks.requestJira.mockImplementation(async (url: string, init?: { method?: string }) => {
      if (String(url).includes('/search/jql')) return http(200, { issues: [{ key: 'SUP-4' }] });
      const key = String(url).match(/issue\/([^/?]+)/)?.[1] ?? '';
      if (String(url).includes('/comment')) return http(200, { comments: [], total: 0 });
      if (String(url).includes('/properties/fairreply.case') && init?.method === 'PUT') {
        writes.push(key);
        return http(204);
      }
      if (String(url).includes('/properties/fairreply.case')) return http(404);
      if (String(url).includes('/rest/api/3/issue/')) return http(200, issueBody(key));
      return http(500, {});
    });
    const { handler } = await import('../src/schedule');
    await expect(handler()).rejects.toThrow(/not authorized/i);
    expect(writes).toEqual(['SUP-4']);
  });

  it('copies a stored property into KVS without re-analysis, inside the shared cap', async () => {
    const stored = {
      isComplaint: true,
      quote: 'Es la tercera vez que os lo digo y exijo que me devolváis los 48 €.',
      category: 'billing',
      startedAt: created,
      deadlineAt: '2026-11-11T09:02:00.000Z',
      points: ['devolváis los 48 €'],
      answered: [false],
      confirmation: 'pending',
      hasPublicReply: false,
      engine: 'rules',
      needsHumanReview: true,
      remindedAt: null,
      ruleLabel: 'billing',
    };
    const missing = Array.from({ length: SWEEP_ANALYSE_LIMIT - 1 }, (_, index) => `SUP-${index + 1}`);
    const propertyPuts: string[] = [];
    const commentReads: string[] = [];
    mocks.kvsGet.mockImplementation(async (key: string) => {
      if (key === caseStorageKey('SUP-KEPT')) return { isComplaint: false, remindedAt: null };
      if (key === KVS_INDEX_KEY) return { issueKeys: [] };
      return null;
    });
    mocks.requestJira.mockImplementation(async (url: string, init?: { method?: string; body?: string }) => {
      if (String(url).includes('/search/jql')) {
        return http(200, {
          issues: [
            ...missing.map((key) => ({ key })),
            { key: 'SUP-KEPT', properties: { 'fairreply.case': { isComplaint: false } } },
            { key: 'SUP-OLD', properties: { 'fairreply.case': { isComplaint: true } } },
            { key: 'SUP-OVERFLOW' },
          ],
        });
      }
      const key = String(url).match(/issue\/([^/?]+)/)?.[1] ?? '';
      if (String(url).includes('/comment')) {
        commentReads.push(key);
        return http(200, { comments: [], total: 0 });
      }
      if (String(url).includes('/properties/fairreply.case') && init?.method === 'PUT') {
        propertyPuts.push(key);
        return http(204);
      }
      if (String(url).includes('/properties/fairreply.case') && key === 'SUP-OLD') return http(200, { value: stored });
      if (String(url).includes('/properties/fairreply.case')) return http(404);
      if (String(url).includes('/rest/api/3/issue/')) return http(200, issueBody(key));
      return http(500, {});
    });
    const { handler } = await import('../src/schedule');
    await handler();
    expect(propertyPuts).toEqual(missing);
    expect(propertyPuts).not.toContain('SUP-OLD');
    expect(propertyPuts).not.toContain('SUP-OVERFLOW');
    expect(commentReads).not.toContain('SUP-OLD');
    const caseWrites = mocks.kvsSet.mock.calls.filter((call) => call[0] === caseStorageKey('SUP-OLD'));
    expect(caseWrites).toEqual([[caseStorageKey('SUP-OLD'), stored]]);
    expect(mocks.kvsSet.mock.calls.some((call) => call[0] === caseStorageKey('SUP-KEPT'))).toBe(false);
  });

  it('returns an empty at-risk list when the KVS index cannot be read', async () => {
    mocks.kvsGet.mockRejectedValue(new Error('Request principal is not authorized to use storage resource'));
    const { listAtRisk } = await import('../src/actions');
    const result = await listAtRisk({ horizonHours: Number.NaN });
    expect(result.horizonHours).toBe(48);
    expect(result.count).toBe(0);
    expect(result.complaints).toEqual([]);
    expect(result.error).toMatch(/not authorized/i);
  });
});
