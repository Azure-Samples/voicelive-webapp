import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useVoiceLiveClient } from '../utils/useVoiceLiveClient';
import { AvatarDisplay } from './AvatarDisplay';
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
  // Default controls state
  const [backendConfig, setBackendConfig] = useState<BackendConfig | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isCallActive, setIsCallActive] = useState(false);

  const audioLevelIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageIdRef = useRef<number>(0);

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

  // Voice Live Client setup and handlers here...

  // Use real VoiceLiveClient connection state and handlers
  const {
    connect,
    disconnect,
    connectionState,
    error: connectionError
  } = useVoiceLiveClient();

  // Handler for connect/disconnect
  const handleConnect = useCallback(() => {
    if (connectionState === 'connected') {
      disconnect();
    } else {
      connect();
    }
  }, [connectionState, connect, disconnect]);

  // Handler for cancel/stop
  const handleCancel = useCallback(() => {
    disconnect();
    setMessages([]);
    setShowCaptions(false);
    setIsAgentSpeaking(false);
    setIsUserSpeaking(false);
    setAudioLevel(0);
    setIsMuted(false);
    setIsPaused(false);
    setIsCallActive(false);
    setAvatarData(null);
    // Reset other state as needed
  }, [disconnect]);

  // Handler for captions toggle
  const handleToggleCaptions = useCallback(() => {
    setShowCaptions((prev) => !prev);
  }, []);

  // Icon/Spinner stubs (replace with real components if needed)
  function Spinner() {
    return (
      <svg className="spinner" width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="12 38" />
      </svg>
    );
  }
  function ClosedCaptionIcon() {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M5.25 4C3.455 4 2 5.455 2 7.25v9.5C2 18.545 3.455 20 5.25 20h13.5c1.795 0 3.25-1.455 3.25-3.25v-9.5C22 5.455 20.545 4 18.75 4H5.25zm3.5 8.5c0-.69.56-1.25 1.25-1.25h1c.69 0 1.25.56 1.25 1.25v1c0 .69-.56 1.25-1.25 1.25h-1c-.69 0-1.25-.56-1.25-1.25v-1zm5 0c0-.69.56-1.25 1.25-1.25h1c.69 0 1.25.56 1.25 1.25v1c0 .69-.56 1.25-1.25 1.25h-1c-.69 0-1.25-.56-1.25-1.25v-1z" fill="currentColor" />
      </svg>
    );
  }
  function ClosedCaptionOffIcon() {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M5.25 4C3.455 4 2 5.455 2 7.25v9.5C2 18.545 3.455 20 5.25 20h13.5c1.795 0 3.25-1.455 3.25-3.25v-9.5C22 5.455 20.545 4 18.75 4H5.25zm3.5 8.5c0-.69.56-1.25 1.25-1.25h1c.69 0 1.25.56 1.25 1.25v1c0 .69-.56 1.25-1.25 1.25h-1c-.69 0-1.25-.56-1.25-1.25v-1zm5 0c0-.69.56-1.25 1.25-1.25h1c.69 0 1.25.56 1.25 1.25v1c0 .69-.56 1.25-1.25 1.25h-1c-.69 0-1.25-.56-1.25-1.25v-1z" fill="currentColor" opacity="0.4" />
        <line x1="2" y1="2" x2="22" y2="22" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }
  function MicIcon() {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zm-1 14.93A7.002 7.002 0 0 1 5 10a1 1 0 1 0-2 0 9.001 9.001 0 0 0 8 8.95V21H9a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-2.05A9.001 9.001 0 0 0 21 10a1 1 0 1 0-2 0 7.002 7.002 0 0 1-6 6.93z" fill="currentColor" />
      </svg>
    );
  }
  function DismissIcon() {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M4.21 4.387l.083-.094a1 1 0 0 1 1.32-.083l.094.083L12 10.585l6.293-6.292a1 1 0 1 1 1.414 1.414L13.415 12l6.292 6.293a1 1 0 0 1 .083 1.32l-.083.094a1 1 0 0 1-1.32.083l-.094-.083L12 13.415l-6.293 6.292a1 1 0 0 1-1.414-1.414L10.585 12 4.293 5.707a1 1 0 0 1-.083-1.32l.083-.094-.083.094z" fill="currentColor" />
      </svg>
    );
  }

  // Control handlers
  const handleMute = useCallback(() => {
    setIsMuted(true);
    // TODO: Add logic to mute microphone
  }, []);

  const handleUnmute = useCallback(() => {
    setIsMuted(false);
    // TODO: Add logic to unmute microphone
  }, []);

  const handlePause = useCallback(() => {
    setIsPaused(true);
    // TODO: Add logic to pause audio stream
  }, []);

  const handleResume = useCallback(() => {
    setIsPaused(false);
    // TODO: Add logic to resume audio stream
  }, []);

  const handleStartCall = useCallback(() => {
    setIsCallActive(true);
    // TODO: Add logic to start call/session
  }, []);

  const handleEndCall = useCallback(() => {
    setIsCallActive(false);
    // TODO: Add logic to end call/session
  }, []);

  return (
    <div className="chatbot">
      <div className="main-content-area">
        {isAvatarConfigEnabled ? (
          <AvatarDisplay
            avatar={{
              enabled: true,
              avatarName: backendConfig?.config['avatar.selectedAvatar.avatarName'] || 'Avatar',
              avatarBigImg: avatarDetails?.img || avatarDetails?.headPortraitImg,
              avatarImageUrl: avatarDetails?.img || avatarDetails?.headPortraitImg,
              isCustomAvatar: backendConfig?.config['avatar.selectedAvatar.isCustomAvatar'] ?? false,
              ...avatarData
            }}
            isLoading={isLoading}
            isSpeaking={isAgentSpeaking}
          />
        ) : (
          <div className="placeholder-avatar">
            <img src="/placeholder-avatar.png" alt="Placeholder Avatar" />
          </div>
        )}

        <div className="chat-container">
          {/* Chat messages and controls here */}
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
      </div>
    </div>
  );
}
