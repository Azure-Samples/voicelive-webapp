// Audio worklet processor for capturing microphone input
// This runs in the Audio Worklet thread, separate from the main thread

class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.isRecording = false;
    this.bufferSize = 2400; // ~100ms at 24kHz
    this.currentBuffer = [];

    this.port.onmessage = e => {
      if (e.data && e.data.command === 'START_RECORDING') {
        this.isRecording = true;
        this.currentBuffer = [];
      } else if (e.data && e.data.command === 'STOP_RECORDING') {
        this.isRecording = false;
        if (this.currentBuffer.length > 0) {
          this.sendBuffer();
        }
      }
    };
  }

  sendBuffer() {
    if (this.currentBuffer.length > 0) {
      const audioData = new Float32Array(this.currentBuffer);
      this.port.postMessage({
        eventType: 'audio',
        audioData: audioData,
      });
      this.currentBuffer = [];
    }
  }

  process(inputs) {
    const input = inputs[0];

    if (input && input[0] && this.isRecording) {
      const audioData = input[0];
      this.currentBuffer.push(...audioData);

      if (this.currentBuffer.length >= this.bufferSize) {
        this.sendBuffer();
      }
    }

    return true; // Keep processor alive
  }
}

registerProcessor('audio-processor', AudioProcessor);
