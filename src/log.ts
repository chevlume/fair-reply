/** One JSON line on stdout so a Forge log can be filtered without guessing. */
export function logInfo(fields: Record<string, unknown>): void {
  console.info(JSON.stringify({ app: 'fair-reply', ...fields }));
}
