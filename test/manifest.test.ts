import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

function collectDescriptions(value: unknown, found: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectDescriptions(item, found);
    return found;
  }
  if (!value || typeof value !== 'object') return found;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'description' && typeof child === 'string') found.push(child);
    else collectDescriptions(child, found);
  }
  return found;
}

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'uploads' || entry === '.git') continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, files);
    else files.push(full);
  }
  return files;
}

describe('manifest', () => {
  const manifest = readFileSync('manifest.yml', 'utf8');

  it('declares the Forge modules from the audit', () => {
    for (const token of [
      'jira:issuePanel',
      'avi:jira:created:issue',
      'avi:jira:commented:issue',
      'avi:jira:updated:issue',
      'consumer:',
      'queue: fair-reply-queue',
      'jira:workflowValidator',
      'scheduledTrigger:',
      'interval: fiveMinute',
      'rovo:agent:',
      'name: Complaints Officer',
      'get-complaint-status',
      'list-at-risk-complaints',
      'check-reply-coverage',
      'draft-acknowledgement',
      'actionVerb: GET',
      'render: native',
      'ignoreSelf: true',
      'timeoutSeconds: 120',
      'llm:',
      'claude',
    ]) {
      expect(manifest, token).toContain(token);
    }
    expect(manifest).toContain('https://developer.atlassian.com/platform/forge/manifest-reference/modules/');
  });

  it('keeps function keys inside the 23 character limit', () => {
    const keys = [...manifest.matchAll(/^\s*- key: ([a-z0-9-]+)$/gm)].map((match) => match[1]);
    const functionKeys = ['panel-resolver', 'enqueue-issue', 'consume-case', 'validate-reply', 'remind-deadlines', 'rovo-status', 'rovo-at-risk', 'rovo-coverage', 'rovo-draft'];
    for (const key of functionKeys) {
      expect(keys).toContain(key);
      expect(key.length).toBeLessThanOrEqual(23);
    }
    expect('Complaints Officer'.length).toBeLessThanOrEqual(30);
  });

  it('declares storage:app because the case mirror uses @forge/kvs', () => {
    const doc = parse(manifest) as { permissions?: { scopes?: string[] } };
    expect(doc.permissions?.scopes).toContain('storage:app');
    expect(readFileSync('src/jira/store.ts', 'utf8')).toContain('@forge/kvs');
  });

  it('keeps every description at or under 255 characters after YAML folding', () => {
    const descriptions = collectDescriptions(parse(manifest));
    expect(descriptions.length).toBeGreaterThan(0);
    for (const description of descriptions) {
      expect(description.length, description).toBeLessThanOrEqual(255);
    }
  });
});

describe('public identity', () => {
  it('does not contain personal names or tool authorship', () => {
    const files = walk(process.cwd()).filter((file) => !file.includes(`${path.sep}node_modules${path.sep}`) && !file.endsWith('package-lock.json'));
    const fromCodes = (...codes: number[]) => new RegExp(String.fromCharCode(...codes), 'i');
    const forbidden = [
      fromCodes(106, 117, 108, 105, 111),
      fromCodes(116, 111, 114, 105, 106, 97),
      fromCodes(99, 117, 114, 115, 111, 114, 97, 103, 101, 110, 116),
      fromCodes(99, 111, 45, 97, 117, 116, 104, 111, 114, 101, 100, 45, 98, 121),
      new RegExp(`\\b${String.fromCharCode(99, 117, 114, 115, 111, 114)}\\b`, 'i'),
    ];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const pattern of forbidden) {
        expect(text, `${file} matches ${pattern}`).not.toMatch(pattern);
      }
    }
  });
});
