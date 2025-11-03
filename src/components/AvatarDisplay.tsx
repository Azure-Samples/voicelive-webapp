import { useState, useEffect, useRef, useCallback } from 'react';
import './AvatarDisplay.css';

interface AvatarDisplayProps {
  avatar: {
    enabled?: boolean;
    avatarBigImg?: string;
    avatarImg?: string;
    avatarName?: string;
    name?: string;
    audioTrack?: MediaStreamTrack;
    videoTrack?: MediaStreamTrack;
  } | null;
  isConnected: boolean;
  isAgentSpeaking: boolean;
  videoRef?: React.RefObject<HTMLVideoElement>;
  onVideoReady?: (video: HTMLVideoElement) => void;
  onAudioReady?: (audio: HTMLAudioElement) => void;
}

export function AvatarDisplay({
  avatar,
  isConnected,
  isAgentSpeaking,
  videoRef,
  onVideoReady,
  onAudioReady,
}: AvatarDisplayProps): JSX.Element | null {
  const [imageLoaded, setImageLoaded] = useState<boolean>(false);
  const [isAvatarReady, setIsAvatarReady] = useState<boolean>(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [loadingTimeout, setLoadingTimeout] = useState<boolean>(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Handle video element ref (use passed videoRef or create callback)
  const handleVideoRef = useCallback(
    (el: HTMLVideoElement | null) => {
      if (!el) return;
      if (videoRef?.current && videoRef.current === el) return;
      if (onVideoReady) {
        onVideoReady(el);
      }
    },
    [onVideoReady, videoRef],
  );

  // Handle audio element ref
  const handleAudioRef = useCallback(
    (el: HTMLAudioElement | null) => {
      if (!el || audioRef.current === el) return;
      audioRef.current = el;
      if (onAudioReady) {
        onAudioReady(el);
      }
    },
    [onAudioReady],
  );

  // Reset states when avatar changes
  useEffect(() => {
    setImageLoaded(true); // Assume image loads immediately for static avatars
    setIsAvatarReady(false);
    setAvatarError(null);
    setLoadingTimeout(false);
  }, [avatar?.avatarBigImg]);

  // Reset avatar ready state when not connected
  useEffect(() => {
    if (!isConnected) {
      setIsAvatarReady(false);
      setLoadingTimeout(false);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }
  }, [isConnected]);

  // Set up loading timeout when connected
  useEffect(() => {
    if (isConnected && !isAvatarReady && !loadingTimeout) {
      console.log('🎭 Starting avatar loading timeout (5s for development)');
      timeoutRef.current = setTimeout(() => {
        console.warn('⏰ Avatar loading timeout - no WebRTC connection established');
        setLoadingTimeout(true);
        setAvatarError('Avatar video not available. This may be due to missing Azure configuration or WebRTC connection issues.');
      }, 5000); // 5 second timeout for development

      return () => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      };
    }
  }, [isConnected, isAvatarReady, loadingTimeout]);

  // Clear timeout when avatar becomes ready
  useEffect(() => {
    if (isAvatarReady && timeoutRef.current) {
      console.log('✅ Avatar ready - clearing timeout');
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      setLoadingTimeout(false);
      setAvatarError(null);
    }
  }, [isAvatarReady]);

  // Check if Azure is properly configured
  const isAzureConfigured = () => {
    // Check if we have the required environment variables
    const resourceName = import.meta.env.VITE_AZURE_AI_RESOURCE_NAME;
    const region = import.meta.env.VITE_AZURE_AI_REGION;
    return resourceName && region && 
           !resourceName.includes('<') && 
           !region.includes('<');
  };

  // Set avatar ready when connected and we have a video element (even without data yet)
  useEffect(() => {
    if (isConnected && videoRef?.current && !isAvatarReady && !loadingTimeout) {
      if (!isAzureConfigured()) {
        // If Azure is not configured, show error immediately
        setAvatarError('Azure Voice Live API not configured. Please set up environment variables.');
        setLoadingTimeout(true);
        return;
      }

      // Give it a short delay to allow WebRTC connection to establish
      const readyTimer = setTimeout(() => {
        console.log('✅ Avatar video element ready, setting ready state');
        setIsAvatarReady(true);
      }, 3000); // 3 seconds to allow connection setup

      return () => clearTimeout(readyTimer);
    }
  }, [isConnected, videoRef, isAvatarReady, loadingTimeout]);

  // If no avatar is configured, return null
  if (!avatar || !avatar.enabled) {
    return null;
  }

  const avatarImageSrc = avatar.avatarBigImg || avatar.avatarImg;
  const avatarDisplayName = avatar.avatarName || avatar.name || '';

  return (
    <div className="avatar-display">
      {/* Static avatar image when not connected */}
      {!isConnected && (
        <div className="avatar-image-container">
          <img
            src={avatarImageSrc}
            alt={avatarDisplayName}
            className="avatar-image"
            onLoad={() => {
              console.log('✅ Static avatar image loaded');
              setImageLoaded(true);
            }}
            onError={(e) => {
              console.error('❌ Static avatar image error:', e);
              setImageLoaded(true); // Handle errors gracefully
            }}
            style={{ display: 'block' }} // Always show the image
          />
        </div>
      )}

      {/* Live video avatar when connected */}
      {isConnected && (
        <div className="avatar-video-container">
          {!isAvatarReady && (
            <div className="avatar-loading">
              {loadingTimeout || avatarError ? (
                <>
                  <div className="error-icon">⚠️</div>
                  <p style={{fontSize: '14px', marginBottom: '8px'}}>
                    {avatarError || 'Avatar video not available'}
                  </p>
                  <p style={{fontSize: '12px', opacity: 0.7, textAlign: 'center', lineHeight: '1.4'}}>
                    To enable avatar video, configure Azure Voice Live API credentials.<br/>
                    Check the README for setup instructions.
                  </p>
                </>
              ) : (
                <>
                  <div className="spinner"></div>
                  <p>Loading avatar...</p>
                </>
              )}
            </div>
          )}

          <video
            ref={(el) => {
              // Set the ref from props if provided
              if (videoRef) {
                (videoRef as React.MutableRefObject<HTMLVideoElement | null>).current = el;
              }
              handleVideoRef(el);
            }}
            className={`avatar-video ${isAvatarReady ? 'visible' : 'hidden'}`}
            autoPlay
            playsInline
            muted
            onLoadedData={() => {
              console.log('✅ Avatar video loaded');
              setIsAvatarReady(true);
            }}
            onError={(e) => {
              console.error('❌ Avatar video error:', e);
              setAvatarError('Avatar video failed to load');
            }}
            onWaiting={() => {
              console.log('⏳ Avatar video waiting for data');
            }}
            onCanPlay={() => {
              console.log('▶️ Avatar video can play');
            }}
            style={{ backgroundColor: 'transparent' }}
          />

          {/* Audio element for avatar speech */}
          <audio ref={handleAudioRef} autoPlay />
        </div>
      )}

      {/* Speaking indicator */}
      {isConnected && isAgentSpeaking && (
        <div className="speaking-indicator">
          <div className="speaking-ring"></div>
        </div>
      )}
    </div>
  );
}
