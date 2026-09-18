import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import type { AppConfig, ExecutiveProfile } from './config.js';
import type { BridgeConfigureMessage } from '../shared/protocol.js';
import type { RawData } from 'ws';
import type { MeetingToolsClient } from './meetingToolsClient.js';

import { randomUUID } from 'node:crypto';

import { DefaultAzureCredential } from '@azure/identity';
import WebSocket, { WebSocketServer } from 'ws';

import { ALLOWED_BROWSER_EVENT_TYPES } from '../shared/protocol.js';
import { resolveAuthenticatedUserId } from './auth.js';
import {
  findAuthorizedProfile,
  validateProjectEndpoint,
} from './config.js';

const TOKEN_SCOPE = 'https://ai.azure.com/.default';
const REALTIME_API_VERSION = '2025-11-15-preview';
const MAX_BROWSER_MESSAGE_BYTES = 1_000_000;
const MAX_MEETING_BRIEF_CHARACTERS = 4_000;

function buildVoiceAgentUrl(profile: ExecutiveProfile): URL {
  const projectEndpoint = validateProjectEndpoint(profile.projectEndpoint);
  projectEndpoint.protocol = 'wss:';
  projectEndpoint.pathname = `${projectEndpoint.pathname}/agents/${encodeURIComponent(profile.agentName)}/endpoint/protocols/voice`;
  projectEndpoint.searchParams.set('api-version', REALTIME_API_VERSION);
  projectEndpoint.searchParams.set(
    'agent_session_id',
    `teams-delegate-${randomUUID()}`,
  );
  return projectEndpoint;
}

function parseJsonMessage(data: RawData): Record<string, unknown> {
  const text = Buffer.isBuffer(data)
    ? data.toString('utf8')
    : Array.isArray(data)
      ? Buffer.concat(data).toString('utf8')
      : Buffer.from(data).toString('utf8');
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('WebSocket messages must be JSON objects.');
  }
  return parsed as Record<string, unknown>;
}

function parseConfigureMessage(
  message: Record<string, unknown>,
): BridgeConfigureMessage {
  if (
    message.type !== 'bridge.configure' ||
    typeof message.meetingBrief !== 'string' ||
    typeof message.sessionId !== 'string'
  ) {
    throw new Error('The first message must configure the meeting bridge.');
  }
  const meetingBrief = message.meetingBrief.trim();
  const sessionId = message.sessionId.trim();
  if (meetingBrief.length > MAX_MEETING_BRIEF_CHARACTERS) {
    throw new Error('The meeting brief must contain at most 4,000 characters.');
  }
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(sessionId)) {
    throw new Error('The meeting session ID is invalid.');
  }
  return { type: 'bridge.configure', meetingBrief, sessionId };
}

function closePair(
  browser: WebSocket,
  foundry: WebSocket | undefined,
  code = 1000,
  reason = 'Session ended',
): void {
  if (
    browser.readyState === WebSocket.OPEN ||
    browser.readyState === WebSocket.CONNECTING
  ) {
    browser.close(code, reason);
  }
  if (
    foundry &&
    (foundry.readyState === WebSocket.OPEN ||
      foundry.readyState === WebSocket.CONNECTING)
  ) {
    foundry.close(code, reason);
  }
}

