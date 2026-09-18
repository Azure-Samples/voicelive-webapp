import { afterEach, describe, expect, it, vi } from 'vitest';

import { MediaHostClient } from './mediaHostClient.js';
import type { DelegationRecord } from './types.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

const record: DelegationRecord = {
  id: 'a'.repeat(32),
  clientRequestId: 'request-1',
  profileId: 'executive-1',
  meetingJoinUrl: 'https://teams.microsoft.com/l/meetup-join/example',
  meetingBrief: 'Quarterly review',
  status: 'starting',
  createdAt: '2026-09-17T00:00:00.000Z',
  updatedAt: '2026-09-17T00:00:00.000Z',
};

describe('MediaHostClient', () => {
  it('starts and cancels a call through the configured adapter', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ callId: 'graph-call-1' }), {
          status: 202,
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new MediaHostClient(
      'https://media.example.com',
      'secret',
    );

    await expect(client.start(record)).resolves.toBe('graph-call-1');
    await expect(client.cancel('graph-call-1')).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('requires complete configuration', () => {
    expect(() => new MediaHostClient('https://media.example.com')).toThrow(
      'must be configured together',
    );
  });
});
