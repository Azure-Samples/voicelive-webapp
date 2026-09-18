import type { DelegationRecord } from './types.js';

interface MediaHostStartResponse {
  callId?: unknown;
  status?: unknown;
}

export class MediaHostClient {
  readonly #baseUrl?: string;
  readonly #key?: string;

  public constructor(baseUrl?: string, key?: string) {
    if (Boolean(baseUrl) !== Boolean(key)) {
      throw new Error(
        'UNATTENDED_MEDIA_HOST_BASE_URL and UNATTENDED_MEDIA_HOST_KEY must be configured together.',
      );
    }
    this.#baseUrl = baseUrl;
    this.#key = key;
  }

  public get configured(): boolean {
    return Boolean(this.#baseUrl && this.#key);
  }

  public async start(record: DelegationRecord): Promise<string> {
    const response = await this.#request('/api/calls', 'POST', {
      delegationId: record.id,
      profileId: record.profileId,
      meetingJoinUrl: record.meetingJoinUrl,
      meetingBrief: record.meetingBrief,
    });
    const result = response as MediaHostStartResponse;
    if (typeof result.callId !== 'string' || !result.callId.trim()) {
      throw new Error('The unattended media host returned no call ID.');
    }
    return result.callId.trim();
  }

  public async cancel(callId: string): Promise<void> {
    await this.#request(
      `/api/calls/${encodeURIComponent(callId)}`,
      'DELETE',
    );
  }

  async #request(
    path: string,
    method: 'POST' | 'DELETE',
    body?: Record<string, unknown>,
  ): Promise<unknown> {
    if (!this.#baseUrl || !this.#key) {
      throw new Error('The unattended media host is not configured.');
    }
    const response = await fetch(`${this.#baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-media-host-key': this.#key,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    const text = await response.text();
    const payload = text ? (JSON.parse(text) as unknown) : {};
    if (!response.ok) {
      const message =
        payload &&
        typeof payload === 'object' &&
        'error' in payload &&
        typeof payload.error === 'string'
          ? payload.error
          : `Media host request failed with HTTP ${response.status}.`;
      throw new Error(message);
    }
    return payload;
  }
}
