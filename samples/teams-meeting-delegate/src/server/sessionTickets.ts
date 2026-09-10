import { randomBytes } from 'node:crypto';

const DEFAULT_TICKET_LIFETIME_MS = 60_000;
const DEFAULT_MAX_TICKETS = 1_000;
const DEFAULT_MAX_TICKETS_PER_USER = 5;

interface SessionTicket {
  expiresAt: number;
  userId: string;
}

export class SessionTicketStore {
  readonly #tickets = new Map<string, SessionTicket>();
  readonly #maxTickets: number;
  readonly #maxTicketsPerUser: number;
  readonly #ticketLifetimeMs: number;

  public constructor(
    ticketLifetimeMs = DEFAULT_TICKET_LIFETIME_MS,
    maxTickets = DEFAULT_MAX_TICKETS,
    maxTicketsPerUser = DEFAULT_MAX_TICKETS_PER_USER,
  ) {
    this.#ticketLifetimeMs = ticketLifetimeMs;
    this.#maxTickets = maxTickets;
    this.#maxTicketsPerUser = maxTicketsPerUser;
  }

  public issue(userId: string): string {
    this.#removeExpired();
    if (this.#tickets.size >= this.#maxTickets) {
      throw new Error('Too many pending voice sessions.');
    }
    let userTicketCount = 0;
    for (const session of this.#tickets.values()) {
      if (session.userId === userId) {
        userTicketCount += 1;
      }
    }
    if (userTicketCount >= this.#maxTicketsPerUser) {
      throw new Error('Too many pending voice sessions for this user.');
    }
    const ticket = randomBytes(32).toString('base64url');
    this.#tickets.set(ticket, {
      expiresAt: Date.now() + this.#ticketLifetimeMs,
      userId,
    });
    return ticket;
  }

  public consume(ticket: string): string | undefined {
    this.#removeExpired();
    const session = this.#tickets.get(ticket);
    if (!session) {
      return undefined;
    }
    this.#tickets.delete(ticket);
    return session.userId;
  }

  #removeExpired(): void {
    const now = Date.now();
    for (const [ticket, session] of this.#tickets) {
      if (session.expiresAt <= now) {
        this.#tickets.delete(ticket);
      }
    }
  }
}
