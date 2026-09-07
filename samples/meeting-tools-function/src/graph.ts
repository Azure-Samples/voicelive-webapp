import { DefaultAzureCredential } from '@azure/identity';

import type { ExecutiveProfile, ToolResult } from './types.js';

const credential = new DefaultAzureCredential();
const graphScope = 'https://graph.microsoft.com/.default';

async function graphRequest(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const token = await credential.getToken(graphScope);
  if (!token?.token) {
    throw new Error('Could not acquire a Microsoft Graph access token.');
  }
  return fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token.token}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
}

interface CreateEventInput {
  subject: string;
  start: string;
  end?: string;
  durationMinutes?: number;
  attendees?: string[];
  notes?: string;
  timeZone?: string;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

export async function createEvent(
  profile: ExecutiveProfile,
  input: CreateEventInput,
): Promise<ToolResult> {
  const start = new Date(input.start);
  const end = input.end
    ? new Date(input.end)
    : addMinutes(start, input.durationMinutes ?? 30);
  if (
    !input.subject?.trim() ||
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    end <= start
  ) {
    throw new Error('A valid subject, start, and end are required.');
  }
  const user = encodeURIComponent(profile.ownerUserId);
  const startIso = encodeURIComponent(start.toISOString());
  const endIso = encodeURIComponent(end.toISOString());
  const conflicts = await graphRequest(
    `/users/${user}/calendarView?startDateTime=${startIso}&endDateTime=${endIso}&$select=id,subject,start,end`,
  );
  if (!conflicts.ok) {
    throw new Error(`Graph calendar lookup failed with HTTP ${conflicts.status}.`);
  }
  const conflictBody = (await conflicts.json()) as { value?: unknown[] };
  if ((conflictBody.value?.length ?? 0) > 0) {
    return {
      status: 'conflict',
      message:
        `${profile.ownerName} already has a calendar conflict at that time. ` +
        'Do not book over it; offer to follow up with alternatives.',
    };
  }

  const timeZone = input.timeZone || 'UTC';
  const create = await graphRequest(`/users/${user}/events`, {
    method: 'POST',
    body: JSON.stringify({
      subject: input.subject.trim(),
      body: { contentType: 'text', content: input.notes || '' },
      start: { dateTime: start.toISOString(), timeZone },
      end: { dateTime: end.toISOString(), timeZone },
      attendees: (input.attendees ?? []).map(address => ({
        emailAddress: { address },
        type: 'required',
      })),
    }),
  });
  if (!create.ok) {
    throw new Error(`Graph event creation failed with HTTP ${create.status}.`);
  }
  const event = (await create.json()) as { id?: string; webLink?: string };
  return {
    status: 'booked',
    message: `The meeting was booked on ${profile.ownerName}'s calendar.`,
    data: { eventId: event.id, webLink: event.webLink },
  };
}
