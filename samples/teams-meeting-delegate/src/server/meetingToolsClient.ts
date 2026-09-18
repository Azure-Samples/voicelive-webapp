import type { AppConfig, ExecutiveProfile } from './config.js';

interface MeetingEvent {
  sessionId: string;
  profileId: string;
  speaker: 'participant' | 'agent' | 'system';
  text: string;
}

export class MeetingToolsClient {
  readonly #baseUrl?: string;
  readonly #functionKey?: string;

  public constructor(config: AppConfig) {
    this.#baseUrl = config.meetingToolsBaseUrl;
    this.#functionKey = config.meetingToolsFunctionKey;
  }

  public get configured(): boolean {
    return Boolean(this.#baseUrl && this.#functionKey);
  }

  public async negotiate(sessionId: string): Promise<string> {
    const response = await this.#request('/api/bridge/negotiate', {
      sessionId,
    });
    if (typeof response.url !== 'string' || !response.url.startsWith('wss://')) {
      throw new Error('The meeting control service returned an invalid URL.');
    }
    return response.url;
  }

  public async recordEvent(
    profile: ExecutiveProfile,
    event: Omit<MeetingEvent, 'profileId'>,
  ): Promise<void> {
    if (!this.configured) {
      return;
    }
    await this.#request('/api/bridge/events', {
      ...event,
      profileId: profile.id,
    });
  }

  public async finalizeMeeting(
    profile: ExecutiveProfile,
    sessionId: string,
  ): Promise<void> {
    if (!this.configured) {
      return;
    }
    await this.#request('/api/bridge/finalize', {
      profileId: profile.id,
      sessionId,
    });
  }

  async #request(
    path: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (!this.#baseUrl || !this.#functionKey) {
      throw new Error('The meeting control service is not configured.');
    }
    const response = await fetch(`${this.#baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-functions-key': this.#functionKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const text = await response.text();
    const parsed = text
      ? (JSON.parse(text) as Record<string, unknown>)
      : {};
    if (!response.ok) {
      throw new Error(
        typeof parsed.error === 'string'
          ? parsed.error
          : `Meeting control request failed with HTTP ${response.status}.`,
      );
    }
    return parsed;
  }
}
