import { draftAcknowledgement } from '../case/analyse';
import type { FairReplyCase } from '../case/types';

export interface InternalDraftNote {
  ok: true;
  body: string;
}

export interface InternalDraftRefusal {
  ok: false;
  error: string;
}

/**
 * Text for an internal Jira note. It is the acknowledgement draft plus a line
 * that the note was not sent to the customer.
 */
export function internalDraftNote(record: FairReplyCase | null, issueKey: string): InternalDraftNote | InternalDraftRefusal {
  if (!record) return { ok: false, error: 'No Fair Reply case is stored yet.' };
  if (!record.isComplaint) return { ok: false, error: 'This request is not a complaint, so there is no acknowledgement to file.' };
  const draft = draftAcknowledgement(record, issueKey);
  return {
    ok: true,
    body: [
      'Internal copy of the acknowledgement draft. This note was not sent to the customer.',
      '',
      draft.text,
      '',
      draft.agentNote,
    ].join('\n'),
  };
}
