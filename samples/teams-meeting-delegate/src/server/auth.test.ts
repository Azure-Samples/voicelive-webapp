import { describe, expect, it } from 'vitest';

import { resolveAuthenticatedUserId } from './auth.js';

describe('resolveAuthenticatedUserId', () => {
  it('uses the Container Apps principal ID header', () => {
    expect(
      resolveAuthenticatedUserId({
        'x-ms-client-principal-id': 'user-123',
      }),
    ).toBe('user-123');
  });

  it('reads a base64 Easy Auth principal', () => {
    const principal = Buffer.from(
      JSON.stringify({ userId: 'user-456' }),
    ).toString('base64');
    expect(
      resolveAuthenticatedUserId({
        'x-ms-client-principal': principal,
      }),
    ).toBe('user-456');
  });

  it('fails closed without a production principal', () => {
    expect(() => resolveAuthenticatedUserId({})).toThrow(
      'Authentication is required.',
    );
  });
});
