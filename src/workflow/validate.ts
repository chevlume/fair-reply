import type { FairReplyCase } from '../case/types';
import { explainCoverage, formatCheckedDidNotCover, unansweredPoints } from '../detect/coverage';

export interface NormalizedComment {
  body: string;
  public: boolean;
  author: 'customer' | 'agent';
}

export interface ValidationResult {
  result: boolean;
  errorMessage?: string;
}

const NO_PUBLIC =
  'Resolve/close is blocked. State: Uncovered points. This complaint has no public reply. Decision support only, not legal advice.';

function pointLabel(points: string[], point: string): string {
  return `point ${points.indexOf(point) + 1} (${point})`;
}

function replyChecked(sentence: string | null): string {
  if (!sentence) return 'No public reply was checked.';
  return formatCheckedDidNotCover(sentence);
}

/**
 * Blocks resolve/close when a detected or confirmed complaint still has
 * unanswered points or has no public agent reply.
 * A dismissed case (isComplaint false) is allowed.
 * Pass comments=null when the comment fetch failed; stored flags are used.
 */
export function evaluateClose(record: FairReplyCase | null, comments: NormalizedComment[] | null): ValidationResult {
  if (!record?.isComplaint) return { result: true };

  const liveReplies = comments?.filter((comment) => comment.public && comment.author === 'agent').map((comment) => comment.body) ?? null;
  const hasPublic = liveReplies ? liveReplies.length > 0 : record.hasPublicReply;
  const coverage = liveReplies ? explainCoverage(record.points, liveReplies) : null;
  const answered = coverage ? coverage.map((row) => row.answered) : record.answered;

  const missing = unansweredPoints(record.points, answered);
  const listed = missing.map((point) => {
    const row = coverage?.find((item) => item.point === point);
    return `${pointLabel(record.points, point)}. ${replyChecked(row?.fragment ?? null)}`;
  }).join(' ');

  if (!hasPublic) {
    const open = listed ? ` Still open: ${listed}` : '';
    return { result: false, errorMessage: `${NO_PUBLIC}${open}` };
  }

  if (missing.length === 0) return { result: true };

  return {
    result: false,
    errorMessage:
      `Resolve/close is blocked. State: Uncovered points. ${listed} ` +
      'Each point is covered by the public reply sentence that decides it. A later comment can cover a point an earlier comment left open. Decision support only, not legal advice.',
  };
}

export function normalizeJiraComment(comment: {
  body?: unknown;
  jsdPublic?: boolean;
  author?: { accountType?: string };
  visibility?: unknown;
}): NormalizedComment {
  const author = comment.author?.accountType === 'customer' ? 'customer' : 'agent';
  const restricted = comment.visibility != null;
  const isPublic = comment.jsdPublic !== false && !restricted;
  return {
    body: typeof comment.body === 'string' ? comment.body : adfToText(comment.body),
    public: isPublic,
    author,
  };
}

export function adfToText(node: unknown): string {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (typeof node !== 'object') return '';
  const record = node as { text?: unknown; content?: unknown[] };
  const own = typeof record.text === 'string' ? record.text : '';
  const children = Array.isArray(record.content) ? record.content.map((child) => adfToText(child)).join('') : '';
  return `${own}${children}`.trim();
}

export function textToAdf(text: string): { type: 'doc'; version: 1; content: Array<{ type: 'paragraph'; content: Array<{ type: 'text'; text: string }> }> } {
  const lines = text.split('\n').filter((line) => line.length > 0);
  return {
    type: 'doc',
    version: 1,
    content: (lines.length ? lines : [' ']).map((line) => ({
      type: 'paragraph',
      content: [{ type: 'text', text: line }],
    })),
  };
}
