class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetSampleRate = 24000;
    this.chunkSamples = 1200;
    this.sourcePosition = 0;
    this.pending = [];
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) {
      return true;
    }

    const sourceStep = sampleRate / this.targetSampleRate;
    while (this.sourcePosition < input.length) {
      const sample = Math.max(
        -1,
        Math.min(1, input[Math.floor(this.sourcePosition)] ?? 0),
      );
      this.pending.push(sample < 0 ? sample * 32768 : sample * 32767);
      this.sourcePosition += sourceStep;

      if (this.pending.length === this.chunkSamples) {
        const pcm = new Int16Array(this.pending);
        this.port.postMessage(pcm.buffer, [pcm.buffer]);
        this.pending = [];
      }
    }

    this.sourcePosition -= input.length;
    return true;
  }
}

registerProcessor('pcm-capture-processor', PcmCaptureProcessor);
