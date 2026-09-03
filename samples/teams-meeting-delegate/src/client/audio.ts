export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const blockSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += blockSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + blockSize),
    );
  }
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export class PcmCapture {
  readonly #context: AudioContext;
  #source?: MediaStreamAudioSourceNode;
  #worklet?: AudioWorkletNode;
  #silence?: GainNode;

  public constructor(context: AudioContext) {
    this.#context = context;
  }

  public async start(
    stream: MediaStream,
    onChunk: (chunk: Uint8Array) => void,
  ): Promise<void> {
    await this.stop();
    await this.#context.audioWorklet.addModule('/pcm-capture-processor.js');
    await this.#context.resume();

    this.#source = this.#context.createMediaStreamSource(stream);
    this.#worklet = new AudioWorkletNode(
      this.#context,
      'pcm-capture-processor',
    );
    this.#silence = this.#context.createGain();
    this.#silence.gain.value = 0;
    this.#worklet.port.onmessage = event => {
      if (event.data instanceof ArrayBuffer) {
        onChunk(new Uint8Array(event.data));
      }
    };

    this.#source.connect(this.#worklet);
    this.#worklet.connect(this.#silence);
    this.#silence.connect(this.#context.destination);
  }

  public async stop(): Promise<void> {
    this.#source?.disconnect();
    this.#worklet?.disconnect();
    this.#silence?.disconnect();
    this.#worklet = undefined;
    this.#source = undefined;
    this.#silence = undefined;
  }
}

export class PcmPlayback {
  readonly #context: AudioContext;
  readonly #destination: AudioNode;
  readonly #sources = new Set<AudioBufferSourceNode>();
  #nextStartTime = 0;

  public constructor(context: AudioContext, destination: AudioNode) {
    this.#context = context;
    this.#destination = destination;
  }

  public async enqueue(pcmBytes: Uint8Array): Promise<void> {
    await this.#context.resume();
    const alignedLength = pcmBytes.byteLength - (pcmBytes.byteLength % 2);
    const samples = new Int16Array(
      pcmBytes.buffer,
      pcmBytes.byteOffset,
      alignedLength / 2,
    );
    const buffer = this.#context.createBuffer(1, samples.length, 24_000);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < samples.length; index += 1) {
      channel[index] = (samples[index] ?? 0) / 32_768;
    }

    const source = this.#context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.#destination);
    source.onended = () => this.#sources.delete(source);
    this.#sources.add(source);

    const startAt = Math.max(this.#context.currentTime, this.#nextStartTime);
    source.start(startAt);
    this.#nextStartTime = startAt + buffer.duration;
  }

  public clear(): void {
    for (const source of this.#sources) {
      try {
        source.stop();
      } catch {
        // The source can already be stopped by the browser.
      }
    }
    this.#sources.clear();
    this.#nextStartTime = this.#context.currentTime;
  }
}
