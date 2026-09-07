import { WebPubSubServiceClient } from '@azure/web-pubsub';

import { config } from './config.js';

const client = new WebPubSubServiceClient(
  config.webPubSubConnectionString,
  config.webPubSubHub,
);

function groupName(sessionId: string): string {
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(sessionId)) {
    throw new Error('The meeting session ID is invalid.');
  }
  return `meeting-${sessionId}`;
}

export async function negotiateControl(sessionId: string): Promise<string> {
  const group = groupName(sessionId);
  const token = await client.getClientAccessToken({
    userId: `bridge-${sessionId}`,
    groups: [group],
  });
  return token.url;
}

export async function sendControl(
  sessionId: string,
  action: 'raise_hand' | 'lower_hand',
  reason?: string,
): Promise<void> {
  await client.group(groupName(sessionId)).sendToAll(
    {
      type: 'meeting.control',
      action,
      reason: reason?.slice(0, 200),
      sentAt: new Date().toISOString(),
    },
  );
}
