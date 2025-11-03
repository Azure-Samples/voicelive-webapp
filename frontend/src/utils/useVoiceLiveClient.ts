import { useRef, useCallback, useState } from 'react';
import { config, buildWebSocketUrl } from '../config';
import { uint8ArrayToBase64 } from './audioCodec';
import type { ConnectionState } from '../types';
import { WebRTCAvatarManager } from './WebRTCAvatarManager';

type MessageHandler = (message: any) => void;
type AudioHandler = (audioData: Uint8Array) => void;
type TranscriptHandler = (text: string, role: 'user' | 'agent') => void;

/**
 * Voice Live WebSocket Manager Hook
 * Manages WebSocket connection to Azure Voice Live API
 */
export function useVoiceLiveClient() {
  const wsRef = useRef<WebSocket | null>(null);
  const avatarManagerRef = useRef<WebRTCAvatarManager | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState['status']>('disconnected');
  const [sessionId, setSessionId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isAvatarReady, setIsAvatarReady] = useState<boolean>(false);

  // Message handlers
  const onMessageHandlerRef = useRef<MessageHandler | null>(null);
  const onAudioHandlerRef = useRef<AudioHandler | null>(null);
  const onTranscriptHandlerRef = useRef<TranscriptHandler | null>(null);

  /**
   * Send avatar offer to Azure via WebSocket
   */
  const sendAvatarOffer = useCallback((sdp: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const offerMessage = {
        type: 'session.avatar.connect',
        client_sdp: sdp
      };
      wsRef.current.send(JSON.stringify(offerMessage));
      console.log('📤 Sent avatar offer to Azure');
    } else {
      console.error('❌ Cannot send avatar offer: WebSocket not connected');
    }
  }, []);

  /**
   * Initialize avatar manager if avatar is enabled
   */
  const initializeAvatarManager = useCallback(() => {
    if (!avatarManagerRef.current) {
      console.log('🎭 Initializing WebRTC Avatar Manager...');
      avatarManagerRef.current = new WebRTCAvatarManager(sendAvatarOffer);
      
      // Set up avatar ready callback
      avatarManagerRef.current.onReady(() => {
        console.log('✅ Avatar is ready for display');
        setIsAvatarReady(true);
      });

      // Set up connection state callback
      avatarManagerRef.current.onConnectionState((state) => {
        console.log('🔗 Avatar WebRTC state:', state);
      });
    }
  }, [sendAvatarOffer]);

  /**
   * Set avatar media elements (foundry pattern compatibility)
   */
  const setAvatarMediaElements = useCallback((elements: { video: HTMLVideoElement | null; audio: HTMLAudioElement | null }) => {
    if (avatarManagerRef.current) {
      avatarManagerRef.current.setMediaElements(elements);
    }
  }, []);

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
            ...(session.avatar.video && { video: session.avatar.video }),
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
      
      // Debug: Log full message for avatar-related messages
      if (message.type === 'session.created' || message.type === 'session.updated' || message.session?.avatar) {
        console.log('🔍 Full message details:', JSON.stringify(message, null, 2));
      }

      switch (message.type) {
        case 'proxy.connected':
          console.log('✅ Connected to Azure proxy:', message.message);
          break;

        case 'session.created':
          console.log('✅ Session created:', message.session?.id || 'unknown');
          setSessionId(message.session?.id || 'proxy-session');
          setConnectionState('connected');
          
          // Handle avatar setup if ICE servers are provided
          if (message.session?.avatar?.ice_servers && avatarManagerRef.current) {
            console.log('🎭 Setting up avatar WebRTC with ICE servers:', message.session.avatar.ice_servers);
            avatarManagerRef.current.setupPeerConnection(message.session.avatar.ice_servers)
              .then(() => avatarManagerRef.current?.createOfferAndConnect())
              .catch(error => {
                console.error('❌ Avatar setup failed:', error);
                setIsAvatarReady(false);
              });
          }
          break;

        case 'session.updated':
          console.log('✅ Session updated');
          
          // Handle avatar setup - this is the key message from Azure with ICE servers
          if (message.session?.avatar?.ice_servers && avatarManagerRef.current) {
            console.log('🎭 Setting up avatar WebRTC from session update!');
            console.log('🧊 ICE servers received:', message.session.avatar.ice_servers.length, 'servers');
            console.log('🔍 Avatar manager exists:', !!avatarManagerRef.current);
            setIsAvatarReady(false);
            avatarManagerRef.current.setupPeerConnection(message.session.avatar.ice_servers)
              .then(() => {
                console.log('✅ Peer connection setup complete, creating offer...');
                return avatarManagerRef.current?.createOfferAndConnect();
              })
              .catch(error => {
                console.error('❌ Avatar setup failed:', error);
                // Avatar setup failed, but continue with voice-only mode
              });
          } else {
            if (!message.session?.avatar?.ice_servers) {
              console.log('⚠️ No ICE servers in session.updated message');
            }
            if (!avatarManagerRef.current) {
              console.log('⚠️ No avatar manager available');
            }
          }
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
          // Handle SDP answers that might come in various message types
          if ((message.server_sdp || message.sdp || message.answer) && 
              message.type !== 'session.update' && avatarManagerRef.current) {
            console.log('📥 Received SDP answer from Azure:', message.type);
            const sdp = message.server_sdp || message.sdp || message.answer;
            avatarManagerRef.current.handleAnswer(sdp)
              .then(() => {
                console.log('✅ Avatar WebRTC connection established');
                setIsAvatarReady(true);
              })
              .catch(error => {
                console.error('❌ Failed to establish avatar connection:', error);
                setIsAvatarReady(false);
              });
          } else if (onMessageHandlerRef.current) {
            // Forward other messages to handler
            onMessageHandlerRef.current(message);
          }
          break;
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
      console.log('🔌 Connecting to FastAPI proxy backend...');

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('✅ WebSocket connected to proxy backend');
        
        // Initialize avatar manager for WebRTC setup
        initializeAvatarManager();
        
        // Backend handles initial session setup with avatar configuration
        // Just wait for session.updated message with ICE servers
      };

      ws.onmessage = handleMessage;

      ws.onerror = error => {
        console.error('❌ WebSocket error:', error);
        setError('WebSocket connection error');
        setConnectionState('error');
      };

      ws.onclose = () => {
        console.log('🔌 WebSocket closed');
        setConnectionState('disconnected');
        setSessionId('');
      };
    } catch (error) {
      console.error('Connection error:', error);
      setError(error instanceof Error ? error.message : 'Connection failed');
      setConnectionState('error');
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
    
    // Cleanup avatar manager
    if (avatarManagerRef.current) {
      avatarManagerRef.current.close();
      avatarManagerRef.current = null;
    }
    
    setConnectionState('disconnected');
    setSessionId('');
    setIsAvatarReady(false);
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
    // Avatar support
    isAvatarReady,
    setAvatarMediaElements,
    avatarEnabled: config.session.avatar?.enabled || false,
  };
}
