import { base64ToBytes, bytesToBase64 } from './audio';
import { AvatarSession } from './avatarSession';

interface FoundryVoiceSessionOptions {
  profileId: string;
  sessionId: string;
  meetingBrief: string;
  onStatus: (status: string) => void;
  onAvatarStatus: (status: string) => void;
  onAudio: (pcmBytes: Uint8Array) => Promise<void>;
  onInterruption: () => void;
  onAvatarTrack: (
    kind: 'audio' | 'video',
    stream: MediaStream,
  ) => Promise<void>;
  onTranscript: (role: 'You' | 'Agent', text: string) => void;
}

type ServiceEvent = Record<string, unknown> & { type?: string };

export class FoundryVoiceSession {
  readonly #options: FoundryVoiceSessionOptions;
  readonly #avatar: AvatarSession;
  #socket?: WebSocket;

  public constructor(options: FoundryVoiceSessionOptions) {
    this.#options = options;
    this.#avatar = new AvatarSession(
      event => this.sendEvent(event),
      options.onAvatarTrack,
    );
  }

  public connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = new URL('/api/voice', window.location.origin);
      url.protocol = protocol;
      url.searchParams.set('profile', this.#options.profileId);

      const socket = new WebSocket(url);
      this.#socket = socket;
      this.#options.onStatus('Connecting');

      const connectTimeout = window.setTimeout(() => {
        reject(new Error('Timed out while connecting to the Foundry agent.'));
        this.close();
      }, 65_000);

      socket.onopen = () => {
        socket.send(
          JSON.stringify({
            type: 'bridge.configure',
            meetingBrief: this.#options.meetingBrief,
            sessionId: this.#options.sessionId,
          }),
        );
      };

      socket.onmessage = event => {
        void (async () => {
          try {
            const message = JSON.parse(String(event.data)) as ServiceEvent;
            if (message.type === 'bridge.ready') {
              window.clearTimeout(connectTimeout);
              this.#options.onStatus('Connected');
              resolve();
              return;
            }
            if (message.type === 'bridge.error') {
              throw new Error(
                typeof message.message === 'string'
                  ? message.message
                  : 'The bridge returned an error.',
              );
            }
            await this.#handleServiceEvent(message);
          } catch (error) {
            window.clearTimeout(connectTimeout);
            reject(error);
            this.close();
          }
        })();
      };

      socket.onerror = () => {
        window.clearTimeout(connectTimeout);
        reject(new Error('The Foundry agent WebSocket failed.'));
      };
      socket.onclose = () => {
        window.clearTimeout(connectTimeout);
        this.#options.onStatus('Disconnected');
      };
    });
  }

  public sendAudio(chunk: Uint8Array): void {
    this.sendEvent({
      type: 'input_audio_buffer.append',
      audio: bytesToBase64(chunk),
    });
  }

  public sendEvent(event: Record<string, unknown>): void {
    if (this.#socket?.readyState !== WebSocket.OPEN) {
      throw new Error('The Foundry agent connection is not open.');
    }
    this.#socket.send(JSON.stringify(event));
  }

  public close(): void {
    this.#avatar.close();
    if (
      this.#socket &&
      (this.#socket.readyState === WebSocket.OPEN ||
        this.#socket.readyState === WebSocket.CONNECTING)
    ) {
      this.#socket.close();
    }
    this.#socket = undefined;
  }

  async #handleServiceEvent(event: ServiceEvent): Promise<void> {
    switch (event.type) {
      case 'input_audio_buffer.speech_started':
        this.#options.onInterruption();
        break;
      case 'conversation.item.input_audio_transcription.completed':
        if (typeof event.transcript === 'string') {
          this.#options.onTranscript('You', event.transcript);
        }
        break;
      case 'response.audio_transcript.done':
        if (typeof event.transcript === 'string') {
          this.#options.onTranscript('Agent', event.transcript);
        }
        break;
      case 'response.audio.delta':
        if (typeof event.delta === 'string') {
          await this.#options.onAudio(base64ToBytes(event.delta));
        }
        break;
      case 'session.updated': {
        const session = event.session as
          | {
              avatar?: {
                ice_servers?: RTCIceServer[];
                iceServers?: RTCIceServer[];
              };
            }
          | undefined;
        const iceServers =
          session?.avatar?.ice_servers ?? session?.avatar?.iceServers;
        if (iceServers?.length) {
          this.#options.onAvatarStatus('Connecting');
          await this.#avatar.connect(iceServers);
        }
        break;
      }
      case 'session.avatar.connecting': {
        const serverSdp =
          typeof event.server_sdp === 'string'
            ? event.server_sdp
            : typeof event.serverSdp === 'string'
              ? event.serverSdp
              : undefined;
        if (serverSdp) {
          await this.#avatar.applyServerSdp(serverSdp);
        }
        break;
      }
      case 'session.avatar.connected':
        this.#options.onAvatarStatus('Connected');
        break;
      case 'error': {
        const serviceError = event.error as
          | { message?: string; code?: string }
          | undefined;
        throw new Error(
          serviceError?.message ||
            serviceError?.code ||
            'The Foundry agent returned an error.',
        );
      }
      default:
        break;
    }
  }
}
