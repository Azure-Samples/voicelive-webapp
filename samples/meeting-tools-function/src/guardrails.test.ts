import { describe, expect, it } from 'vitest';

import { isSensitive, redactForMeeting } from './guardrails.js';
import type { ExecutiveProfile } from './types.js';

const profile: ExecutiveProfile = {
  id: 'exec',
  ownerName: 'Executive',
  ownerUserId: 'owner-id',
  confidentialTerms: ['secret launch'],
  sensitiveProjects: ['Project Cobalt'],
};

describe('meeting guardrails', () => {
  it('blocks confidential and PII content', () => {
    expect(isSensitive('The salary review is tomorrow.', profile)).toBe(true);
    expect(isSensitive('Email her at person@example.com.', profile)).toBe(true);
    expect(isSensitive('Project Cobalt launches Friday.', profile)).toBe(true);
  });

  it('keeps shareable sentences and drops sensitive ones', () => {
    const result = redactForMeeting(
      'The public launch is Friday. Her salary review is tomorrow.',
      profile,
    );

    expect(result.text).toBe('The public launch is Friday.');
    expect(result.removed).toBe(1);
  });

  it('removes medical and street-address details', () => {
    const result = redactForMeeting(
      'Alice is being treated for cancer. Alice lives at 123 Main Street. The project review is Tuesday.',
      profile,
    );

    expect(result.text).toBe('The project review is Tuesday.');
    expect(result.removed).toBe(2);
  });
});
