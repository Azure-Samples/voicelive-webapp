// Audio debugging utilities
export class AudioDebugger {
  private static chunkCount = 0;
  private static totalLatency = 0;
  private static lastChunkTime = 0;

  static logChunk(size: number, bufferStatus?: { bufferSize: number; isPlaying: boolean }) {
    this.chunkCount++;
    const now = performance.now();
    const timeSinceLastChunk = this.lastChunkTime ? now - this.lastChunkTime : 0;
    
    const bufferInfo = bufferStatus ? ` (buffer: ${bufferStatus.bufferSize}, playing: ${bufferStatus.isPlaying})` : '';
    console.log(`🎵 Audio chunk ${this.chunkCount}: ${size} bytes, gap: ${timeSinceLastChunk.toFixed(2)}ms${bufferInfo}`);
    
    if (timeSinceLastChunk > 100 && this.lastChunkTime > 0) {
      console.warn(`⚠️ Large gap detected: ${timeSinceLastChunk.toFixed(2)}ms`);
    }
    
    this.lastChunkTime = now;
  }

  static reset() {
    this.chunkCount = 0;
    this.totalLatency = 0;
    this.lastChunkTime = 0;
    console.log('🎵 Audio debug reset');
  }

  static getStats() {
    return {
      chunkCount: this.chunkCount,
      averageLatency: this.chunkCount > 0 ? this.totalLatency / this.chunkCount : 0,
    };
  }
}

// Add to window for debugging
if (typeof window !== 'undefined') {
  (window as any).audioDebugger = AudioDebugger;
}