/**
 * Every cited string must be a literal substring of the ticket text.
 * Generated quotes that are not in the source are rejected.
 */
export function verifyCitations(source: string, citations: string[]): { accepted: string[]; rejected: string[] } {
  const accepted: string[] = [];
  const rejected: string[] = [];
  for (const citation of citations) {
    const trimmed = citation.trim();
    if (trimmed && source.includes(trimmed)) accepted.push(trimmed);
    else rejected.push(citation);
  }
  return { accepted, rejected };
}
