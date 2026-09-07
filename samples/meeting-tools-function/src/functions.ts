import { app } from '@azure/functions';

import { getProfile } from './config.js';
import { negotiateControl, sendControl } from './control.js';
import { createEvent } from './graph.js';
import { redactForMeeting } from './guardrails.js';
import { errorResponse, json, readJson } from './http.js';
import { appendMeetingEvent, readMeeting } from './meetingStore.js';
import { createOpenApi } from './openapi.js';
import type { MeetingEvent } from './types.js';

app.http('health', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'health',
  handler: async () => json({ status: 'ok' }),
});

app.http('openapi', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'openapi.json',
  handler: async request =>
    json(createOpenApi(new URL(request.url).origin)),
});

app.http('evaluateDisclosure', {
  methods: ['POST'],
  authLevel: 'function',
  route: 'tools/evaluate-disclosure',
  handler: async request => {
    try {
      const body = await readJson<{ profileId: string; text: string }>(request);
      const result = redactForMeeting(body.text || '', getProfile(body.profileId));
      return json({
        status: result.removed > 0 ? 'blocked' : 'ok',
        shareableText: result.text,
        removedSegments: result.removed,
      });
    } catch (error) {
      return errorResponse(error);
    }
  },
});

app.http('meetingControl', {
  methods: ['POST'],
  authLevel: 'function',
  route: 'tools/meeting-control',
  handler: async request => {
    try {
      const body = await readJson<{
        sessionId: string;
        action: 'raise_hand' | 'lower_hand';
        reason?: string;
      }>(request);
      if (!['raise_hand', 'lower_hand'].includes(body.action)) {
        throw new Error('The meeting control action is invalid.');
      }
      await sendControl(body.sessionId, body.action, body.reason);
      return json({ status: 'ok', action: body.action });
    } catch (error) {
      return errorResponse(error);
    }
  },
});

app.http('createCalendarEvent', {
  methods: ['POST'],
  authLevel: 'function',
  route: 'tools/create-event',
  handler: async request => {
    try {
      const body = await readJson<
        Parameters<typeof createEvent>[1] & { profileId: string }
      >(request);
      return json(await createEvent(getProfile(body.profileId), body));
    } catch (error) {
      return errorResponse(error);
    }
  },
});

app.http('meetingRecap', {
  methods: ['POST'],
  authLevel: 'function',
  route: 'tools/meeting-recap',
  handler: async request => {
    try {
      const body = await readJson<{
        profileId: string;
        sessionId: string;
      }>(request);
      getProfile(body.profileId);
      const events = await readMeeting(body.sessionId);
      return json({
        status: events.length ? 'ok' : 'not_found',
        sessionId: body.sessionId,
        addressed: events.filter(event => event.directedAtOwner),
        mentions: events.filter(
          event => event.mentionsOwner && !event.directedAtOwner,
        ),
        transcript: events,
      });
    } catch (error) {
      return errorResponse(error);
    }
  },
});

app.http('oofCatchup', {
  methods: ['POST'],
  authLevel: 'function',
  route: 'tools/oof-catchup',
  handler: async request => {
    try {
      const body = await readJson<{ days?: number }>(request);
      const days = Math.min(Math.max(body.days ?? 14, 1), 30);
      return json({
        status: 'ok',
        days,
        guidance: [
          `Gather the last ${days} days using meeting recap or memory plus live Microsoft 365 read tools.`,
          'Lead with action-now items: exact ask, requester, and deadline.',
          'Then summarize decisions and changes, followed by brief FYIs.',
          'Cross-check old mentions against current tasks, unread messages, and calendar state so resolved work is not presented as still open.',
          'Deduplicate repeated mentions and offer to drill into any item.',
        ],
      });
    } catch (error) {
      return errorResponse(error);
    }
  },
});

app.http('controlNegotiate', {
  methods: ['POST'],
  authLevel: 'function',
  route: 'bridge/negotiate',
  handler: async request => {
    try {
      const body = await readJson<{ sessionId: string }>(request);
      return json({ url: await negotiateControl(body.sessionId) });
    } catch (error) {
      return errorResponse(error);
    }
  },
});

app.http('meetingEvents', {
  methods: ['POST'],
  authLevel: 'function',
  route: 'bridge/events',
  handler: async request => {
    try {
      const event = await readJson<MeetingEvent>(request);
      const stored = await appendMeetingEvent(
        event,
        getProfile(event.profileId),
      );
      return json({ status: 'ok', event: stored });
    } catch (error) {
      return errorResponse(error);
    }
  },
});
