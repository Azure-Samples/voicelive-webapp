import { app } from '@azure/functions';

import { config, getProfile } from './config.js';
import { negotiateControl, sendControl } from './control.js';
import { createEvent } from './graph.js';
import { redactForMeeting } from './guardrails.js';
import { errorResponse, json, readJson } from './http.js';
import { appendMeetingEvent, readMeeting } from './meetingStore.js';
import {
  readMeetingSummary,
  writeMeetingSummary,
} from './meetingStore.js';
import { createMeetingSummary } from './meetingSummary.js';
import { createOpenApi } from './openapi.js';
import {
  createDelegation,
  newDelegationRecord,
  readDelegation,
  writeDelegation,
} from './delegationStore.js';
import { MediaHostClient } from './mediaHostClient.js';
import type { MeetingEvent } from './types.js';

const mediaHost = new MediaHostClient(
  config.unattendedMediaHostBaseUrl,
  config.unattendedMediaHostKey,
);

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

app.http('meetingSummary', {
  methods: ['POST'],
  authLevel: 'function',
  route: 'tools/meeting-summary',
  handler: async request => {
    try {
      const body = await readJson<{
        profileId: string;
        sessionId: string;
      }>(request);
      getProfile(body.profileId);
      const summary = await readMeetingSummary(body.sessionId);
      return json(
        summary
          ? { status: 'ok', summary }
          : { status: 'not_found', sessionId: body.sessionId },
      );
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

app.http('meetingFinalize', {
  methods: ['POST'],
  authLevel: 'function',
  route: 'bridge/finalize',
  handler: async request => {
    try {
      const body = await readJson<{
        profileId: string;
        sessionId: string;
      }>(request);
      getProfile(body.profileId);
      const events = await readMeeting(body.sessionId);
      const summary = createMeetingSummary(
        body.sessionId,
        body.profileId,
        events,
      );
      await writeMeetingSummary(summary);
      return json({ status: 'ok', summary });
    } catch (error) {
      return errorResponse(error);
    }
  },
});

app.http('createDelegation', {
  methods: ['POST'],
  authLevel: 'function',
  route: 'delegations',
  handler: async request => {
    try {
      if (!mediaHost.configured) {
        return json(
          { error: 'The unattended media host is not configured.' },
          501,
        );
      }
      const body = await readJson<{
        clientRequestId: string;
        profileId: string;
        meetingJoinUrl: string;
        meetingBrief?: string;
      }>(request);
      getProfile(body.profileId);
      if (
        typeof body.clientRequestId !== 'string' ||
        !/^[a-zA-Z0-9_.:-]{8,128}$/.test(body.clientRequestId)
      ) {
        throw new Error(
          'clientRequestId must contain 8 to 128 safe characters.',
        );
      }
      const meetingUrl = new URL(body.meetingJoinUrl);
      if (
        meetingUrl.protocol !== 'https:' ||
        !(
          meetingUrl.hostname === 'teams.microsoft.com' ||
          meetingUrl.hostname.endsWith('.teams.microsoft.com')
        )
      ) {
        throw new Error('meetingJoinUrl must be a Microsoft Teams URL.');
      }
      const record = newDelegationRecord({
        clientRequestId: body.clientRequestId,
        profileId: body.profileId,
        meetingJoinUrl: meetingUrl.toString(),
        meetingBrief:
          typeof body.meetingBrief === 'string'
            ? body.meetingBrief.trim().slice(0, 4_000)
            : '',
      });
      const stored = await createDelegation(record);
      if (!stored.created) {
        return json(stored.record);
      }
      try {
        record.mediaHostCallId = await mediaHost.start(record);
        record.status = 'active';
      } catch (error) {
        record.status = 'failed';
        record.error =
          error instanceof Error ? error.message : 'Media host failed.';
      }
      await writeDelegation(record);
      return json(record, record.status === 'active' ? 202 : 502);
    } catch (error) {
      return errorResponse(error);
    }
  },
});

app.http('getDelegation', {
  methods: ['GET'],
  authLevel: 'function',
  route: 'delegations/{id}',
  handler: async request => {
    try {
      const record = await readDelegation(request.params.id);
      return record
        ? json(record)
        : json({ error: 'Delegation not found.' }, 404);
    } catch (error) {
      return errorResponse(error);
    }
  },
});

app.http('cancelDelegation', {
  methods: ['DELETE'],
  authLevel: 'function',
  route: 'delegations/{id}',
  handler: async request => {
    try {
      const record = await readDelegation(request.params.id);
      if (!record) {
        return json({ error: 'Delegation not found.' }, 404);
      }
      if (record.status === 'cancelled' || record.status === 'completed') {
        return json(record);
      }
      record.status = 'cancelling';
      await writeDelegation(record);
      if (record.mediaHostCallId) {
        await mediaHost.cancel(record.mediaHostCallId);
      }
      record.status = 'cancelled';
      await writeDelegation(record);
      return json(record);
    } catch (error) {
      return errorResponse(error);
    }
  },
});
