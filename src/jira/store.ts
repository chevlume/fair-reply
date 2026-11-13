import { asApp, route } from '@forge/api';
import { FAIR_REPLY_PROPERTY_KEY, caseStorageKey, KVS_INDEX_KEY, type FairReplyCase } from '../case/types';
import { adfToText, normalizeJiraComment, type NormalizedComment } from '../workflow/validate';

export interface IssueContent {
  key: string;
  summary: string;
  description: string;
  created: string;
}

interface IssueResponse {
  key?: string;
  fields?: {
    summary?: string;
    description?: unknown;
    created?: string;
  };
}

interface CommentListResponse {
  startAt?: number;
  maxResults?: number;
  total?: number;
  comments?: Array<{
    body?: unknown;
    jsdPublic?: boolean;
    author?: { accountType?: string };
    visibility?: unknown;
  }>;
}

export interface RecentIssue {
  key: string;
  hasCase: boolean;
}

/** One bounded JQL page. `hasCase` is true only when the search result includes `fairreply.case`. */
export async function findRecentIssues(jql: string, maxResults: number): Promise<RecentIssue[]> {
  const response = await asApp().requestJira(route`/rest/api/3/search/jql`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jql,
      maxResults,
      fields: ['summary'],
      properties: [FAIR_REPLY_PROPERTY_KEY],
    }),
  });
  if (!response.ok) throw new Error(`Could not search recent issues (${response.status})`);
  const body = (await response.json()) as {
    issues?: Array<{ key?: string; properties?: Record<string, unknown> | null }>;
  };
  const rows: RecentIssue[] = [];
  for (const issue of body.issues ?? []) {
    if (!issue.key) continue;
    const properties = issue.properties;
    const stored = properties && !Array.isArray(properties) ? properties[FAIR_REPLY_PROPERTY_KEY] : undefined;
    rows.push({ key: issue.key, hasCase: stored != null });
  }
  return rows;
}

export async function fetchIssue(issueKey: string): Promise<IssueContent | null> {
  const response = await asApp().requestJira(route`/rest/api/3/issue/${issueKey}?fields=summary,description,created`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Could not read ${issueKey} (${response.status})`);
  const body = (await response.json()) as IssueResponse;
  return {
    key: body.key ?? issueKey,
    summary: body.fields?.summary ?? '',
    description: typeof body.fields?.description === 'string' ? body.fields.description : adfToText(body.fields?.description),
    created: body.fields?.created ?? new Date().toISOString(),
  };
}

export async function fetchComments(issueKey: string): Promise<NormalizedComment[]> {
  const collected: NormalizedComment[] = [];
  let startAt = 0;
  const pageSize = 50;
  for (let page = 0; page < 2; page += 1) {
    const response = await asApp().requestJira(
      route`/rest/api/3/issue/${issueKey}/comment?startAt=${startAt}&maxResults=${pageSize}`,
    );
    if (!response.ok) throw new Error(`Could not read comments on ${issueKey} (${response.status})`);
    const body = (await response.json()) as CommentListResponse;
    const comments = body.comments ?? [];
    collected.push(...comments.map((comment) => normalizeJiraComment(comment)));
    const total = body.total ?? comments.length;
    startAt += comments.length;
    if (startAt >= total || comments.length === 0) break;
  }
  return collected;
}

export async function readCaseProperty(issueKey: string): Promise<FairReplyCase | null> {
  const response = await asApp().requestJira(route`/rest/api/3/issue/${issueKey}/properties/fairreply.case`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Could not read ${FAIR_REPLY_PROPERTY_KEY} (${response.status})`);
  const body = (await response.json()) as { value?: FairReplyCase };
  return body.value ?? null;
}

export async function writeCaseProperty(issueKey: string, record: FairReplyCase): Promise<void> {
  const response = await asApp().requestJira(route`/rest/api/3/issue/${issueKey}/properties/fairreply.case`, {
    method: 'PUT',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(record),
  });
  if (!response.ok) throw new Error(`Could not write ${FAIR_REPLY_PROPERTY_KEY} (${response.status})`);
}

export async function postInternalComment(issueKey: string, text: string): Promise<void> {
  const { textToAdf } = await import('../workflow/validate');
  const response = await asApp().requestJira(route`/rest/api/3/issue/${issueKey}/comment`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      body: textToAdf(text),
      properties: [{ key: 'sd.public.comment', value: { internal: true } }],
    }),
  });
  if (!response.ok) throw new Error(`Could not post an internal comment on ${issueKey} (${response.status})`);
}

export async function mirrorCase(issueKey: string, record: FairReplyCase): Promise<void> {
  const { kvs } = await import('@forge/kvs');
  await kvs.set(caseStorageKey(issueKey), record);
  const index = (await kvs.get<{ issueKeys: string[] }>(KVS_INDEX_KEY)) ?? { issueKeys: [] };
  if (!index.issueKeys.includes(issueKey)) {
    index.issueKeys.push(issueKey);
    await kvs.set(KVS_INDEX_KEY, index);
  }
}

export async function readMirroredCase(issueKey: string): Promise<FairReplyCase | null> {
  const { kvs } = await import('@forge/kvs');
  return (await kvs.get<FairReplyCase>(caseStorageKey(issueKey))) ?? null;
}

export async function listMirroredCases(): Promise<Array<{ issueKey: string; record: FairReplyCase }>> {
  const { kvs } = await import('@forge/kvs');
  const index = (await kvs.get<{ issueKeys: string[] }>(KVS_INDEX_KEY)) ?? { issueKeys: [] };
  const rows: Array<{ issueKey: string; record: FairReplyCase }> = [];
  for (const issueKey of index.issueKeys) {
    const record = await kvs.get<FairReplyCase>(caseStorageKey(issueKey));
    if (record) rows.push({ issueKey, record });
  }
  return rows;
}
