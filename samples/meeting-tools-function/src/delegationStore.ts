import { createHash } from 'node:crypto';

import {
  BlobServiceClient,
  type BlockBlobClient,
  type ContainerClient,
} from '@azure/storage-blob';

import { config } from './config.js';
import type { DelegationRecord } from './types.js';

const containerName = 'meeting-delegations';
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

function validateDelegationId(id: string): string {
  if (!/^[a-f0-9]{32}$/.test(id)) {
    throw new Error('The delegation ID is invalid.');
  }
  return id;
}

function createDelegationId(
  profileId: string,
  clientRequestId: string,
): string {
  return createHash('sha256')
    .update(`${profileId}\n${clientRequestId}`)
    .digest('hex')
    .slice(0, 32);
}

async function getBlob(id: string): Promise<BlockBlobClient> {
  const container = await getContainer();
  return container.getBlockBlobClient(
    `${validateDelegationId(id)}.json`,
  );
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

export function newDelegationRecord(input: {
  profileId: string;
  clientRequestId: string;
  meetingJoinUrl: string;
  meetingBrief: string;
}): DelegationRecord {
  const now = new Date().toISOString();
  return {
    id: createDelegationId(input.profileId, input.clientRequestId),
    clientRequestId: input.clientRequestId,
    profileId: input.profileId,
    meetingJoinUrl: input.meetingJoinUrl,
    meetingBrief: input.meetingBrief,
    status: 'starting',
    createdAt: now,
    updatedAt: now,
  };
}

export async function readDelegation(
  id: string,
): Promise<DelegationRecord | undefined> {
  const blob = await getBlob(id);
  if (!(await blob.exists())) {
    return undefined;
  }
  const response = await blob.download();
  return JSON.parse(
    await streamToText(response.readableStreamBody),
  ) as DelegationRecord;
}

export async function createDelegation(
  record: DelegationRecord,
): Promise<{ created: boolean; record: DelegationRecord }> {
  const blob = await getBlob(record.id);
  const content = JSON.stringify(record);
  try {
    await blob.upload(content, Buffer.byteLength(content), {
      conditions: { ifNoneMatch: '*' },
      blobHTTPHeaders: { blobContentType: 'application/json' },
    });
    return { created: true, record };
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'statusCode' in error &&
      error.statusCode === 409
    ) {
      const existing = await readDelegation(record.id);
      if (existing) {
        return { created: false, record: existing };
      }
    }
    throw error;
  }
}

export async function writeDelegation(
  record: DelegationRecord,
): Promise<void> {
  const blob = await getBlob(record.id);
  const content = JSON.stringify({
    ...record,
    updatedAt: new Date().toISOString(),
  });
  await blob.upload(content, Buffer.byteLength(content), {
    blobHTTPHeaders: { blobContentType: 'application/json' },
  });
}
