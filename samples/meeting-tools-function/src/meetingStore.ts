import {
  AppendBlobClient,
  BlobServiceClient,
  ContainerClient,
} from '@azure/storage-blob';

import { config } from './config.js';
import { classifyOwnerReference } from './meetingPatterns.js';
import type {
  ExecutiveProfile,
  MeetingEvent,
  StoredMeetingEvent,
} from './types.js';

const containerName = 'meeting-notes';
let containerPromise: Promise<ContainerClient> | undefined;

async function getContainer(): Promise<ContainerClient> {
  containerPromise ??= (async () => {
    const client = BlobServiceClient.fromConnectionString(
      config.storageConnectionString,
    ).getContainerClient(containerName);
    await client.createIfNotExists();
    return client;
  })();
  return containerPromise;
}

function safeSessionId(sessionId: string): string {
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(sessionId)) {
    throw new Error('The meeting session ID is invalid.');
  }
  return sessionId;
}

async function getAppendBlob(sessionId: string): Promise<AppendBlobClient> {
  const container = await getContainer();
  return container.getAppendBlobClient(`${safeSessionId(sessionId)}.ndjson`);
}

export async function appendMeetingEvent(
  event: MeetingEvent,
  profile: ExecutiveProfile,
): Promise<StoredMeetingEvent> {
  const references = classifyOwnerReference(event.text, profile.ownerName);
  const stored: StoredMeetingEvent = {
    ...event,
    occurredAt: event.occurredAt || new Date().toISOString(),
    ...references,
  };
  const blob = await getAppendBlob(event.sessionId);
  await blob.createIfNotExists();
  const line = `${JSON.stringify(stored)}\n`;
  await blob.appendBlock(line, Buffer.byteLength(line));
  return stored;
}

export async function readMeeting(
  sessionId: string,
): Promise<StoredMeetingEvent[]> {
  const blob = await getAppendBlob(sessionId);
  if (!(await blob.exists())) {
    return [];
  }
  const response = await blob.download();
  const body = await streamToText(response.readableStreamBody);
  return body
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line) as StoredMeetingEvent);
}

async function streamToText(
  stream: NodeJS.ReadableStream | undefined,
): Promise<string> {
  if (!stream) {
    return '';
  }
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}