export function createFoundryProxy(
  config: AppConfig,
  meetingTools: MeetingToolsClient,
): {
  handleUpgrade: (
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ) => void;
} {
  const credential = new DefaultAzureCredential();
  const server = new WebSocketServer({ noServer: true });

  return {
    handleUpgrade(request, socket, head) {
      let userId: string;
      let profile: ExecutiveProfile;
      try {
        userId = resolveAuthenticatedUserId(request.headers, config.devUserId);
        const requestUrl = new URL(
          request.url ?? '',
          `http://${request.headers.host ?? 'localhost'}`,
        );
        profile = findAuthorizedProfile(
          config.profiles,
          requestUrl.searchParams.get('profile') ?? '',
          userId,
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Upgrade rejected.';
        socket.write(
          `HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Type: text/plain\r\nContent-Length: ${Buffer.byteLength(message)}\r\n\r\n${message}`,
        );
        socket.destroy();
        return;
      }

      server.handleUpgrade(request, socket, head, browser => {
        let foundry: WebSocket | undefined;
        let configured = false;
        let meetingSessionId: string | undefined;
        let finalizePromise: Promise<void> | undefined;
        const pendingRecordings = new Set<Promise<void>>();
        const pendingMessages: Array<Record<string, unknown>> = [];
        const configurationTimeout = setTimeout(() => {
          browser.send(
            JSON.stringify({
              type: 'bridge.error',
              message: 'The bridge was not configured in time.',
            }),
          );
          closePair(browser, foundry, 1008, 'Configuration timeout');
        }, 15_000);

        const connectFoundry = async (
          configureMessage: BridgeConfigureMessage,
        ): Promise<void> => {
          meetingSessionId = configureMessage.sessionId;
          const token = await credential.getToken(TOKEN_SCOPE);
          if (!token?.token) {
            throw new Error('Could not acquire a Foundry access token.');
          }

          const headers: Record<string, string> = {
            Authorization: `Bearer ${token.token}`,
            'Foundry-Features': 'VoiceAgents=V1Preview',
          };
          if (profile.structuredInputsEnabled) {
            if (!configureMessage.meetingBrief) {
              throw new Error(
                'This agent requires a meeting brief for structured inputs.',
              );
            }
            headers['x-ms-voice-structured-inputs'] = JSON.stringify({
              owner: profile.owner,
              persona: profile.persona,
              brief: configureMessage.meetingBrief,
            });
          }

          foundry = new WebSocket(buildVoiceAgentUrl(profile), 'realtime', {
            headers,
          });

          foundry.on('open', () => {
            foundry?.send(
              JSON.stringify({
                type: 'conversation.item.create',
                item: {
                  type: 'message',
                  role: 'system',
                  content: [
                    {
                      type: 'input_text',
                      text:
                        `Live meeting runtime context: profileId=${profile.id}; ` +
                        `sessionId=${configureMessage.sessionId}. Use these exact values ` +
                        'when calling attached meeting tools. The external tool owns meeting ' +
                        'guardrails, recap data, calendar actions, and hand controls.',
                    },
                  ],
                },
              }),
            );
            browser.send(JSON.stringify({ type: 'bridge.ready' }));
            for (const message of pendingMessages) {
              foundry?.send(JSON.stringify(message));
            }
            pendingMessages.length = 0;
          });

          foundry.on('message', (data, isBinary) => {
            if (!isBinary && meetingTools.configured) {
              try {
                const event = parseJsonMessage(data);
                const eventType =
                  typeof event.type === 'string' ? event.type : '';
                const transcript =
                  typeof event.transcript === 'string'
                    ? event.transcript.trim()
                    : '';
                const speaker =
                  eventType ===
                  'conversation.item.input_audio_transcription.completed'
                    ? 'participant'
                    : eventType === 'response.audio_transcript.done'
                      ? 'agent'
                      : undefined;
                if (speaker && transcript) {
                  const recording = meetingTools
                    .recordEvent(profile, {
                      sessionId: configureMessage.sessionId,
                      speaker,
                      text: transcript,
                    })
                    .catch(error => {
                      console.error(
                        `Could not persist meeting transcript: ${error instanceof Error ? error.message : 'unknown error'}`,
                      );
                    })
                    .finally(() => {
                      pendingRecordings.delete(recording);
                    });
                  pendingRecordings.add(recording);
                }
              } catch {
                // Binary and non-JSON Foundry frames are forwarded unchanged.
              }
            }
            if (browser.readyState === WebSocket.OPEN) {
              browser.send(data, { binary: isBinary });
            }
          });

          foundry.on('close', (code, reason) => {
            closePair(
              browser,
              foundry,
              code || 1011,
              reason.toString() || 'Foundry session closed',
            );
          });

          foundry.on('error', error => {
            if (browser.readyState === WebSocket.OPEN) {
              browser.send(
                JSON.stringify({
                  type: 'bridge.error',
                  message: `Foundry connection failed: ${error.message}`,
                }),
              );
            }
            closePair(browser, foundry, 1011, 'Foundry connection failed');
          });
        };

        const finalizeMeeting = (): Promise<void> => {
          finalizePromise ??= (async () => {
            await Promise.allSettled([...pendingRecordings]);
            if (meetingSessionId) {
              await meetingTools.finalizeMeeting(profile, meetingSessionId);
            }
          })().catch(error => {
            console.error(
              `Could not finalize meeting summary: ${error instanceof Error ? error.message : 'unknown error'}`,
            );
          });
          return finalizePromise;
        };

        browser.on('message', data => {
          void (async () => {
            try {
              const byteLength = Buffer.isBuffer(data)
                ? data.byteLength
                : Buffer.byteLength(data.toString());
              if (byteLength > MAX_BROWSER_MESSAGE_BYTES) {
                throw new Error('The browser message is too large.');
              }

              const message = parseJsonMessage(data);
              if (!configured) {
                configured = true;
                clearTimeout(configurationTimeout);
                await connectFoundry(parseConfigureMessage(message));
                return;
              }

              if (
                typeof message.type !== 'string' ||
                !ALLOWED_BROWSER_EVENT_TYPES.has(message.type)
              ) {
                throw new Error(
                  'The browser attempted to send an unsupported agent event.',
                );
              }

              if (foundry?.readyState === WebSocket.OPEN) {
                foundry.send(JSON.stringify(message));
              } else {
                pendingMessages.push(message);
              }
            } catch (error) {
              const message =
                error instanceof Error ? error.message : 'Invalid message.';
              if (browser.readyState === WebSocket.OPEN) {
                browser.send(
                  JSON.stringify({ type: 'bridge.error', message }),
                );
              }
              closePair(browser, foundry, 1008, 'Policy violation');
            }
          })();
        });

        browser.on('close', () => {
          clearTimeout(configurationTimeout);
          void finalizeMeeting();
          closePair(browser, foundry);
        });
        browser.on('error', () => {
          clearTimeout(configurationTimeout);
          void finalizeMeeting();
          closePair(browser, foundry, 1011, 'Browser connection failed');
        });
      });
    },
  };
}

export { buildVoiceAgentUrl, parseConfigureMessage };
