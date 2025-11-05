export interface AuthConfig {
  method: 'apiKey' | 'entraId';
  apiKey?: string;
  entraId: {
    enabled: boolean;
    requireAuth: boolean;
    signInMethod: 'popup' | 'redirect';
  };
}

export interface ResourceConfig {
  name: string;
  region: string;
  auth: AuthConfig;
  getToken: () => Promise<string | null>;
}

export interface ModelConfig {
  name: string;
  useAgent: boolean;
  agentId?: string;
  projectId?: string;
}

export interface VoiceConfig {
  name: string;
  type: string;
  temperature?: number;
  rate?: string;
}

export interface TurnDetectionConfig {
  type: 'azure_semantic_vad' | 'server_vad' | 'azure_semantic_vad_multilingual';
  threshold: number;
  prefixPaddingMs: number;
  speechDurationMs: number;
  silenceDurationMs: number;
  removeFillerWords: boolean;
  endOfUtteranceDetection?: {
    model: 'semantic_detection_v1' | 'semantic_detection_v1_multilingual';
    threshold: number;
    timeout: number;
  };
}

export interface InputAudioConfig {
  samplingRate: 16000 | 24000;
  transcription: {
    model: string;
  };
  noiseReduction: {
    type: string;
  };
  echoCancellation: {
    type: string;
  };
}

export interface OutputAudioConfig {
  timestampTypes?: string[];
  format?: string;
  sampling_rate?: number;
  chunk_length_ms?: number;
}

export interface AvatarVideoConfig {
  bitrate: number;
  codec: string;
  resolution: {
    width: number;
    height: number;
  };
  background: {
    color?: string;
    imageUrl?: string;
  };
}

export interface AvatarConfig {
  enabled: boolean;
  character?: string;
  style?: string;
  customized?: boolean;
  avatarName?: string; // Reference to avatar from AvatarPersonnelList
  // Added from foundry codebase for compatibility
  avatarBigImg?: string; // Large avatar image for display
  avatarImageUrl?: string; // Avatar image URL for idle state
  name?: string; // Alternative name field
  video?: AvatarVideoConfig;
}

export interface SessionConfig {
  instructions: string;
  modalities: ('text' | 'audio')[];
  voice: VoiceConfig;
  turnDetection: TurnDetectionConfig;
  inputAudio: InputAudioConfig;
  outputAudio: OutputAudioConfig;
  avatar?: AvatarConfig;
  stream?: boolean;
}

export interface FeatureFlags {
  enableTranscription: boolean;
  enableAudioVisualization: boolean;
  enableProactiveEngagement: boolean;
}

export interface Config {
  resource: ResourceConfig;
  model: ModelConfig;
  session: SessionConfig;
  features: FeatureFlags;
}

export interface UserInfo {
  name?: string;
  username?: string;
  email?: string;
  method: 'apiKey' | 'entraId';
}

export interface AuthState {
  isAuthenticated: boolean;
  user: UserInfo | null;
  isLoading: boolean;
  error: string | null;
}

export interface AudioMetrics {
  level: number;
  timestamp: number;
}

export interface TranscriptionItem {
  text: string;
  timestamp: number;
  type: 'user' | 'agent';
}

export interface ConnectionState {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  error?: string;
}

export interface VoiceLiveClientState {
  connectionState: ConnectionState;
  isRecording: boolean;
  audioMetrics: AudioMetrics;
  transcription: TranscriptionItem[];
}