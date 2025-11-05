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
  isAvatarReady: externalIsAvatarReady = false,
  isSideBySide = false,
  onAvatarReady,
  setAvatarMediaElements,
}: AvatarDisplayProps): JSX.Element | null {
  const [imageLoaded, setImageLoaded] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Video element ref callback (following foundry VoiceLiveAgent pattern)
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

      // Notify parent of media element availability (foundry pattern)
      if (setAvatarMediaElements) {
        console.log('🎭 Setting video element in avatar media refs');
        setAvatarMediaElements({ video: el, audio: audioRef.current });

        // If we already have a waiting video stream, attach it now
        if (avatar?.videoStream) {
          console.log('🎭 Attaching existing video stream to element');
          el.srcObject = avatar.videoStream;
        }
      }
    },
    [setAvatarMediaElements, avatar?.videoStream],
  );

  // Audio element ref callback (following foundry VoiceLiveAgent pattern)
  const handleAudioRef = useCallback(
    (el: HTMLAudioElement | null) => {
      if (el === null) {
        return;
      }
      if (audioRef.current === el) {
        return;
      }
      audioRef.current = el;

      // Notify parent of media element availability (foundry pattern)
      if (setAvatarMediaElements) {
        console.log('🎭 Setting audio element in avatar media refs');
        setAvatarMediaElements({ video: videoRef.current, audio: el });

        // If we already have a waiting audio stream, attach it now
        if (avatar?.audioStream) {
          console.log('🎭 Attaching existing audio stream to element');
          el.srcObject = avatar.audioStream;
        }
      }
    },
    [setAvatarMediaElements, avatar?.audioStream],
  );

  // Reset image loaded state when avatar changes
  useEffect(() => {
    setImageLoaded(false);
  }, [avatar?.avatarBigImg]);

  // Handle external stream updates (set streams to existing elements)
  useEffect(() => {
    if (avatar?.videoStream && videoRef.current) {
      console.log('🎭 Updating video stream on existing element');
      videoRef.current.srcObject = avatar.videoStream;
    }
  }, [avatar?.videoStream]);

  useEffect(() => {
    if (avatar?.audioStream && audioRef.current) {
      console.log('🎭 Updating audio stream on existing element');
      audioRef.current.srcObject = avatar.audioStream;
    }
  }, [avatar?.audioStream]);

  // Handle video loaded event to notify parent
  const handleVideoLoaded = useCallback(() => {
    console.log('🎭 Video loaded, avatar ready');
    if (onAvatarReady) {
      onAvatarReady(true);
    }
  }, [onAvatarReady]);

  // Don't render if no avatar configured
  if (!avatar || !avatar.enabled) {
    return null;
  }

  // Get the avatar image source
  const avatarImageSrc = avatar.avatarBigImg || avatar.avatarImg || avatar.avatarImageUrl;

  // Render avatar mode (following foundry VoiceLiveAgent pattern)
  const renderAvatarMode = () => (
    <>
      {!isConnected ? (
        <div className="image-container">
          <img
            alt={avatar.avatarName || avatar.name || 'Avatar'}
            className="avatar-image"
            onLoad={() => setImageLoaded(true)}
            src={avatarImageSrc || ''}
            style={{ display: imageLoaded ? 'block' : 'none' }}
          />
          {!imageLoaded && (
            <div className="avatar-loader">
              <div className="loading-spinner"></div>
              <p className="loading-text">Loading avatar...</p>
            </div>
          )}
        </div>
      ) : (
        /* When connected, show video container with loading overlay */
        <div className={`avatar-container ${isSideBySide ? 'side-by-side' : ''}`}>
          {/* Show loading spinner in the same space as the video until avatar is ready */}
          {!externalIsAvatarReady && (
            <div className="avatar-video-loader">
              <div className="loading-spinner"></div>
              <p className="loading-text">Connecting Avatar...</p>
            </div>
          )}
          
          <video
            ref={handleVideoRef}
            aria-hidden={!externalIsAvatarReady}
            aria-label="Avatar video"
            autoPlay={true}
            className={isSideBySide ? 'video-element-side-by-side' : 'video-element'}
            onLoadedData={handleVideoLoaded}
            playsInline={true}
            muted={false}
            style={{ 
              visibility: externalIsAvatarReady ? 'visible' : 'hidden',
            }}
          />

          <audio
            ref={handleAudioRef}
            aria-label="Avatar audio"
            autoPlay={true}
          />
        </div>
      )}
    </>
  );

  return (
    <div className={`avatar-display ${isAgentSpeaking ? 'speaking' : ''}`}>
      {renderAvatarMode()}
    </div>
  );
}