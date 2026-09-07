import type {
  AcsTokenResponse,
} from '../shared/protocol';
import type { Call, CallAgent } from '@azure/communication-calling';

import { CallClient, Features } from '@azure/communication-calling';
import { AzureCommunicationTokenCredential } from '@azure/communication-common';

import type { MediaBridge } from './mediaBridge';

const REMOTE_AUDIO_TIMEOUT_MS = 30_000;

async function requestAcsToken(
  profileId: string,
): Promise<AcsTokenResponse> {
  const query = new URLSearchParams({ profileId });
  const response = await fetch(`/api/acs/token?${query.toString()}`, {
    cache: 'no-store',
  });
  const responseText = await response.text();
  if (!responseText) {
    throw new Error(
      `ACS token request returned HTTP ${response.status} with an empty response.`,
    );
  }
  let body: AcsTokenResponse | { error?: string };
  try {
    body = JSON.parse(responseText) as AcsTokenResponse | { error?: string };
  } catch {
    throw new Error(
      `ACS token request returned HTTP ${response.status} with a non-JSON response.`,
    );
  }
  if (!response.ok || !('token' in body)) {
    throw new Error(
      'error' in body && body.error
        ? body.error
        : 'Could not obtain an ACS token.',
    );
  }
  return body;
}

function waitForConnected(call: Call): Promise<void> {
  if (call.state === 'Connected') {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      call.off('stateChanged', stateChanged);
      reject(new Error('Timed out while joining the Teams meeting.'));
    }, 60_000);

    const stateChanged = () => {
      if (call.state === 'Connected') {
        window.clearTimeout(timeout);
        call.off('stateChanged', stateChanged);
        resolve();
      } else if (call.state === 'Disconnected') {
        window.clearTimeout(timeout);
        call.off('stateChanged', stateChanged);
        reject(new Error('The Teams meeting disconnected before joining.'));
      }
    };

    call.on('stateChanged', stateChanged);
  });
}

export class AcsMeetingBridge {
  #callAgent?: CallAgent;
  #call?: Call;
  #controlSocket?: WebSocket;

  public async join(
    profileId: string,
    sessionId: string,
    meetingLink: string,
    media: MediaBridge,
    onStateChanged: (state: string) => void,
  ): Promise<MediaStream> {
    const token = await requestAcsToken(profileId);
    const callClient = new CallClient();
    this.#callAgent = await callClient.createCallAgent(
      new AzureCommunicationTokenCredential(token.token),
      { displayName: token.displayName },
    );

    this.#call = this.#callAgent.join(
      { meetingLink },
      {
        audioOptions: {
          localAudioStreams: [media.localAudioStream],
          muted: false,
        },
        videoOptions: {
          localVideoStreams: [media.localVideoStream],
          constraints: {
            send: {
              frameHeight: { max: 720 },
              frameRate: { max: 30 },
            },
          },
        },
      },
    );
    this.#call.on('stateChanged', () => onStateChanged(this.#call?.state ?? ''));
    onStateChanged(this.#call.state);
    await waitForConnected(this.#call);
    await this.#connectControl(profileId, sessionId);

    const deadline = Date.now() + REMOTE_AUDIO_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const remoteAudioStream = this.#call.remoteAudioStreams.at(0);
      if (remoteAudioStream) {
        return remoteAudioStream.getMediaStream();
      }
      await new Promise(resolve => window.setTimeout(resolve, 250));
    }
    throw new Error('The Teams meeting did not expose an incoming audio stream.');
  }

  public async leave(): Promise<void> {
    this.#controlSocket?.close();
    this.#controlSocket = undefined;
    const call = this.#call;
    this.#call = undefined;
    if (call && call.state !== 'Disconnected') {
      await call.hangUp();
    }
    this.#callAgent?.dispose();
    this.#callAgent = undefined;
  }

  async #connectControl(profileId: string, sessionId: string): Promise<void> {
    const query = new URLSearchParams({ profileId, sessionId });
    const response = await fetch(`/api/control/negotiate?${query.toString()}`, {
      cache: 'no-store',
    });
    if (response.status === 204) {
      return;
    }
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new Error(
        body.error || 'Could not connect the meeting control channel.',
      );
    }
    const body = (await response.json()) as { url?: string };
    if (!body.url) {
      throw new Error('The meeting control channel did not return a URL.');
    }

    const socket = new WebSocket(body.url, 'json.webpubsub.azure.v1');
    this.#controlSocket = socket;
    socket.onmessage = event => {
      void this.#handleControlMessage(String(event.data));
    };
  }

  async #handleControlMessage(rawMessage: string): Promise<void> {
    let envelope: {
      type?: string;
      action?: string;
      data?: { type?: string; action?: string };
    };
    try {
      envelope = JSON.parse(rawMessage) as typeof envelope;
    } catch {
      return;
    }
    const commandType =
      envelope.type === 'message' ? envelope.data?.type : envelope.type;
    const action =
      envelope.type === 'message' ? envelope.data?.action : envelope.action;
    if (commandType !== 'meeting.control' || !this.#call) {
      return;
    }
    const raiseHand = this.#call.feature(Features.RaiseHand);
    if (action === 'raise_hand') {
      await raiseHand.raiseHand();
    } else if (action === 'lower_hand') {
      await raiseHand.lowerHand();
    }
  }
}
