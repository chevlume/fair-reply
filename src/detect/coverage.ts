import { fold } from '../text/sentences';

const STOP = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'que', 'del', 'para', 'con', 'por',
  'sus', 'este', 'esta', 'esto', 'esa', 'ese', 'como', 'pero', 'porque', 'cuando', 'donde',
  'desde', 'hasta', 'todo', 'toda', 'todos', 'todas', 'the', 'and', 'for', 'you', 'your',
  'our', 'this', 'that', 'with', 'from', 'have', 'been', 'were', 'they', 'them', 'just',
  'about', 'into', 'over', 'after', 'before', 'there', 'their', 'would', 'could', 'should',
  'estamos', 'hemos', 'tambien', 'tambien', 'same', 'mes', 'dia',
]);

/** Synonym stems. A shared group counts once, even when the surface words differ. */
const GROUPS: readonly string[][] = [
  ['refund', 'reimburse', 'devolv', 'abon', 'reembols', 'credit', 'credito'],
  ['invoice', 'factura', 'recibo', 'billed', 'charged', 'charge', 'cobr', 'cargo'],
  ['water', 'agua'],
  ['electric', 'electricity', 'power', 'luz', 'suministro', 'outage'],
  ['appointment', 'inspection', 'cita', 'revision', 'visita', 'technician', 'tecnico'],
  ['cancel', 'cancellation', 'baja'],
  ['duplicate', 'twice', 'duplic', 'doble', 'dos veces'],
];

function tokens(text: string): string[] {
  return fold(text)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !STOP.has(token));
}

function numbers(text: string): string[] {
  return fold(text).match(/\d+/g) ?? [];
}

function groupsHit(text: string): number[] {
  const folded = fold(text);
  const hits: number[] = [];
  GROUPS.forEach((group, index) => {
    if (group.some((stem) => folded.includes(stem))) hits.push(index);
  });
  return hits;
}

