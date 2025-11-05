import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useVoiceLiveClient } from '../utils/useVoiceLiveClient';
import { useAudioManager } from '../utils/useAudioManager';
import { AvatarDisplay } from './AvatarDisplay';
import { config } from '../config';
import { AudioDebugger } from '../utils/audioDebugger';
import { SPEECH_AVATARS_FULL } from '../utils/avatarPersonnelList';
import './VoiceLiveAgent.css';

interface Message {
  id: string;
  role: 'user' | 'agent';
  message: string;
  completed?: boolean;
  timestamp: number;
}

interface BackendConfig {
  ws_endpoint: string;
  config: {
    'speech.language': string;
    'speech.voice.shortName': string;
    'speech.voice.voiceType': string;
    'speech.voiceTemperature': number;
    'speech.speakingRate': number;
    'speech.voiceActivityDetection': string;
    'speech.endOfUtterance': boolean;
    'speech.inputModel': string;
    'avatar.avatar': boolean;
    'avatar.selectedAvatar.avatarName': string;
    'avatar.selectedAvatar.isCustomAvatar': boolean;
  };
}

export function VoiceLiveAgent(): JSX.Element {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isAgentSpeaking, setIsAgentSpeaking] = useState<boolean>(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState<boolean>(false);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [showCaptions, setShowCaptions] = useState<boolean>(false);
  const [avatarData, setAvatarData] = useState<Uint8Array | null>(null);
  const [backendConfig, setBackendConfig] = useState<BackendConfig | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  // Note: isAvatarReady now comes from useVoiceLiveClient hook

  const audioLevelIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageIdRef = useRef<number>(0);

  // Voice Live Client
  const {
    connect,
    disconnect,
    sendAudio,
    triggerResponse,
    onMessage,
    onAudio,
    onTranscript,
    connectionState,
    error,
    isConnected,
    isAvatarReady,
    setAvatarMediaElements,
  } = useVoiceLiveClient();

  // Audio Manager
  const {
    startRecording,
    stopRecording,
    playAudioChunk,
    stopPlayback,
    getAudioLevel,
    isRecording,
  } = useAudioManager();

  // Fetch backend config on mount
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        setIsLoading(true);
        const response = await fetch('http://localhost:8080/config');
        const data = await response.json();
        console.log('🔧 Backend config:', data);
        setBackendConfig(data);
      } catch (error) {
        console.error('❌ Error fetching backend config:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchConfig();
  }, []);

  // Find avatar details from the personnel list
  const avatarDetails = useMemo(() => {
    if (!backendConfig) return null;

    const avatarName = backendConfig.config['avatar.selectedAvatar.avatarName'];
    return SPEECH_AVATARS_FULL.find(avatar => avatar.name === avatarName);
  }, [backendConfig]);

  const isAvatarConfigEnabled = backendConfig?.config['avatar.avatar'] ?? true;

  // Debug avatar configuration
  useEffect(() => {
    if (backendConfig && avatarDetails) {
      console.log('🎭 Avatar config enabled:', isAvatarConfigEnabled);
      console.log('Avatar name:', backendConfig.config['avatar.selectedAvatar.avatarName']);
      console.log('Avatar details:', avatarDetails);
      console.log('Avatar data available:', Boolean(avatarData));
    }
  }, [backendConfig, avatarDetails, avatarData, isAvatarConfigEnabled]);



  /**
   * Setup event handlers when client is ready
   */
  useEffect(() => {
    // Handle agent audio
    onAudio((audioChunk: Uint8Array) => {
      AudioDebugger.logChunk(audioChunk.length);
      setIsAgentSpeaking(true);
      playAudioChunk(audioChunk);
    });

    // Handle transcripts
    onTranscript((text: string, role: 'user' | 'agent') => {
      const timestamp = Date.now();
      if (role === 'user') {
        setMessages((prev: any) => [
          ...prev,
          { id: `msg_${++messageIdRef.current}`, role: 'user', message: text, timestamp },
        ]);
      } else if (role === 'agent') {
        setMessages((prev: any) => {
          const lastMessage = prev[prev.length - 1];
          if (
            lastMessage &&
            lastMessage.role === 'agent' &&
            !lastMessage.completed
          ) {
            // Append to existing agent message
            return [
              ...prev.slice(0, -1),
              { ...lastMessage, message: lastMessage.message + text },
            ];
          } else {
            // New agent message
            return [
              ...prev,
              {
                id: `msg_${++messageIdRef.current}`,
                role: 'agent',
                message: text,
                completed: false,
                timestamp,
              },
            ];
          }
        });
      }
    });

    // Enhanced message handling for avatar support (inspired by foundry)
    onMessage((message: any) => {
      console.log('📩 Processing message:', message.type);
      
      if (message.type === 'user_started_speaking') {
        setIsUserSpeaking(true);
        stopPlayback();
        setIsAgentSpeaking(false);
      } else if (message.type === 'user_stopped_speaking') {
        setIsUserSpeaking(false);
      } else if (message.type === 'response.done') {
        setIsAgentSpeaking(false);
        setMessages((prev: any) => {
          const lastMessage = prev[prev.length - 1];
          if (lastMessage && lastMessage.role === 'agent') {
            return [...prev.slice(0, -1), { ...lastMessage, completed: true }];
          }
          return prev;
        });
      } else if (message.type === 'session.avatar.ready') {
        console.log('✅ Avatar ready:', message);
        // Note: isAvatarReady is now managed by useVoiceLiveClient hook
        if (message.avatar) {
          setAvatarData(message.avatar);
        }
      } else if (message.type === 'response.video.delta') {
        console.log('📹 Avatar video delta received:', message);
        // Video processing is now handled by WebRTC layer
      }
    });
  }, [onAudio, onTranscript, onMessage, playAudioChunk, stopPlayback]);

  /**
   * Send initial greeting when connected (proactive engagement)
   */
  useEffect(() => {
    if (connectionState === 'connected' && messages.length === 0) {
      // Trigger assistant response immediately without user input
      setTimeout(() => {
        triggerResponse();
      }, 100); // Very minimal delay to ensure session is ready
    }
  }, [connectionState, messages.length, triggerResponse]);

  /**
   * Start recording when connected
   */
  useEffect(() => {
    if (connectionState === 'connected' && !isRecording()) {
      const startAudioRecording = async () => {
        try {
          await startRecording((audioChunk: Uint8Array) => {
            sendAudio(audioChunk);
          });

          audioLevelIntervalRef.current = setInterval(() => {
            const level = getAudioLevel();
            setAudioLevel(level);
          }, 100);
        } catch (error) {
          console.error('Failed to start recording:', error);
        }
      };

      startAudioRecording();
    }

    return () => {
      if (audioLevelIntervalRef.current) {
        clearInterval(audioLevelIntervalRef.current);
        audioLevelIntervalRef.current = null;
      }
    };
  }, [connectionState, isRecording, startRecording, sendAudio, getAudioLevel]);

  /**
   * Auto-scroll messages
   */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  /**
   * Handle connection
   */
  const handleConnect = useCallback(async () => {
    if (isConnected) {
      await stopRecording();
      disconnect();
    } else {
      AudioDebugger.reset(); // Reset audio debugging when connecting
      await connect();
    }
  }, [isConnected, connect, disconnect, stopRecording]);

  /**
   * Toggle captions
   */
  const handleToggleCaptions = useCallback(() => {
    setShowCaptions(prev => !prev);
  }, []);

  /**
   * Cancel/Stop
   */
  const handleCancel = useCallback(async () => {
    await stopRecording();
    disconnect();
    // Clear state when closing
    setMessages([]);
    setShowCaptions(false);
    setIsAgentSpeaking(false);
    setIsUserSpeaking(false);
    setAudioLevel(0);
    messageIdRef.current = 0; // Reset message ID counter
  }, [stopRecording, disconnect]);

  const isEmpty = messages.length === 0;
  const showIdleState = isEmpty && connectionState !== 'connected';

  // Foundry-inspired render for non-avatar mode
  const renderNonAvatarMode = () => (
    <div className="voice-recorder-container">
      {showIdleState ? (
        <div className="empty-chat-container">
          <div className="avatar-container">
            <div className="circle-base-idle">
              <svg
                width="64"
                height="64"
                viewBox="0 0 64 64"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                {/* Add mic icon or similar */}
              </svg>
            </div>
            <div className="avatar-status">
              <div className="avatar-title">Just say the word</div>
              <div className="avatar-subtitle">Try speaking out loud, just like you'd converse with a real person, and hear the responses you'll get back.</div>
            </div>
          </div>
        </div>
      ) : (
        /* Voice Pulse Indicator */
        connectionState === 'connected' && (
          <div className="voice-recorder-panel">
            <div className="circle-wrapper">
              <div className="circle-stack">
                <div
                  className="circle-outer"
                  style={{
                    transform: `scale(${1 + audioLevel * 0.15})`,
                  }}
                />
                <div
                  className="circle-mid"
                  style={{
                    transform: `scale(${1 + audioLevel * 0.1})`,
                  }}
                />
                <div
                  className="circle-inner"
                  style={{
                    transform: `scale(${1 + audioLevel * 0.05})`,
                  }}
                />
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );

  return (
    <div className="chatbot">
      {/* Main Content Area - Takes remaining space */}
      <div className="main-content-area">
        {/* Backend config-based conditional rendering */}
        {isAvatarConfigEnabled ? (
          <AvatarDisplay
            avatar={{
              enabled: true,
              avatarName: backendConfig?.config['avatar.selectedAvatar.avatarName'] || 'Avatar',
              avatarBigImg: avatarDetails?.img || avatarDetails?.lucencyBgImg,
              avatarImageUrl: avatarDetails?.img || avatarDetails?.lucencyBgImg,
              ...avatarData, // Merge with any received avatar data
            }}
            isConnected={connectionState === 'connected'}
            isAgentSpeaking={isAgentSpeaking}
            isAvatarReady={isAvatarReady}
            setAvatarMediaElements={setAvatarMediaElements}
          />
        ) : (
          /* Fallback to non-avatar mode when avatar is disabled (foundry pattern) */
          renderNonAvatarMode()
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="error-banner">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Captions/Transcript Display - Fixed height above action bar */}
      {showCaptions && messages.length > 0 && (
        <div className="subtitle-container">
          <div className="voice-subtitle-display">
            {messages.map(msg => (
              <div key={msg.id} className={`subtitle-message ${msg.role}`}>
                <div className="message-role">
                  {msg.role === 'user' ? 'You' : 'Agent'}
                </div>
                <div className="message-content">{msg.message}</div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </div>
      )}

      {/* Lower Section: Action Bar */}
      <div className="lower-section">
        <div className="action-bar">
          {connectionState !== 'connected' ? (
            <button
              onClick={handleConnect}
              className="vr-primary-action-button idle-start-button"
              disabled={connectionState === 'connecting'}
            >
              {connectionState === 'connecting' ? (
                <>
                  <Spinner />
                  <span>Connecting...</span>
                </>
              ) : (
                'Start'
              )}
            </button>
          ) : (
            <>
              <button
                className="icon-button"
                onClick={handleToggleCaptions}
                aria-label={showCaptions ? 'Hide captions' : 'Show captions'}
              >
                {showCaptions ? (
                  <ClosedCaptionIcon />
                ) : (
                  <ClosedCaptionOffIcon />
                )}
              </button>

              <div className="mic-only-button">
                <MicIcon />
              </div>

              <button
                className="icon-button"
                onClick={handleCancel}
                aria-label="Stop conversation"
              >
                <DismissIcon />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Simple icon components
function Spinner() {
  return (
    <svg
      className="spinner"
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        cx="10"
        cy="10"
        r="8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="12 38"
      />
    </svg>
  );
}

function ClosedCaptionIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M5.25 4C3.455 4 2 5.455 2 7.25v9.5C2 18.545 3.455 20 5.25 20h13.5c1.795 0 3.25-1.455 3.25-3.25v-9.5C22 5.455 20.545 4 18.75 4H5.25zm3.5 8.5c0-.69.56-1.25 1.25-1.25h1c.69 0 1.25.56 1.25 1.25v1c0 .69-.56 1.25-1.25 1.25h-1c-.69 0-1.25-.56-1.25-1.25v-1zm5 0c0-.69.56-1.25 1.25-1.25h1c.69 0 1.25.56 1.25 1.25v1c0 .69-.56 1.25-1.25 1.25h-1c-.69 0-1.25-.56-1.25-1.25v-1z"
        fill="currentColor"
      />
    </svg>
  );
}

function ClosedCaptionOffIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M5.25 4C3.455 4 2 5.455 2 7.25v9.5C2 18.545 3.455 20 5.25 20h13.5c1.795 0 3.25-1.455 3.25-3.25v-9.5C22 5.455 20.545 4 18.75 4H5.25zm3.5 8.5c0-.69.56-1.25 1.25-1.25h1c.69 0 1.25.56 1.25 1.25v1c0 .69-.56 1.25-1.25 1.25h-1c-.69 0-1.25-.56-1.25-1.25v-1zm5 0c0-.69.56-1.25 1.25-1.25h1c.69 0 1.25.56 1.25 1.25v1c0 .69-.56 1.25-1.25 1.25h-1c-.69 0-1.25-.56-1.25-1.25v-1z"
        fill="currentColor"
        opacity="0.4"
      />
      <line
        x1="2"
        y1="2"
        x2="22"
        y2="22"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zm-1 14.93A7.002 7.002 0 0 1 5 10a1 1 0 1 0-2 0 9.001 9.001 0 0 0 8 8.95V21H9a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-2.05A9.001 9.001 0 0 0 21 10a1 1 0 1 0-2 0 7.002 7.002 0 0 1-6 6.93z"
        fill="currentColor"
      />
    </svg>
  );
}

function DismissIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M4.21 4.387l.083-.094a1 1 0 0 1 1.32-.083l.094.083L12 10.585l6.293-6.292a1 1 0 1 1 1.414 1.414L13.415 12l6.292 6.293a1 1 0 0 1 .083 1.32l-.083.094a1 1 0 0 1-1.32.083l-.094-.083L12 13.415l-6.293 6.292a1 1 0 0 1-1.414-1.414L10.585 12 4.293 5.707a1 1 0 0 1-.083-1.32l.083-.094-.083.094z"
        fill="currentColor"
      />
    </svg>
  );
}
