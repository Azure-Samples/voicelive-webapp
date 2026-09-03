import { LocalAudioStream, LocalVideoStream } from '@azure/communication-calling';

import { PcmPlayback } from './audio';

export class MediaBridge {
  public readonly localAudioStream: LocalAudioStream;
  public readonly localVideoStream: LocalVideoStream;
  public readonly audioContext: AudioContext;

  readonly #canvas: HTMLCanvasElement;
  readonly #canvasContext: CanvasRenderingContext2D;
  readonly #audioDestination: MediaStreamAudioDestinationNode;
  readonly #playback: PcmPlayback;
  readonly #silentSource: ConstantSourceNode;
  readonly #silentGain: GainNode;
  #avatarAudioSource?: MediaStreamAudioSourceNode;
  #avatarVideo?: HTMLVideoElement;
  #animationFrame?: number;
  #hasAvatarAudio = false;

  public constructor(canvas: HTMLCanvasElement) {
    this.#canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas video is unavailable.');
    }
    this.#canvasContext = context;
    this.drawPlaceholder('Waiting for avatar');

    this.audioContext = new AudioContext();
    this.#audioDestination =
      this.audioContext.createMediaStreamDestination();
    this.#playback = new PcmPlayback(
      this.audioContext,
      this.#audioDestination,
    );

    this.#silentSource = this.audioContext.createConstantSource();
    this.#silentGain = this.audioContext.createGain();
    this.#silentGain.gain.value = 0;
    this.#silentSource.connect(this.#silentGain);
    this.#silentGain.connect(this.#audioDestination);
    this.#silentSource.start();

    this.localAudioStream = new LocalAudioStream(
      this.#audioDestination.stream,
    );
    this.localVideoStream = new LocalVideoStream(
      this.#canvas.captureStream(30),
    );
  }

  public async attachAvatarTrack(
    kind: 'audio' | 'video',
    stream: MediaStream,
  ): Promise<void> {
    if (kind === 'audio') {
      this.#avatarAudioSource?.disconnect();
      this.#avatarAudioSource =
        this.audioContext.createMediaStreamSource(stream);
      this.#avatarAudioSource.connect(this.#audioDestination);
      this.#hasAvatarAudio = true;
      this.#playback.clear();
      await this.audioContext.resume();
      return;
    }

    this.#avatarVideo?.pause();
    if (this.#animationFrame !== undefined) {
      cancelAnimationFrame(this.#animationFrame);
    }

    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    this.#avatarVideo = video;
    await video.play();

    const drawFrame = () => {
      if (!this.#avatarVideo) {
        return;
      }
      this.#canvasContext.drawImage(
        this.#avatarVideo,
        0,
        0,
        this.#canvas.width,
        this.#canvas.height,
      );
      this.#animationFrame = requestAnimationFrame(drawFrame);
    };
    drawFrame();
  }

  public async playPcm(pcmBytes: Uint8Array): Promise<void> {
    if (!this.#hasAvatarAudio) {
      await this.#playback.enqueue(pcmBytes);
    }
  }

  public clearPlayback(): void {
    this.#playback.clear();
  }

  public drawPlaceholder(message: string): void {
    const gradient = this.#canvasContext.createLinearGradient(
      0,
      0,
      this.#canvas.width,
      this.#canvas.height,
    );
    gradient.addColorStop(0, '#0f3b5f');
    gradient.addColorStop(1, '#5b2c83');
    this.#canvasContext.fillStyle = gradient;
    this.#canvasContext.fillRect(
      0,
      0,
      this.#canvas.width,
      this.#canvas.height,
    );
    this.#canvasContext.fillStyle = '#ffffff';
    this.#canvasContext.font = '600 42px Segoe UI, sans-serif';
    this.#canvasContext.textAlign = 'center';
    this.#canvasContext.fillText(
      message,
      this.#canvas.width / 2,
      this.#canvas.height / 2,
    );
  }

  public async close(): Promise<void> {
    if (this.#animationFrame !== undefined) {
      cancelAnimationFrame(this.#animationFrame);
    }
    this.#avatarVideo?.pause();
    if (this.#avatarVideo) {
      this.#avatarVideo.srcObject = null;
    }
    this.#avatarAudioSource?.disconnect();
    this.#silentSource.stop();
    this.#silentSource.disconnect();
    this.#silentGain.disconnect();
    this.#playback.clear();
    for (const track of this.#audioDestination.stream.getTracks()) {
      track.stop();
    }
    await this.audioContext.close();
  }
}
