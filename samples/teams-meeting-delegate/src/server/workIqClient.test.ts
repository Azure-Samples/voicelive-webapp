import { afterEach, describe, expect, it, vi } from 'vitest';

import { extractBearerToken, WorkIqClient } from './workIqClient.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('WorkIqClient', () => {
  it('exchanges the caller token and sends an A2A request', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'work-iq-token' }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            result: {
              task: {
                id: 'task-1',
                contextId: 'context-1',
                status: { state: 'TASK_STATE_COMPLETED' },
                artifacts: [{ parts: [{ text: 'The answer.' }] }],
              },
            },
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    const client = new WorkIqClient({
      tenantId: '11111111-1111-1111-1111-111111111111',
      clientId: '22222222-2222-2222-2222-222222222222',
      clientSecret: 'secret',
    });
    const result = await client.ask('incoming-user-token', 'What changed?', {
      timeZone: 'Asia/Tokyo',
      timeZoneOffset: 540,
    });

    expect(result.text).toBe('The answer.');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const tokenRequest = fetchMock.mock.calls[0]?.[1];
    expect(String(tokenRequest?.body)).toContain(
      'requested_token_use=on_behalf_of',
    );
    const workIqRequest = fetchMock.mock.calls[1]?.[1];
    const headers = workIqRequest?.headers as Record<string, string>;
    expect(headers.Authorization).toBe(
      ['Bearer', 'work-iq-token'].join(' '),
    );
    expect(headers['A2A-Version']).toBe('1.0');
  });

  it('requires a user token and bounded question', async () => {
    const client = new WorkIqClient({
      tenantId: '11111111-1111-1111-1111-111111111111',
      clientId: '22222222-2222-2222-2222-222222222222',
      clientSecret: 'secret',
    });
    await expect(
      client.ask('', 'question', {
        timeZone: 'UTC',
        timeZoneOffset: 0,
      }),
    ).rejects.toThrow('signed-in user token');
    await expect(
      client.ask('token', '', {
        timeZone: 'UTC',
        timeZoneOffset: 0,
      }),
    ).rejects.toThrow('between 1 and 4,000');
  });
});

describe('extractBearerToken', () => {
  it('accepts bearer auth or a development-only fallback', () => {
    expect(extractBearerToken('Bearer user-token')).toBe('user-token');
    expect(extractBearerToken(undefined, 'dev-token')).toBe('dev-token');
    expect(() => extractBearerToken(undefined)).toThrow('bearer token');
  });
});
