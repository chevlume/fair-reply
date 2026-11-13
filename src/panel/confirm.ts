/** Why the confirm buttons are disabled. A blank reason is the only reason before a click. */
export function confirmButtonHint(reason: string, busy: boolean): { disabled: boolean; hint: string | null } {
  if (!reason.trim()) return { disabled: true, hint: 'Write a reason to enable' };
  if (busy) return { disabled: true, hint: 'Saving this decision.' };
  return { disabled: false, hint: null };
}

/** UI Kit TextArea passes an input event. Some payloads pass the string itself. */
export function readTextAreaValue(event: unknown): string {
  if (typeof event === 'string') return event;
  if (!event || typeof event !== 'object') return '';
  const record = event as { value?: unknown; target?: { value?: unknown } };
  if (typeof record.target?.value === 'string') return record.target.value;
  if (typeof record.value === 'string') return record.value;
  return '';
}
