import { useRef, useCallback, useState } from 'react';
import { config, buildWebSocketUrl, getAuthHeaders } from '../config';
import { uint8ArrayToBase64 } from './audioCodec';
import type { ConnectionState } from '../types';

type MessageHandler = (message: any) => void;
type AudioHandler = (audioData: Uint8Array) => void;
type TranscriptHandler = (text: string, role: 'user' | 'agent') => void;

/**
 * Voice Live WebSocket Manager Hook
 * Manages WebSocket connection to Azure Voice Live API
 */
export function useVoiceLiveClient() {
  const wsRef = useRef<WebSocket | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState['status']>('disconnected');
  const [sessionId, setSessionId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Message handlers
  const onMessageHandlerRef = useRef<MessageHandler | null>(null);
  const onAudioHandlerRef = useRef<AudioHandler | null>(null);
  const onTranscriptHandlerRef = useRef<TranscriptHandler | null>(null);

  /**
   * Build session update message
   */
  const buildSessionUpdate = useCallback(() => {
    const { session } = config;

    return {
      type: 'session.update',
      session: {
        instructions: session.instructions,
        modalities: session.modalities,
        voice: {
          name: session.voice.name,
          type: session.voice.type,
          ...(session.voice.temperature && {
            temperature: session.voice.temperature,
          }),
          ...(session.voice.rate && { rate: session.voice.rate }),
        },
        turn_detection: {
          type: session.turnDetection.type,
          threshold: session.turnDetection.threshold,
          prefix_padding_ms: session.turnDetection.prefixPaddingMs,
          speech_duration_ms: session.turnDetection.speechDurationMs,
          silence_duration_ms: session.turnDetection.silenceDurationMs,
          remove_filler_words: session.turnDetection.removeFillerWords,
          ...(session.turnDetection.endOfUtteranceDetection && {
            end_of_utterance_detection: {
              model: session.turnDetection.endOfUtteranceDetection.model,
              threshold:
                session.turnDetection.endOfUtteranceDetection.threshold,
              timeout: session.turnDetection.endOfUtteranceDetection.timeout,
            },
          }),
        },
        input_audio_sampling_rate: session.inputAudio.samplingRate,
        ...(session.inputAudio.transcription && {
          input_audio_transcription: session.inputAudio.transcription,
        }),
        ...(session.inputAudio.noiseReduction && {
          input_audio_noise_reduction: session.inputAudio.noiseReduction,
        }),
        ...(session.inputAudio.echoCancellation && {
          input_audio_echo_cancellation: session.inputAudio.echoCancellation,
        }),
        ...(session.outputAudio.timestampTypes && {
          output_audio_timestamp_types: session.outputAudio.timestampTypes,
        }),
        ...(session.avatar?.enabled && {
          avatar: {
            character: session.avatar.character,
            style: session.avatar.style,
            customized: session.avatar.customized,
            video: session.avatar.video,
          },
        }),
      },
    };
  }, []);

  /**
   * Handle incoming WebSocket messages
   */
  const handleMessage = useCallback(event => {
    try {
      const message = JSON.parse(event.data);
      console.log('📩 Received message:', message.type);

      switch (message.type) {
        case 'session.created':
          console.log('✅ Session created:', message.session.id);
          setSessionId(message.session.id);
          setConnectionState('connected');
          break;

        case 'session.updated':
          console.log('✅ Session updated');
          break;

        case 'error':
          console.error('❌ Server error:', message.error);
          setError(message.error.message || 'Server error');
          setConnectionState('error');
          break;

        case 'response.audio.delta':
          // Audio chunk from agent
          if (message.delta && onAudioHandlerRef.current) {
            // Decode base64 audio
            const audioData = Uint8Array.from(atob(message.delta), c =>
              c.charCodeAt(0),
            );
            onAudioHandlerRef.current(audioData);
          }
          break;

        case 'response.audio_transcript.delta':
          // Transcript from agent's speech
          if (message.delta && onTranscriptHandlerRef.current) {
            onTranscriptHandlerRef.current(message.delta, 'agent');
          }
          break;

        case 'conversation.item.input_audio_transcription.completed':
          // User's speech transcription completed
          if (message.transcript && onTranscriptHandlerRef.current) {
            onTranscriptHandlerRef.current(message.transcript, 'user');
          }
          break;

        case 'response.done':
          console.log('✅ Response completed');
          break;

        case 'input_audio_buffer.speech_started':
          console.log('🎤 User started speaking');
          if (onMessageHandlerRef.current) {
            onMessageHandlerRef.current({ type: 'user_started_speaking' });
          }
          break;

        case 'input_audio_buffer.speech_stopped':
          console.log('🎤 User stopped speaking');
          if (onMessageHandlerRef.current) {
            onMessageHandlerRef.current({ type: 'user_stopped_speaking' });
          }
          break;

        case 'response.video.delta':
          // Avatar video chunk
          console.log('📹 Avatar video delta received');
          if (onMessageHandlerRef.current) {
            onMessageHandlerRef.current(message);
          }
          break;

        case 'session.avatar.ready':
          // Avatar is ready
          console.log('✅ Avatar ready');
          if (onMessageHandlerRef.current) {
            onMessageHandlerRef.current(message);
          }
          break;

        default:
          // Forward other messages to handler
          if (onMessageHandlerRef.current) {
            onMessageHandlerRef.current(message);
          }
      }
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  }, []);

  /**
   * Connect to Voice Live API
   */
  const connect = useCallback(async () => {
    if (connectionState === 'connecting' || connectionState === 'connected') {
      console.warn('Already connecting or connected');
      return;
    }

    try {
      setConnectionState('connecting');
      setError(null);

      const wsUrl = buildWebSocketUrl();
      const authHeaders = await getAuthHeaders();

      console.log('🔌 Connecting to Voice Live API...');

      // WebSocket doesn't support custom headers directly
      // We need to include authentication in the URL
      let finalUrl = wsUrl;
      
      if (authHeaders['api-key']) {
        finalUrl += `&api-key=${encodeURIComponent(authHeaders['api-key'])}`;
      } else if (authHeaders['Authorization']) {
        // For Bearer tokens, extract the token part and add it as a parameter
        const token = authHeaders['Authorization'].replace('Bearer ', '');
        finalUrl += `&authorization=${encodeURIComponent(token)}`;
      }

      const ws = new WebSocket(finalUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('✅ WebSocket connected');

        // Send session update
        const sessionUpdate = buildSessionUpdate();
        ws.send(JSON.stringify(sessionUpdate));
      };

      ws.onmessage = handleMessage;

      ws.onerror = error => {
        console.error('❌ WebSocket error:', error);
        setError('WebSocket connection error');
        setConnectionState('failed');
      };

      ws.onclose = () => {
        console.log('🔌 WebSocket closed');
        setConnectionState('disconnected');
        setSessionId('');
      };
    } catch (error) {
      console.error('Connection error:', error);
      setError(error.message);
      setConnectionState('failed');
    }
  }, [connectionState, buildSessionUpdate, handleMessage]);

  /**
   * Disconnect from Voice Live API
   */
  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnectionState('disconnected');
    setSessionId('');
  }, []);

  /**
   * Send audio chunk to Voice Live API
   */
  const sendAudio = useCallback(
    audioChunk => {
      if (!wsRef.current || connectionState !== 'connected') {
        console.warn('Cannot send audio: not connected');
        return;
      }

      try {
        const base64Audio = uint8ArrayToBase64(audioChunk);
        const message = {
          type: 'input_audio_buffer.append',
          audio: base64Audio,
        };
        wsRef.current.send(JSON.stringify(message));
      } catch (error) {
        console.error('Error sending audio:', error);
      }
    },
    [connectionState],
  );

  /**
   * Send text message to agent
   */
  const sendText = useCallback(
    text => {
      if (!wsRef.current || connectionState !== 'connected') {
        console.warn('Cannot send text: not connected');
        return;
      }

      try {
        const message = {
          type: 'conversation.item.create',
          item: {
            type: 'message',
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: text,
              },
            ],
          },
        };
        wsRef.current.send(JSON.stringify(message));

        // Trigger response
        wsRef.current.send(JSON.stringify({ type: 'response.create' }));
      } catch (error) {
        console.error('Error sending text:', error);
      }
    },
    [connectionState],
  );

  /**
   * Trigger assistant response without user input (for proactive engagement)
   */
  const triggerResponse = useCallback(() => {
    if (!wsRef.current || connectionState !== 'connected') {
      console.warn('Cannot trigger response: not connected');
      return;
    }

    try {
      // Just send response.create to make the assistant start talking
      wsRef.current.send(JSON.stringify({ type: 'response.create' }));
    } catch (error) {
      console.error('Error triggering response:', error);
    }
  }, [connectionState]);

  /**
   * Register event handlers
   */
  const onMessage = useCallback(handler => {
    onMessageHandlerRef.current = handler;
  }, []);

  const onAudio = useCallback(handler => {
    onAudioHandlerRef.current = handler;
  }, []);

  const onTranscript = useCallback(handler => {
    onTranscriptHandlerRef.current = handler;
  }, []);

  return {
    connect,
    disconnect,
    sendAudio,
    sendText,
    triggerResponse,
    onMessage,
    onAudio,
    onTranscript,
    connectionState,
    sessionId,
    error,
    isConnected: connectionState === 'connected',
  };
}
