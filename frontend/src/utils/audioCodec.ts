// Audio codec utilities for encoding/decoding audio chunks
export const AUDIO_SAMPLE_RATE = 24000;

/**
 * Encode Float32Array audio to PCM16 (Uint8Array)
 * Required format for Voice Live API
 */
export function encodeAudioChunk(float32: Float32Array): Uint8Array {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return new Uint8Array(int16.buffer);
}

/**
 * Decode PCM16 (Uint8Array) to Float32Array for playback
 */
export function decodeAudioChunk(uint8: Uint8Array, audioContext: AudioContext): AudioBuffer {
  const int16 = new Int16Array(uint8.buffer);
  const float32 = new Float32Array(int16.length);

  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768.0;
  }

  const buffer = audioContext.createBuffer(
    1,
    float32.length,
    AUDIO_SAMPLE_RATE,
  );
  buffer.getChannelData(0).set(float32);

  return buffer;
}

/**
 * Convert base64 string to Uint8Array
 * Voice Live API may send audio as base64
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);

  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return bytes;
}

/**
 * Convert Uint8Array to base64 string
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;

  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary);
}
