/** Fold accents so ES/EN rules can match without changing the quoted original. */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export function splitSentences(text: string): string[] {
  const parts = text
    .split(/\n+/)
    .flatMap((block) => block.split(/(?<=[.!?])\s+/));
  const merged: string[] = [];
  for (const part of parts) {
    const previous = merged[merged.length - 1];
    if (previous && previous.endsWith('...')) merged[merged.length - 1] = `${previous} ${part}`;
    else merged.push(part);
  }
  return merged.map((sentence) => sentence.trim()).filter((sentence) => sentence.length > 0);
}
