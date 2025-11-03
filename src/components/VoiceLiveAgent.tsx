import { useState, useEffect, useCallback, useRef } from 'react';
import { useVoiceLiveClient } from '../utils/useVoiceLiveClient';
import { useAudioManager } from '../utils/useAudioManager';
import { AvatarDisplay } from './AvatarDisplay';
import { config } from '../config';
import { AudioDebugger } from '../utils/audioDebugger';
import './VoiceLiveAgent.css';

interface Message {
  id: string;
  role: 'user' | 'agent';
  message: string;
  completed?: boolean;
  timestamp: number;
}

export function VoiceLiveAgent(): JSX.Element {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isAgentSpeaking, setIsAgentSpeaking] = useState<boolean>(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState<boolean>(false);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [showCaptions, setShowCaptions] = useState<boolean>(false);
  const [avatarData, setAvatarData] = useState<Uint8Array | null>(null);
  const [isAvatarReady, setIsAvatarReady] = useState<boolean>(false);

  const audioLevelIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageIdRef = useRef<number>(0);

  // Voice Live Client
  const {
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
    isConnected,
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
        setMessages(prev => [
          ...prev,
          { id: `msg_${++messageIdRef.current}`, role: 'user', message: text, timestamp },
        ]);
      } else if (role === 'agent') {
        setMessages(prev => {
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

    // Handle other messages
    onMessage((message: any) => {
      if (message.type === 'user_started_speaking') {
        setIsUserSpeaking(true);
        stopPlayback();
        setIsAgentSpeaking(false);
      } else if (message.type === 'user_stopped_speaking') {
        setIsUserSpeaking(false);
      } else if (message.type === 'response.done') {
        setIsAgentSpeaking(false);
        setMessages(prev => {
          const lastMessage = prev[prev.length - 1];
          if (lastMessage && lastMessage.role === 'agent') {
            return [...prev.slice(0, -1), { ...lastMessage, completed: true }];
          }
          return prev;
        });
      } else if (message.type === 'session.avatar.ready') {
        console.log('Avatar ready:', message);
        setIsAvatarReady(true);
        if (message.avatar) {
          setAvatarData(message.avatar);
        }
      } else if (message.type === 'response.video.delta') {
        // Handle avatar video data
        console.log('Avatar video delta received');
        // This would typically be processed by the AvatarDisplay component
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
          await startRecording((audioChunk: Float32Array) => {
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
  
  // Debug avatar configuration
  useEffect(() => {
    console.log('Avatar config:', config.session.avatar);
    console.log('Avatar data:', avatarData);
    console.log('Connection state:', connectionState);
  }, [avatarData, connectionState]);

  return (
    <div className="chatbot">
      {/* Main Content Area - Takes remaining space */}
      <div className="main-content-area">
        {config.session.avatar?.enabled ? (
          <AvatarDisplay
            avatar={{
              enabled: true,
              avatarName: config.session.avatar.character || 'Lisa',
              avatarBigImg: 'data:image/svg+xml;base64,' + btoa(`
                <svg width="200" height="200" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="100" cy="100" r="90" fill="#6B73FF"/>
                  <circle cx="100" cy="80" r="30" fill="white"/>
                  <circle cx="85" cy="75" r="5" fill="#6B73FF"/>
                  <circle cx="115" cy="75" r="5" fill="#6B73FF"/>
                  <path d="M80 110 Q100 130 120 110" stroke="white" stroke-width="3" fill="none"/>
                  <text x="100" y="180" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="white">Avatar</text>
                </svg>
              `),
              ...avatarData, // Merge with any received avatar data
            }}
            isConnected={connectionState === 'connected'}
            isAgentSpeaking={isAgentSpeaking}
            onVideoReady={(video: HTMLVideoElement) => {
              console.log('Avatar video ready:', video);
            }}
            onAudioReady={(audio: HTMLAudioElement) => {
              console.log('Avatar audio ready:', audio);
            }}
          />
        ) : showIdleState ? (
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
                </svg>
              </div>
              <div className="avatar-status">
                <div className="avatar-title">Just say the word</div>
                <div className="avatar-subtitle">Try speaking out loud, just like you'd converse with a real person, and hear the responses you'll get back.</div>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Voice Pulse Indicator */}
            {connectionState === 'connected' && (
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
                <div className="recorder-status">
                  {isUserSpeaking
                    ? 'Listening...'
                    : isAgentSpeaking
                      ? 'Agent speaking...'
                      : 'Ready'}
                </div>
              </div>
            )}
          </>
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
