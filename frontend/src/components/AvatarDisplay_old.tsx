import { useState, useEffect, useRef, useCallback } from 'react';
import './AvatarDisplay.css';

// Modeled after azure-ai-foundry VoiceLiveAgent implementation
interface AvatarDisplayProps {
  avatar: {
    enabled?: boolean;
    avatarBigImg?: string;
    avatarImg?: string;
    avatarImageUrl?: string;
    avatarName?: string;
    name?: string;
    // WebRTC media streams (managed externally)
    audioStream?: MediaStream;
    videoStream?: MediaStream;
  } | null;
  isConnected: boolean;
  isAgentSpeaking: boolean;
  isAvatarReady?: boolean; // External state for avatar readiness
  isSideBySide?: boolean;
  // Callback to notify parent when avatar is ready (video loaded)
  onAvatarReady?: (ready: boolean) => void;
  // WebRTC media element refs callback (following foundry pattern)
  setAvatarMediaElements?: (elements: { video: HTMLVideoElement | null; audio: HTMLAudioElement | null }) => void;
}

export function AvatarDisplay({
  avatar,
  isConnected,
  isAgentSpeaking,
  isAvatarReady: propIsAvatarReady,
  isSideBySide = false,
  onVideoReady,
  onAudioReady,
  setAvatarMediaElements,
}: AvatarDisplayProps): JSX.Element | null {
  const [imageLoaded, setImageLoaded] = useState<boolean>(false);
  const [isAvatarReady, setIsAvatarReady] = useState<boolean>(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [loadingTimeout, setLoadingTimeout] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timeoutRef = useRef<any>(null);

  // Enhanced video element ref handling (inspired by foundry VoiceLiveAgent)
  const handleVideoRef = useCallback(
    (el: HTMLVideoElement | null) => {
      // Ignore cleanup calls to prevent state updates with null
      if (el === null) {
        return;
      }

      // Avoid unnecessary work if it's the same element
      if (videoRef.current === el) {
        return;
      }
      videoRef.current = el;

      if (onVideoReady) {
        onVideoReady(el);
      }

      // WebRTC media elements management
      if (setAvatarMediaElements) {
        console.log('🎭 Setting avatar media elements:', { video: !!el, audio: !!audioRef.current });
        setAvatarMediaElements(el, audioRef.current);

        // If we already have a waiting stream, attach it now
        if (avatar?.videoStream) {
          console.log('🎭 Attaching existing video stream to element');
          el.srcObject = avatar.videoStream;
        }
      }
    },
    [onVideoReady, setAvatarMediaElements, avatar?.videoStream, avatar?.audioStream],
  );

  // Enhanced audio element ref handling (inspired by foundry VoiceLiveAgent)
  const handleAudioRef = useCallback(
    (el: HTMLAudioElement | null) => {
      if (el === null) {
        return;
      }
      if (audioRef.current === el) {
        return;
      }
      audioRef.current = el;

      if (onAudioReady) {
        onAudioReady(el);
      }

      // WebRTC media elements management
      if (setAvatarMediaElements) {
        setAvatarMediaElements(videoRef.current, el);

        if (avatar?.audioStream) {
          el.srcObject = avatar.audioStream;
        }
      }
    },
    [onAudioReady, setAvatarMediaElements, avatar?.videoStream, avatar?.audioStream],
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
      console.log('🎭 Starting avatar loading timeout (15s)');
      timeoutRef.current = setTimeout(() => {
        console.warn('⏰ Avatar loading timeout - avatar video may not be supported in this configuration');
        setLoadingTimeout(true);
        setAvatarError('Avatar video not available in this configuration. Using static avatar image instead.');
        // Set avatar as "ready" to show static image instead
        setIsAvatarReady(true);
      }, 15000); // 15 second timeout (longer for better UX)

      return () => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      };
    }
  }, [isConnected, isAvatarReady, loadingTimeout]);

  // Sync with prop value from parent (WebRTC avatar manager)
  useEffect(() => {
    if (propIsAvatarReady !== undefined && propIsAvatarReady !== isAvatarReady) {
      console.log('🔄 Syncing avatar ready state from parent:', propIsAvatarReady);
      setIsAvatarReady(propIsAvatarReady);
    }
  }, [propIsAvatarReady, isAvatarReady]);

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

  // Get the best available image for avatar display (foundry fallback chain)
  const avatarImageSrc = avatar.avatarBigImg || avatar.avatarImageUrl || avatar.avatarImg;
  const avatarDisplayName = avatar.avatarName || avatar.name || '';

  // Foundry-inspired rendering logic
  const renderAvatarMode = () => (
    <>
      {isConnected ? (
        !isAvatarReady && !loadingTimeout && (
          <div className="avatar-loading">
            <div className="spinner"></div>
            <p>Connecting Avatar...</p>
          </div>
        )
      ) : (
        <>
          {/* Static avatar image when not connected (foundry pattern) */}
          <div className="avatar-image-container">
            <img
              alt={avatarDisplayName}
              className="avatar-image"
              src={avatarImageSrc ?? ''}
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageLoaded(true)} // Handle errors gracefully
            />
          </div>
        </>
      )}
      
      {/* Live video avatar when ready, or static image fallback (foundry pattern) */}
      {isAvatarReady && isConnected ? (
        <div className={`avatar-video-container ${isAvatarReady ? 'visible' : ''}`}>
          {/* Show static image as fallback when video is not available */}
          {loadingTimeout ? (
            <div className="avatar-image-container">
              <img
                alt={avatarDisplayName}
                className="avatar-image"
                src={avatarImageSrc ?? ''}
                style={{ opacity: 0.8 }}
              />
              <div className="fallback-message">
                <p style={{fontSize: '12px', color: '#666', textAlign: 'center', marginTop: '8px'}}>
                  Using static avatar (video not available)
                </p>
              </div>
            </div>
          ) : (
            <>
              <video
                ref={handleVideoRef}
                aria-hidden={!isAvatarReady}
                aria-label="Avatar video"
                autoPlay={true}
                muted={true}
                controls={false}
                className={isSideBySide ? 'avatar-video-side-by-side' : 'avatar-video'}
                onLoadedData={() => {
                  console.log('✅ Avatar video loaded via onLoadedData');
                  setIsAvatarReady(true);
                }}
                onCanPlay={() => {
                  console.log('✅ Avatar video can play');
                  setIsAvatarReady(true);
                }}
                onPlaying={() => {
                  console.log('✅ Avatar video is playing');
                  setIsAvatarReady(true);
                }}
                onLoadStart={() => {
                  console.log('🔄 Avatar video load started');
                }}
                onError={(e: any) => {
                  console.error('❌ Avatar video error:', e);
                  setAvatarError('Avatar video failed to load');
                }}
                playsInline={true}
                style={{ backgroundColor: 'transparent' }}
              >
                <track kind="captions" label="Avatar captions" />
              </video>

              <audio
                ref={handleAudioRef}
                aria-label="Avatar audio"
                autoPlay={true}
              >
                <track kind="captions" label="Avatar audio captions" />
              </audio>
            </>
          )}
        </div>
      ) : null}
    </>
  );

  return (
    <div className="avatar-display">
      {renderAvatarMode()}
      
      {/* Speaking indicator */}
      {isConnected && isAgentSpeaking && (
        <div className="speaking-indicator">
          <div className="speaking-ring"></div>
        </div>
      )}
    </div>
  );
}
