import Resolver from '@forge/resolver';
import { analyseTicket, applyConfirmation } from './case/analyse';
import { fetchComments, fetchIssue, readCaseProperty } from './jira/store';
import { emptyPanel, errorPanel, panelFromCase, type PanelModel } from './panel/model';
import { persistCase, refreshCaseFromIssue } from './runtime';

const resolver = new Resolver();

function issueKeyFrom(context: unknown): string | null {
  const extension = (context as { extension?: { issue?: { key?: string } } } | undefined)?.extension;
  return extension?.issue?.key ?? null;
}

resolver.define('getPanel', async ({ context }): Promise<PanelModel> => {
  const issueKey = issueKeyFrom(context);
  if (!issueKey) return errorPanel('This panel only opens on a work item.');
  try {
    const stored = await readCaseProperty(issueKey);
    if (!stored) return emptyPanel();
    const record = await refreshCaseFromIssue(issueKey, stored);
    return panelFromCase(record, issueKey);
  } catch (error) {
    return errorPanel(error instanceof Error ? error.message : 'Could not load the case.');
  }
});

resolver.define('confirmComplaint', ({ payload, context }) => setConfirmation(context, 'confirmed', payload));
resolver.define('dismissComplaint', ({ payload, context }) => setConfirmation(context, 'dismissed', payload));

function reasonFrom(payload: unknown): string {
  if (!payload || typeof payload !== 'object' || !('reason' in payload)) return '';
  const reason = (payload as { reason?: unknown }).reason;
  return typeof reason === 'string' ? reason : '';
}

async function setConfirmation(context: unknown, decision: 'confirmed' | 'dismissed', payload: unknown): Promise<PanelModel> {
  const issueKey = issueKeyFrom(context);
  if (!issueKey) return errorPanel('This panel only opens on a work item.');
  const reason = reasonFrom(payload);
  try {
    let record = await readCaseProperty(issueKey);
    if (!reason.trim()) return record ? panelFromCase(record, issueKey) : emptyPanel();
    if (!record) {
      const issue = await fetchIssue(issueKey);
      if (!issue) return errorPanel('The work item could not be read.');
      const comments = await fetchComments(issueKey);
      record = await analyseTicket({
        summary: issue.summary,
        description: issue.description,
        created: issue.created,
        customerComments: comments.filter((comment) => comment.author === 'customer').map((comment) => comment.body),
        agentPublicReplies: comments.filter((comment) => comment.public && comment.author === 'agent').map((comment) => comment.body),
        publicComments: comments.filter((comment) => comment.public).map((comment) => comment.body),
        llmEnabled: false,
      });
    }
    const next = applyConfirmation(record, decision, reason, new Date().toISOString());
    if (next === record) return panelFromCase(record, issueKey);
    await persistCase(issueKey, next);
    return panelFromCase(next, issueKey);
  } catch (error) {
    return errorPanel(error instanceof Error ? error.message : 'Could not update the case.');
  }
}

export const handler = resolver.getDefinitions();
