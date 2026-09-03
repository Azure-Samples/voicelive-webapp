import type { ExecutiveProfile } from './types.js';

const DEFAULT_TERMS = [
  'hr case',
  'hr matter',
  'human resources',
  'personnel matter',
  'performance review',
  'performance improvement',
  'pip',
  'disciplinary',
  'grievance',
  'termination',
  'terminated',
  'fired',
  'laid off',
  'layoff',
  'redundancy',
  'severance',
  'misconduct',
  'harassment complaint',
  'compensation',
  'salary',
  'bonus',
  'stock grant',
  'offer letter',
  'lawsuit',
  'litigation',
  'settlement',
  'subpoena',
  'medical leave',
  'medical condition',
  'diagnosis',
  'cancer',
  'pregnant',
  'pregnancy',
  'surgery',
  'medical treatment',
  'medication',
  'prescription',
  'therapy',
  'illness',
  'disease',
  'disability accommodation',
  'mental health',
  'visa case',
  'immigration case',
  'green card',
  'work permit',
];

const PII_PATTERNS = [
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
  /(?<!\d)(?:\+?\d[\s-]?)?(?:\(?\d{3}\)?[\s-]?)\d{3}[\s-]?\d{4}(?!\d)/,
  /\b\d{3}-\d{2}-\d{4}\b/,
  /\b(?:\d[ -]?){13,16}\b/,
  /\bcase\s*#?\s*\d{3,}\b/i,
  /\b\d{1,6}\s+(?:[A-Za-z0-9.'-]+\s+){0,5}(?:street|st|road|rd|avenue|ave|boulevard|blvd|lane|ln|drive|dr|court|ct|way|parkway|pkwy)\b/i,
];

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isSensitive(
  text: string,
  profile: ExecutiveProfile,
): boolean {
  if (PII_PATTERNS.some(pattern => pattern.test(text))) {
    return true;
  }
  const terms = [
    ...DEFAULT_TERMS,
    ...profile.confidentialTerms,
    ...profile.sensitiveProjects,
  ].filter(Boolean);
  if (terms.length === 0) {
    return false;
  }
  const expression = new RegExp(
    `(^|[^a-z0-9])(${terms.map(escapeRegex).join('|')})([^a-z0-9]|$)`,
    'i',
  );
  return expression.test(text);
}

export function redactForMeeting(
  text: string,
  profile: ExecutiveProfile,
): { text: string; removed: number } {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const kept = sentences.filter(sentence => !isSensitive(sentence, profile));
  return {
    text:
      kept.join(' ').trim() ||
      "I don't have anything shareable on that for this meeting.",
    removed: sentences.length - kept.length,
  };
}
