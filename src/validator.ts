import { analyseTicket } from './case/analyse';
import { fetchComments, fetchIssue, readCaseProperty } from './jira/store';
import { persistCase } from './runtime';
import { stampValidatorSeen } from './workflow/resolutionWatch';
import { evaluateClose, type NormalizedComment } from './workflow/validate';

/**
 * Workflow validator. Fails the transition when a detected or confirmed
 * complaint still has unanswered points or has no public reply.
 * Never calls @forge/llm.
 */
export async function handler(args: { issue?: { key?: string } }): Promise<{ result: boolean; errorMessage?: string }> {
  const issueKey = args?.issue?.key;
  if (!issueKey) return { result: true };

  try {
    const existing = await readCaseProperty(issueKey);
    let record = existing;
    let comments: NormalizedComment[] | null = null;
    try {
      comments = await fetchComments(issueKey);
    } catch (error) {
      console.warn('Fair Reply could not read comments during validation', error);
      comments = null;
    }

    if (!record) {
      const issue = await fetchIssue(issueKey);
      if (!issue) return { result: true };
      record = await analyseTicket({
        summary: issue.summary,
        description: issue.description,
        created: issue.created,
        customerComments: (comments ?? []).filter((comment) => comment.author === 'customer').map((comment) => comment.body),
        agentPublicReplies: (comments ?? []).filter((comment) => comment.public && comment.author === 'agent').map((comment) => comment.body),
        llmEnabled: false,
      });
      try {
        await persistCase(issueKey, record);
      } catch (error) {
        console.warn('Fair Reply could not store the case during validation', error);
      }
    }

    const decision = evaluateClose(record, comments);
    if (existing) {
      try {
        await persistCase(issueKey, stampValidatorSeen(existing, new Date().toISOString()));
      } catch (error) {
        console.warn('Fair Reply could not record that the validator ran', error);
      }
    }
    return decision;
  } catch (error) {
    console.warn('Fair Reply validator failed open because the case could not be read', error);
    return { result: true };
  }
}
