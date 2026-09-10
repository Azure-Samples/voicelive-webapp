import { PcmCapture, PcmPlayback } from './audio';

export class PersonalMedia {
  readonly #audioContext = new AudioContext();
  readonly #playback = new PcmPlayback(
    this.#audioContext,
    this.#audioContext.destination,
  );
  readonly #video: HTMLVideoElement;
  #avatarAudio?: MediaStreamAudioSourceNode;
  #capture?: PcmCapture;
  #microphone?: MediaStream;
  #hasAvatarAudio = false;

  public constructor(video: HTMLVideoElement) {
    this.#video = video;
  }

  public async startMicrophone(
    onChunk: (chunk: Uint8Array) => void,
  ): Promise<void> {
    this.#microphone = await navigator.mediaDevices.getUserMedia({
      audio: {
        autoGainControl: true,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
      video: false,
    });
    this.#capture = new PcmCapture(this.#audioContext);
    await this.#capture.start(this.#microphone, onChunk);
  }

  public async attachAvatarTrack(
    kind: 'audio' | 'video',
    stream: MediaStream,
  ): Promise<void> {
    if (kind === 'audio') {
      this.#avatarAudio?.disconnect();
      this.#avatarAudio = this.#audioContext.createMediaStreamSource(stream);
      this.#avatarAudio.connect(this.#audioContext.destination);
      this.#hasAvatarAudio = true;
      this.#playback.clear();
      await this.#audioContext.resume();
      return;
    }

    this.#video.srcObject = stream;
    this.#video.muted = true;
    await this.#video.play();
  }

  public async playPcm(pcmBytes: Uint8Array): Promise<void> {
    if (!this.#hasAvatarAudio) {
      await this.#playback.enqueue(pcmBytes);
    }
  }

  public clearPlayback(): void {
    this.#playback.clear();
  }

  public async close(): Promise<void> {
    await this.#capture?.stop();
    for (const track of this.#microphone?.getTracks() ?? []) {
      track.stop();
    }
    this.#avatarAudio?.disconnect();
    this.#playback.clear();
    this.#video.pause();
    this.#video.srcObject = null;
    await this.#audioContext.close();
  }
}
