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
  onVideoReady?: (video: HTMLVideoElement) => void;
  onAudioReady?: (audio: HTMLAudioElement) => void;
}

export function AvatarDisplay({
  avatar,
  isConnected,
  isAgentSpeaking,
  onVideoReady,
  onAudioReady,
}: AvatarDisplayProps): JSX.Element | null {
  const [imageLoaded, setImageLoaded] = useState<boolean>(false);
  const [isAvatarReady, setIsAvatarReady] = useState<boolean>(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [loadingTimeout, setLoadingTimeout] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Handle video element ref
  const handleVideoRef = useCallback(
    (el: HTMLVideoElement | null) => {
      if (!el || videoRef.current === el) return;
      videoRef.current = el;
      if (onVideoReady) {
        onVideoReady(el);
      }
    },
    [onVideoReady],
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

  // Reset image loaded state when avatar changes
  useEffect(() => {
    setImageLoaded(false);
    setIsAvatarReady(false);
    setAvatarError(null);
    setLoadingTimeout(false);
  }, [avatar?.avatarBigImg]);

  // Show avatar ready state when not connected
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
      console.log('🎭 Starting avatar loading timeout (10s)');
      timeoutRef.current = setTimeout(() => {
        console.warn('⏰ Avatar loading timeout - taking too long');
        setLoadingTimeout(true);
        setAvatarError('Avatar loading timeout. The avatar may not be available.');
      }, 10000); // 10 second timeout

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
          {!imageLoaded && (
            <div className="avatar-loading">
              <div className="spinner"></div>
              <p>Loading avatar...</p>
            </div>
          )}
          <img
            src={avatarImageSrc}
            alt={avatarDisplayName}
            className="avatar-image"
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageLoaded(true)} // Handle errors gracefully
            style={{ display: imageLoaded ? 'block' : 'none' }}
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
                  <p>{avatarError || 'Avatar loading timeout'}</p>
                  <p style={{fontSize: '12px', opacity: 0.7}}>
                    Try refreshing or check console for details
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
            ref={handleVideoRef}
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
