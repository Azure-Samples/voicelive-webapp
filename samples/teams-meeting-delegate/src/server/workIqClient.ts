import { randomUUID } from 'node:crypto';

import type { WorkIqConfig } from './config.js';

const WORK_IQ_SCOPE =
  'api://workiq.svc.cloud.microsoft/WorkIQAgent.Ask';
const WORK_IQ_ENDPOINT = 'https://workiq.svc.cloud.microsoft/a2a/';
const MAX_QUESTION_CHARACTERS = 4_000;

export interface WorkIqLocation {
  timeZone: string;
  timeZoneOffset: number;
}

export interface WorkIqAnswer {
  taskId?: string;
  contextId?: string;
  status?: string;
  text: string;
  raw: unknown;
}

function readResponseError(
  value: unknown,
  fallback: string,
): string {
  if (!value || typeof value !== 'object') {
    return fallback;
  }
  const candidate = value as {
    error?: { message?: unknown };
    error_description?: unknown;
  };
  if (typeof candidate.error_description === 'string') {
    return candidate.error_description;
  }
  if (typeof candidate.error?.message === 'string') {
    return candidate.error.message;
  }
  return fallback;
}

function extractAnswer(payload: unknown): WorkIqAnswer {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Work IQ returned an invalid response.');
  }
  const response = payload as {
    error?: { message?: unknown };
    result?: {
      task?: {
        id?: unknown;
        contextId?: unknown;
        status?: { state?: unknown };
        artifacts?: Array<{
          parts?: Array<{ text?: unknown }>;
        }>;
      };
    };
  };
  if (response.error) {
    throw new Error(
      typeof response.error.message === 'string'
        ? response.error.message
        : 'Work IQ rejected the request.',
    );
  }
  const task = response.result?.task;
  const text =
    task?.artifacts
      ?.flatMap(artifact => artifact.parts ?? [])
      .map(part => (typeof part.text === 'string' ? part.text.trim() : ''))
      .filter(Boolean)
      .join('\n') ?? '';
  if (!text) {
    throw new Error('Work IQ completed without returning an answer.');
  }
  return {
    taskId: typeof task?.id === 'string' ? task.id : undefined,
    contextId:
      typeof task?.contextId === 'string' ? task.contextId : undefined,
    status:
      typeof task?.status?.state === 'string'
        ? task.status.state
        : undefined,
    text,
    raw: payload,
  };
}

export class WorkIqClient {
  readonly #config?: WorkIqConfig;

  public constructor(config?: WorkIqConfig) {
    this.#config = config;
  }

  public get configured(): boolean {
    return Boolean(this.#config);
  }

  public async ask(
    incomingUserToken: string,
    question: string,
    location: WorkIqLocation,
  ): Promise<WorkIqAnswer> {
    if (!this.#config) {
      throw new Error('Work IQ is not configured.');
    }
    const normalizedQuestion = question.trim();
    if (
      !normalizedQuestion ||
      normalizedQuestion.length > MAX_QUESTION_CHARACTERS
    ) {
      throw new Error(
        'The Work IQ question must contain between 1 and 4,000 characters.',
      );
    }
    if (
      !location.timeZone.trim() ||
      !Number.isFinite(location.timeZoneOffset)
    ) {
      throw new Error('A valid IANA time zone and offset are required.');
    }

    const token = await this.#exchangeOnBehalfOf(incomingUserToken);
    const response = await fetch(WORK_IQ_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        'A2A-Version': '1.0',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: randomUUID(),
        method: 'SendMessage',
        params: {
          message: {
            role: 'ROLE_USER',
            messageId: randomUUID(),
            parts: [{ text: normalizedQuestion }],
            metadata: {
              Location: {
                timeZone: location.timeZone.trim(),
                timeZoneOffset: location.timeZoneOffset,
              },
            },
          },
        },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const payload = (await response.json()) as unknown;
    if (!response.ok) {
      throw new Error(
        readResponseError(
          payload,
          `Work IQ request failed with HTTP ${response.status}.`,
        ),
      );
    }
    return extractAnswer(payload);
  }

  async #exchangeOnBehalfOf(incomingUserToken: string): Promise<string> {
    if (!this.#config) {
      throw new Error('Work IQ is not configured.');
    }
    if (!incomingUserToken.trim()) {
      throw new Error('A signed-in user token is required for Work IQ.');
    }
    const body = new URLSearchParams({
      client_id: this.#config.clientId,
      client_secret: this.#config.clientSecret,
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: incomingUserToken,
      requested_token_use: 'on_behalf_of',
      scope: WORK_IQ_SCOPE,
    });
    const response = await fetch(
      `https://login.microsoftonline.com/${encodeURIComponent(this.#config.tenantId)}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
        signal: AbortSignal.timeout(15_000),
      },
    );
    const payload = (await response.json()) as {
      access_token?: unknown;
    };
    if (!response.ok || typeof payload.access_token !== 'string') {
      throw new Error(
        readResponseError(
          payload,
          `Work IQ token exchange failed with HTTP ${response.status}.`,
        ),
      );
    }
    return payload.access_token;
  }
}

export function extractBearerToken(
  authorizationHeader: string | undefined,
  developmentToken?: string,
): string {
  const match = authorizationHeader?.match(/^Bearer ([^\s]+)$/i);
  const token = match?.[1] || developmentToken;
  if (!token) {
    throw new Error(
      'A validated signed-in user bearer token is required for Work IQ.',
    );
  }
  return token;
}
