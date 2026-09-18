import { describe, expect, it } from 'vitest';

import { createMeetingSummary } from './meetingSummary.js';
import type { StoredMeetingEvent } from './types.js';

describe('createMeetingSummary', () => {
  it('creates an idempotent extractive meeting summary', () => {
    const events: StoredMeetingEvent[] = [
      {
        sessionId: 'session-123',
        profileId: 'executive-1',
        speaker: 'participant',
        text: 'We agreed to launch the pilot.',
        occurredAt: '2026-09-17T09:00:00.000Z',
        directedAtOwner: false,
        mentionsOwner: false,
      },
      {
        sessionId: 'session-123',
        profileId: 'executive-1',
        speaker: 'participant',
        text: 'Andy will send the revised plan by end of Friday.',
        occurredAt: '2026-09-17T09:01:00.000Z',
        directedAtOwner: false,
        mentionsOwner: false,
      },
      {
        sessionId: 'session-123',
        profileId: 'executive-1',
        speaker: 'participant',
        text: 'Executive, should the pilot include Japan?',
        occurredAt: '2026-09-17T09:02:00.000Z',
        directedAtOwner: true,
        mentionsOwner: true,
      },
    ];

    const summary = createMeetingSummary(
      'session-123',
      'executive-1',
      events,
      '2026-09-17T10:00:00.000Z',
    );

    expect(summary.transcriptEventCount).toBe(3);
    expect(summary.decisions).toHaveLength(1);
    expect(summary.actionItems).toHaveLength(1);
    expect(summary.openQuestions).toHaveLength(1);
    expect(summary.executiveMentions).toHaveLength(1);
    expect(summary.overview).toHaveLength(3);
  });

  it('deduplicates repeated transcript statements', () => {
    const event: StoredMeetingEvent = {
      sessionId: 'session-123',
      profileId: 'executive-1',
      speaker: 'participant',
      text: 'We approved the plan.',
      occurredAt: '2026-09-17T09:00:00.000Z',
      directedAtOwner: false,
      mentionsOwner: false,
    };
    const summary = createMeetingSummary(
      'session-123',
      'executive-1',
      [event, { ...event, occurredAt: '2026-09-17T09:01:00.000Z' }],
    );
    expect(summary.decisions).toHaveLength(1);
    expect(summary.overview).toHaveLength(1);
  });
});
