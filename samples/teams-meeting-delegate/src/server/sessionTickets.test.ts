import { describe, expect, it, vi } from 'vitest';

import { SessionTicketStore } from './sessionTickets.js';

describe('session tickets', () => {
  it('can be consumed only once', () => {
    const tickets = new SessionTicketStore();
    const ticket = tickets.issue('user-1');

    expect(tickets.consume(ticket)).toBe('user-1');
    expect(tickets.consume(ticket)).toBeUndefined();
  });

  it('rejects expired tickets', () => {
    vi.useFakeTimers();
    const tickets = new SessionTicketStore(1_000);
    const ticket = tickets.issue('user-1');

    vi.advanceTimersByTime(1_001);
    expect(tickets.consume(ticket)).toBeUndefined();
    vi.useRealTimers();
  });

  it('bounds pending tickets per user', () => {
    const tickets = new SessionTicketStore(60_000, 10, 1);
    tickets.issue('user-1');

    expect(() => tickets.issue('user-1')).toThrow(
      'Too many pending voice sessions for this user.',
    );
    expect(() => tickets.issue('user-2')).not.toThrow();
  });
});
