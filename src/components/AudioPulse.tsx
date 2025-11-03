import './AudioPulse.css';

interface AudioPulseProps {
  /** Audio level between 0 and 1 */
  audioLevel: number;
  /** Whether the user is currently speaking */
  isUserSpeaking: boolean;
  /** Whether the agent is currently speaking */
  isAgentSpeaking: boolean;
  /** Status text to display */
  status?: string;
}

export function AudioPulse({ 
  audioLevel, 
  isUserSpeaking, 
  isAgentSpeaking, 
  status = 'Ready' 
}: AudioPulseProps): JSX.Element {
  // Generate bars with varying heights based on audio level
  const generateBars = () => {
    const bars = [];
    const barCount = 9;
    
    for (let i = 0; i < barCount; i++) {
      // Create a symmetric wave pattern from center
      const centerIndex = Math.floor(barCount / 2);
      const distanceFromCenter = Math.abs(i - centerIndex);
      
      // Base height decreases with distance from center
      const baseHeight = 30 - (distanceFromCenter * 3);
      
      // Audio level amplifies the height
      const audioMultiplier = Math.max(0.2, audioLevel * 3);
      const height = Math.max(8, Math.min(90, baseHeight * audioMultiplier));
      
      // Determine animation class based on state
      let animationClass = '';
      if (isUserSpeaking) {
        animationClass = 'pulse-user';
      } else if (isAgentSpeaking) {
        animationClass = 'pulse-agent';
      } else if (audioLevel > 0.05) {
        animationClass = 'pulse-active';
      } else {
        animationClass = 'pulse-idle';
      }
      
      bars.push(
        <div
          key={i}
          className={`audio-bar ${animationClass}`}
          style={{
            height: `${height}px`,
            animationDelay: `${i * 0.05}s`,
          }}
        />
      );
    }
    
    return bars;
  };

  // Determine the current state for styling
  const currentState = isUserSpeaking 
    ? 'user-speaking' 
    : isAgentSpeaking 
    ? 'agent-speaking' 
    : audioLevel > 0.05 
    ? 'active' 
    : 'idle';

  return (
    <div className="audio-pulse-container">
      <div 
        className="audio-pulse-wrapper" 
        data-state={currentState}
      >
        <div className="audio-bars">
          {generateBars()}
        </div>
        
        {/* Central microphone icon */}
        <div className="audio-pulse-center">
          <div className="mic-icon-container">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zm-1 14.93A7.002 7.002 0 0 1 5 10a1 1 0 1 0-2 0 9.001 9.001 0 0 0 8 8.95V21H9a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-2.05A9.001 9.001 0 0 0 21 10a1 1 0 1 0-2 0 7.002 7.002 0 0 1-6 6.93z"
                fill="currentColor"
              />
            </svg>
          </div>
        </div>
      </div>
      
      {/* Status text */}
      <div className="audio-pulse-status">
        {status}
      </div>
    </div>
  );
}