const GENERIC_HOLDING = /\b(gracias por (su|tu|el) mensaje|thanks for your message|thank you for (your|the) message|thank you for writing|agradecemos (su|tu) mensaje|estamos revisando|we are reviewing|we are looking into|lo estamos mirando)\b/;
const MOTIVATED = /\b(porque|ya que|debido a|because)\b/;
const REFUSAL = /\b(cannot|can not|no podemos|will not|deneg\w*|refus\w*|rechaz\w*|no procede)\b/;
const RESULT_AUX = /\b(hemos|queda|quedan|se ha|se han|we have|we've|has been|have been|is|was|were)\b/;
const PRESENT_ECHO = new Set([
  'leemos', 'vemos', 'notamos', 'anotamos', 'recibimos', 'revisamos', 'comprobamos', 'mencionamos',
]);

const ECHO_PARTICIPLE = new Set([
  'leido', 'leida', 'leidos', 'leidas', 'visto', 'vista', 'vistos', 'vistas',
  'notado', 'notada', 'anotado', 'anotada', 'recibido', 'recibida',
  'mencionado', 'mencionada', 'revisado', 'revisada', 'comprobado', 'comprobada',
  'read', 'seen', 'noted', 'received', 'mentioned', 'reviewed', 'checked',
]);

export interface PointCoverage {
  point: string;
  answered: boolean;
  /**
   * The reply sentence that was checked for this point.
   * Coverage may compare clauses inside the sentence, but the reported text is the whole sentence.
   */
  fragment: string | null;
}

/** Citation used only when this sentence covered the point. */
export function formatCoveringReply(sentence: string): string {
  return `The reply checked was: "${sentence}".`;
}

/** A sentence was compared with an open point and did not decide it. */
export function formatCheckedDidNotCover(sentence: string): string {
  return `Checked, did not cover: "${sentence}".`;
}

/** Panel line. The covering citation appears only when the sentence covered the point. */
export function pointReplyLine(answered: boolean, sentence: string | null): string | null {
  if (!sentence) return null;
  return answered ? formatCoveringReply(sentence) : formatCheckedDidNotCover(sentence);
}

/** A bare thank-you or holding line does not answer a point. A specific reason can. */
export function isGenericThanks(reply: string): boolean {
  const folded = fold(reply);
  if (!GENERIC_HOLDING.test(folded)) return false;
  return !(MOTIVATED.test(folded) && REFUSAL.test(folded));
}

interface ReplyClause {
  clause: string;
  sentence: string;
}

/** Clauses are only for matching. `sentence` is the punctuation sentence the reader sees. */
function replyClauses(replies: string[]): ReplyClause[] {
  return replies.flatMap((reply) =>
    reply.split(/(?<=[.!?])\s+/).flatMap((sentence) => {
      const trimmed = sentence.trim();
      if (!trimmed) return [];
      return trimmed
        .split(/\s+\by\b\s+|\s+\band\b\s+/)
        .map((clause) => clause.trim())
        .filter((clause) => clause.length > 0)
        .map((clause) => ({ clause, sentence: trimmed }));
    }),
  );
}

function linkScore(point: string, sentence: string): { tokens: number; groups: number; numbers: number } {
  const pointTokens = new Set(tokens(point));
  const sentenceTokens = new Set(tokens(sentence));
  const sharedTokens = [...pointTokens].filter((token) => sentenceTokens.has(token));
  const sharedNumbers = numbers(point).filter((value) => numbers(sentence).includes(value));
  const sentenceGroups = new Set(groupsHit(sentence));
  const sharedGroups = groupsHit(point).filter((group) => sentenceGroups.has(group));
  return { tokens: sharedTokens.length, groups: sharedGroups.length, numbers: sharedNumbers.length };
}

function relates(point: string, sentence: string): boolean {
  const link = linkScore(point, sentence);
  return link.tokens >= 1 || link.groups >= 1 || link.numbers >= 1;
}

function moneyAmounts(text: string): string[] {
  const folded = fold(text);
  const money = /€|\beur(?:os?)?\b|\b(devolv|abon|reembols|refund|charg|cobr|credit|importe|cargo)\w*\b/.test(folded);
  if (!money) return [];
  return folded.match(/\d+(?:[.,]\d+)?/g)?.map((value) => String(Number(value.replace(',', '.')))) ?? [];
}

/** A money decision binds only to the point that names the same amount. */
function amountConflict(point: string, sentence: string): boolean {
  const sentenceAmounts = moneyAmounts(sentence);
  if (sentenceAmounts.length === 0) return false;
  const pointAmounts = moneyAmounts(point);
  return pointAmounts.filter((amount) => sentenceAmounts.includes(amount)).length === 0;
}

/** A decision covers a point only when it is tied to that point, not to a neighbouring noun or a different amount. */
function covers(point: string, sentence: string): boolean {
  if (!hasDecision(sentence) || amountConflict(point, sentence)) return false;
  const link = linkScore(point, sentence);
  if (link.tokens >= 2) return true;
  if (link.numbers >= 1 && (link.groups >= 1 || link.tokens >= 1)) return true;
  if (link.tokens >= 1 && link.groups >= 1) return true;
  return false;
}

/** Participle governed by an auxiliary, not an adjective copied later in the sentence. */
function governedParticiples(folded: string): string[] {
  const pattern = /\b(?:hemos|se ha|se han)\s+([a-z]+)\b|\bquedan?\s+([a-z]+)\b|\b(?:we have|we've|has been|have been)\s+([a-z]+)\b|\b(?:is|was|were)\s+([a-z]+)\b/g;
  const found: string[] = [];
  for (const match of folded.matchAll(pattern)) {
    const word = match.slice(1).find((group) => group);
    if (word) found.push(word);
  }
  return found;
}

/** The same motivated-refusal test coverage already uses for a decision. Not a second verb list. */
export function isMotivatedRefusal(sentence: string): boolean {
  const folded = fold(sentence);
  return MOTIVATED.test(folded) && REFUSAL.test(folded);
}

const EXTRAJUDICIAL_ROUTE = /\b(ley\s*7\s*\/\s*2017|extrajudicial\w*|dispute[-\s]resolution|sistemas?\s+extrajudicial\w*|organismos?\s+acreditad\w*|organismos?\s+sectorial\w*|sectoral\s+bod\w*|accredited\s+bod\w*|how\s+to\s+access|como\s+acceder)\b/;

/** Whether this text names extrajudicial routes or how to reach them. Does not validate a real body. */
export function mentionsExtrajudicialRoutes(text: string): boolean {
  return EXTRAJUDICIAL_ROUTE.test(fold(text));
}

export const ARTICLE_137_REMINDER =
  'This covering reply looks like a refusal. If the company does not grant what the customer asked, article 13.7 requires the resolution to name the extrajudicial dispute-resolution systems the customer can use and how to access them. Fair Reply does not invent those bodies. This is not legal advice. Missing that information does not by itself block Resolve.';

/** Reminder only. It does not un-answer a point and it does not block Resolve. */
export function article137Reminder(record: {
  isComplaint: boolean;
  points: string[];
  answered: boolean[];
  replyFragments?: Array<string | null>;
  analysedPublicComments?: string[];
}): string | null {
  if (!record.isComplaint) return null;
  const replyContext = (record.analysedPublicComments ?? []).join('\n');
  const gap = record.points.some((_, index) => {
    if (!record.answered[index]) return false;
    const sentence = record.replyFragments?.[index];
    if (!sentence || !isMotivatedRefusal(sentence)) return false;
    return !mentionsExtrajudicialRoutes(sentence) && !mentionsExtrajudicialRoutes(replyContext);
  });
  return gap ? ARTICLE_137_REMINDER : null;
}

/** A decision is a governed result (not "we have read/seen/noted") or a refusal that gives a reason. */
export function hasDecision(sentence: string): boolean {
  if (!sentence.trim()) return false;
  const folded = fold(sentence);
  if (isMotivatedRefusal(sentence)) return true;
  const presentResult = folded.split(/[^a-z]+/).some((word) => /(amos|emos|imos)$/.test(word) && word.length > 5 && !PRESENT_ECHO.has(word));
  if (presentResult) return true;
  if (!RESULT_AUX.test(folded)) return false;
  return governedParticiples(folded).some((word) => word.length > 4 && /(ado|ada|ido|ida|ed)$/.test(word) && !ECHO_PARTICIPLE.has(word));
}

/**
 * Maps each customer point to the reply sentence that was checked.
 * Every public comment is searched. A later comment can cover a point an earlier comment left open.
 * The fragment is the sentence from the comment that decided the point, or the related sentence that did not.
 * Answered only when that sentence decides the point, not when it repeats the nouns.
 */
export function explainCoverage(points: string[], replies: string[]): PointCoverage[] {
  const clauses = replyClauses(replies);
  return points.map((point) => {
    const related = clauses
      .filter((item) => relates(point, item.clause))
      .sort((left, right) => {
        const leftScore = linkScore(point, left.clause);
        const rightScore = linkScore(point, right.clause);
        return (rightScore.tokens * 3 + rightScore.numbers * 2 + rightScore.groups)
          - (leftScore.tokens * 3 + leftScore.numbers * 2 + leftScore.groups);
      });
    const deciding = related.find((item) => covers(point, item.clause)) ?? null;
    const checked = deciding ?? related[0] ?? null;
    return { point, answered: Boolean(deciding), fragment: checked?.sentence ?? null };
  });
}

export function pointIsAnswered(point: string, reply: string): boolean {
  return explainCoverage([point], [reply])[0]?.answered ?? false;
}

export function assessCoverage(points: string[], replies: string[]): boolean[] {
  return explainCoverage(points, replies).map((row) => row.answered);
}

export function unansweredPoints(points: string[], answered: boolean[]): string[] {
  return points.filter((_, index) => !answered[index]);
}
