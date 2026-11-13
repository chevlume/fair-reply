export type FilingLanguage = 'es' | 'en';

/** Accents and inverted marks. Checked on the original text, not a folded copy. */
const SPANISH_MARK = /[áéíóúüñ¿¡]/i;
const SPANISH_WORDS = /\b(el|la|los|las|un|una|que|del|por|para|con|es|en|os|le|lo|su|sus|al|como|pero|porque|también|esta|este|hay|sobre|desde|de)\b/gi;
const ENGLISH_WORDS = /\b(the|and|of|to|for|with|this|that|from|your|you|we|have|has|been|is|are|was|were|not|but|if|it|they|their|our|about)\b/gi;

/**
 * Conservative Spanish-versus-English guess.
 * Both signals, or too little of either, means unclear.
 */
export function guessLanguage(text: string): FilingLanguage | null {
  const raw = text.trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  const spanishWords = lower.match(SPANISH_WORDS)?.length ?? 0;
  const englishWords = lower.match(ENGLISH_WORDS)?.length ?? 0;
  const spanish = SPANISH_MARK.test(raw) || spanishWords >= 2;
  const english = englishWords >= 2;
  if (spanish === english) return null;
  return spanish ? 'es' : 'en';
}

export const ARTICLE_136_REMINDER =
  'The covering reply should be in the same language as the filing (article 13.6). Fair Reply does not translate or send the reply. A missing match does not by itself block Resolve. Decision support, not legal advice.';

/** Reminder only. It does not un-answer a point and it does not block Resolve. */
export function article136Reminder(record: {
  isComplaint: boolean;
  filingLanguage?: FilingLanguage | null;
  analysedPublicComments?: string[];
}): string | null {
  if (!record.isComplaint || !record.filingLanguage) return null;
  const replies = (record.analysedPublicComments ?? []).join('\n').trim();
  if (!replies) return null;
  const replyLanguage = guessLanguage(replies);
  if (!replyLanguage || replyLanguage === record.filingLanguage) return null;
  return ARTICLE_136_REMINDER;
}
