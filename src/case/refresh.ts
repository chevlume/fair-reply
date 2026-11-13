import { analyseTicket, type TicketInput } from './analyse';
import type { FairReplyCase } from './types';

/** True when live public comments are not the bodies already stored on the case. */
export function publicRepliesNeedRefresh(record: FairReplyCase, livePublicComments: string[]): boolean {
  const stored = record.analysedPublicComments;
  if (!stored) return livePublicComments.length > 0 || record.hasPublicReply;
  if (stored.length !== livePublicComments.length) return true;
  return stored.some((text, index) => text !== livePublicComments[index]);
}

/**
 * Re-analyse only when public agent replies changed.
 * Does not post a comment, send a customer reply, or write a reminder.
 */
export async function refreshStoredCase(
  record: FairReplyCase,
  live: Pick<TicketInput, 'summary' | 'description' | 'created' | 'customerComments' | 'agentPublicReplies' | 'publicComments'>,
): Promise<{ record: FairReplyCase; refreshed: boolean }> {
  const publicComments = live.publicComments ?? live.agentPublicReplies ?? [];
  if (!publicRepliesNeedRefresh(record, publicComments)) return { record, refreshed: false };
  const next = await analyseTicket({
    summary: live.summary,
    description: live.description,
    created: live.created,
    customerComments: live.customerComments,
    agentPublicReplies: live.agentPublicReplies ?? [],
    publicComments,
    previous: record,
    llmEnabled: false,
  });
  return { record: next, refreshed: true };
}
