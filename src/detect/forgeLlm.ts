import { isLlmEnabled } from './hybrid';
import type { LlmComplete } from './hybrid';

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';

/**
 * Builds a Forge LLM client. The dynamic import of @forge/llm runs only after
 * the enable flag is checked, so the default path never calls the package.
 * Calls are billed to the app developer. There is no free quota.
 */
export async function createForgeLlmClient(env: NodeJS.ProcessEnv = process.env): Promise<LlmComplete> {
  if (!isLlmEnabled(env)) {
    throw new Error('Forge LLM is off. Set FAIR_REPLY_LLM=on before calling @forge/llm.');
  }
  const { chat } = await import('@forge/llm');
  return async (text: string) => {
    const response = await chat({
      model: HAIKU_MODEL,
      temperature: 0,
      max_completion_tokens: 800,
      messages: [
        {
          role: 'system',
          content:
            'You classify customer support text. Reply with JSON only: {"isComplaint":boolean,"quote":string|null,"category":"general"|"billing"|"outage"|"none","points":string[]}. ' +
            'quote and every point MUST be copied verbatim from the user text. Do not give legal advice. If unsure, set isComplaint to false.',
        },
        { role: 'user', content: text },
      ],
    });
    const raw = messageText(response.choices?.[0]?.message?.content);
    return parseLlmJson(raw);
  };
}

function messageText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (part && typeof part === 'object' && 'text' in part ? String((part as { text: unknown }).text) : ''))
      .join('');
  }
  return '';
}

export function parseLlmJson(raw: string): {
  isComplaint: boolean;
  quote: string | null;
  category: 'general' | 'billing' | 'outage' | 'none';
  points: string[];
} | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as {
      isComplaint?: boolean;
      quote?: string | null;
      category?: string;
      points?: unknown;
    };
    const category = parsed.category;
    if (category !== 'general' && category !== 'billing' && category !== 'outage' && category !== 'none') {
      return null;
    }
    const points = Array.isArray(parsed.points) ? parsed.points.filter((point): point is string => typeof point === 'string') : [];
    return {
      isComplaint: Boolean(parsed.isComplaint),
      quote: typeof parsed.quote === 'string' ? parsed.quote : null,
      category,
      points,
    };
  } catch {
    return null;
  }
}
