import type { ComplaintCategory } from '../legal/assumptions';
import { verifyCitations } from './citations';
import { detectByRules, extractPoints, type Detection } from './rules';

export interface LlmClassification {
  isComplaint: boolean;
  quote: string | null;
  category: ComplaintCategory;
  points: string[];
}

export type LlmComplete = (text: string) => Promise<LlmClassification | null>;

export function isLlmEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.FAIR_REPLY_LLM === 'on';
}

/**
 * Rules always run. Forge LLM is used only when FAIR_REPLY_LLM=on and the
 * rules result is ambiguous. Citations that are not substrings are dropped.
 */
export async function detectHybrid(
  text: string,
  options?: { llmEnabled?: boolean; llmComplete?: LlmComplete },
): Promise<Detection & { pointsFromLlm?: string[] }> {
  const rules = detectByRules(text);
  const enabled = options?.llmEnabled ?? false;
  if (!enabled || !rules.ambiguous || !options?.llmComplete) {
    return rules;
  }

  let llm: LlmClassification | null = null;
  try {
    llm = await options.llmComplete(text);
  } catch {
    return { ...rules, needsHumanReview: true };
  }
  if (!llm) return { ...rules, needsHumanReview: true };

  const quoteCheck = verifyCitations(text, llm.quote ? [llm.quote] : []);
  const pointCheck = verifyCitations(text, llm.points);
  if ((llm.quote && quoteCheck.rejected.length > 0) || pointCheck.rejected.length > 0) {
    return { ...rules, needsHumanReview: true };
  }

  const category = llm.isComplaint ? llm.category : 'none';
  if (llm.isComplaint && category === 'none') {
    return { ...rules, needsHumanReview: true };
  }

  return {
    isComplaint: llm.isComplaint,
    quote: llm.isComplaint ? quoteCheck.accepted[0] ?? null : null,
    category: llm.isComplaint ? category : 'none',
    ambiguous: false,
    needsHumanReview: false,
    engine: 'llm',
    ruleId: rules.ruleId,
    pointsFromLlm: llm.isComplaint ? pointCheck.accepted : [],
  };
}

export function pointsFor(text: string, detection: Detection & { pointsFromLlm?: string[] }): string[] {
  if (detection.pointsFromLlm && detection.pointsFromLlm.length > 0) {
    return detection.pointsFromLlm;
  }
  return extractPoints(text, detection);
}
