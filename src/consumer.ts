import { consume } from './runtime';

export async function handler(event: { body?: { issueKey: string; eventType?: string } }): Promise<void> {
  await consume(event);
}
