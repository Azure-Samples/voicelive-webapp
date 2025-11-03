import { useRef, useCallback } from 'react';
import {
  encodeAudioChunk,
  decodeAudioChunk,
  AUDIO_SAMPLE_RATE,
} from './audioCodec';
import audioProcessorCode from './audioProcessor.worklet.js?raw';

/**
 * Audio Manager Hook
 * Handles microphone recording and audio playback for Voice Live Agent
 */
export function useAudioManager() {
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioWorkletNodeRef = useRef<AudioWorkletNode | null>(null);
  const analyserNodeRef = useRef<AnalyserNode | null>(null);
  const playbackQueueRef = useRef<AudioBufferSourceNode[]>([]);
  const lastPlayTimeRef = useRef<number>(0);
  const isRecordingRef = useRef<boolean>(false);

  /**
   * Request microphone permission and get media stream
   */
  const requestMicrophonePermission = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false, // Server handles echo cancellation
          noiseSuppression: false, // Server handles noise suppression
          autoGainControl: true,
          sampleRate: AUDIO_SAMPLE_RATE,
        },
        video: false,
      });
      return stream;
    } catch (error) {
      console.error('Microphone permission error:', error);
      throw new Error(getMicrophoneErrorMessage(error));
    }
  }, []);

  /**
   * Setup audio worklet for processing microphone input
   */
  const setupAudioWorklet = useCallback(async (audioContext: AudioContext) => {
    const blob = new Blob([audioProcessorCode], {
      type: 'application/javascript',
    });
    const workletUrl = URL.createObjectURL(blob);

    try {
      await audioContext.audioWorklet.addModule(workletUrl);
    } finally {
      URL.revokeObjectURL(workletUrl);
    }
  }, []);

  /**
   * Start recording audio from microphone
   * @param {Function} onAudioData - Callback to send encoded audio chunks
   */
  const startRecording = useCallback(
    async (onAudioData: (data: Uint8Array) => void) => {
      if (isRecordingRef.current) {
        console.warn('Already recording');
        return;
      }

      try {
        const stream = await requestMicrophonePermission();
        mediaStreamRef.current = stream;

        const audioContext = new AudioContext({
          sampleRate: AUDIO_SAMPLE_RATE,
        });
        audioContextRef.current = audioContext;

        await setupAudioWorklet(audioContext);

        // Create analyser for audio level visualization
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.8;
        analyserNodeRef.current = analyser;

        // Create microphone source
        const microphone = audioContext.createMediaStreamSource(stream);
        microphone.connect(analyser);

        // Create audio worklet node
        const audioWorkletNode = new AudioWorkletNode(
          audioContext,
          'audio-processor',
        );
        audioWorkletNodeRef.current = audioWorkletNode;

        // Handle audio data from worklet
        audioWorkletNode.port.onmessage = event => {
          if (event.data.eventType === 'audio') {
            const encodedChunk = encodeAudioChunk(event.data.audioData);
            onAudioData(encodedChunk);
          }
        };

        // Connect nodes
        analyser.connect(audioWorkletNode);
        audioWorkletNode.connect(audioContext.destination);

        // Start recording
        audioWorkletNode.port.postMessage({ command: 'START_RECORDING' });
        isRecordingRef.current = true;

        console.log('✅ Recording started');
      } catch (error) {
        console.error('Failed to start recording:', error);
        throw error;
      }
    },
    [requestMicrophonePermission, setupAudioWorklet],
  );

  /**
   * Stop recording audio
   */
  const stopRecording = useCallback(async () => {
    if (!isRecordingRef.current) return;

    try {
      // Stop worklet
      if (audioWorkletNodeRef.current) {
        audioWorkletNodeRef.current.port.postMessage({
          command: 'STOP_RECORDING',
        });
        audioWorkletNodeRef.current.disconnect();
        audioWorkletNodeRef.current = null;
      }

      // Disconnect analyser
      if (analyserNodeRef.current) {
        analyserNodeRef.current.disconnect();
        analyserNodeRef.current = null;
      }

      // Stop media stream
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
      }

      // Close audio context
      if (
        audioContextRef.current &&
        audioContextRef.current.state !== 'closed'
      ) {
        await audioContextRef.current.close();
        audioContextRef.current = null;
      }

      isRecordingRef.current = false;
      console.log('✅ Recording stopped');
    } catch (error) {
      console.error('Error stopping recording:', error);
    }
  }, []);

  /**
   * Play audio chunk received from Voice Live API
   * @param {Uint8Array} audioChunk - PCM16 audio data
   */
  const playAudioChunk = useCallback((audioChunk: Uint8Array) => {
    if (!audioContextRef.current) {
      console.warn('No audio context for playback');
      return;
    }

    try {
      const audioBuffer = decodeAudioChunk(audioChunk, audioContextRef.current);
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);

      const chunkDuration = audioBuffer.duration;
      const currentTime = audioContextRef.current.currentTime;

      if (lastPlayTimeRef.current < currentTime) {
        lastPlayTimeRef.current = currentTime;
      }

      source.start(lastPlayTimeRef.current);
      playbackQueueRef.current.push(source);
      lastPlayTimeRef.current += chunkDuration;

      source.onended = () => {
        const index = playbackQueueRef.current.indexOf(source);
        if (index !== -1) {
          playbackQueueRef.current.splice(index, 1);
        }
      };
    } catch (error) {
      console.error('Error playing audio chunk:', error);
    }
  }, []);

  /**
   * Stop all playing audio (user interruption)
   */
  const stopPlayback = useCallback(() => {
    if (playbackQueueRef.current.length > 0) {
      playbackQueueRef.current.forEach(source => {
        try {
          source.stop();
          source.disconnect();
        } catch {
          // Ignore errors if already stopped
        }
      });
      playbackQueueRef.current = [];
      lastPlayTimeRef.current = audioContextRef.current?.currentTime || 0;
    }
  }, []);

  /**
   * Get current audio level for visualization
   * @returns {number} Audio level (0-255)
   */
  const getAudioLevel = useCallback(() => {
    if (!analyserNodeRef.current) return 0;

    const dataArray = new Uint8Array(analyserNodeRef.current.frequencyBinCount);
    analyserNodeRef.current.getByteFrequencyData(dataArray);

    const average =
      dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
    return average;
  }, []);

  return {
    startRecording,
    stopRecording,
    playAudioChunk,
    stopPlayback,
    getAudioLevel,
    isRecording: () => isRecordingRef.current,
  };
}

/**
 * Get user-friendly error message for microphone errors
 */
function getMicrophoneErrorMessage(error: any): string {
  if (error instanceof DOMException) {
    switch (error.name) {
      case 'NotFoundError':
        return 'No microphone found. Please connect a microphone and try again.';
      case 'NotAllowedError':
        return 'Microphone access denied. Please allow microphone permissions and try again.';
      case 'NotReadableError':
        return 'Microphone is already in use by another application.';
      case 'OverconstrainedError':
        return 'No microphone meets the required specifications.';
      case 'SecurityError':
        return 'Microphone access blocked for security reasons. Please use HTTPS.';
      default:
        return `Microphone error: ${error.message}`;
    }
  }
  return error?.message || 'Unknown microphone error';
}
