import authService from './utils/authService';
import type { Config } from './types';
import { getAvatarConfig, getDefaultAvatar, COMMON_AVATARS, getAvailableAvatarNames } from './utils/AvatarPersonnelList';

export const config: Config = {
  resource: {
    name: import.meta.env.VITE_AZURE_AI_RESOURCE_NAME || '<resource-name>',
    region: import.meta.env.VITE_AZURE_AI_REGION || '<region>',

    auth: {
      // Choose authentication method: 'apiKey' or 'entraId'
      method: import.meta.env.VITE_AUTH_METHOD || 'entraId',

      apiKey: import.meta.env.VITE_AZURE_API_KEY || '<api-key>',

      entraId: {
        enabled: true,
        requireAuth: true,
        // Sign-in method: 'popup' or 'redirect'
        signInMethod: 'popup',
      },
    },

    getToken: async () => {
      if (config.resource.auth.method === 'entraId') {
        try {
          return await authService.getAccessToken();
        } catch (error) {
          console.error('Failed to get Entra ID token:', error);
          throw new Error('Authentication failed. Please sign in again.');
        }
      }
      return null;
    },
  },

  // Model Configuration
  model: {
    // Model to use: 'gpt-realtime' or 'gpt-4o-realtime'
    name: 'gpt-realtime',

    // Alternative: Use your AI Foundry Agent
    useAgent: false,
    agentId: 'your-agent-id', // Required if useAgent is true
    projectId: 'your-project-id', // Required if useAgent is true
  },

  // Session Configuration
  session: {
    // Instructions for the AI agent
    instructions:
      'You are a helpful AI assistant responding in natural, engaging language. Your default language is English unless the user specifies otherwise. When a conversation starts, greet the user warmly and briefly introduce yourself, then ask how you can help them today.',

    // Modalities: ['text', 'audio'] or ['audio']
    modalities: ['text', 'audio'],
    
    // Enable streaming for faster response
    stream: true,

    // Voice configuration
    voice: {
      // Azure voice name (e.g., 'en-US-AvaNeural', 'en-US-Ava:DragonHDLatestNeural')
      name: 'en-US-Ava:DragonHDLatestNeural',
      type: 'azure-standard',
      temperature: 0.8, // Optional: 0.5-1.5 for HD voices
      rate: '1.0', // Optional: 0.5-1.5 speaking rate
    },

    // Turn detection configuration - Optimized for minimal gaps
    turnDetection: {
      type: 'server_vad', // Use server_vad for faster processing
      threshold: 0.5, // Higher threshold for more reliable detection
      prefixPaddingMs: 100, // Minimal padding for faster response
      speechDurationMs: 40,  // Minimal speech duration
      silenceDurationMs: 200, // Very short silence for quick responses
      removeFillerWords: false,

      // End of utterance detection (only supported with cascaded pipelines)
      // Comment out or remove this section if not using cascaded mode
      // endOfUtteranceDetection: {
      //   model: 'semantic_detection_v1', // or 'semantic_detection_v1_multilingual'
      //   threshold: 0.01,
      //   timeout: 2,
      // },
    },

    // Input audio configuration
    inputAudio: {
      samplingRate: 24000, // 16000 or 24000
      transcription: {
        model: 'whisper-1', // Enable user speech transcription
      },
      noiseReduction: {
        type: 'azure_deep_noise_suppression', // Enhances audio quality
      },
      echoCancellation: {
        type: 'server_echo_cancellation', // Removes echo from agent's voice
      },
    },

    // Output audio configuration - Optimized for streaming
    outputAudio: {
      timestampTypes: ['word'], // Optional: get word-level timestamps
      format: 'pcm16', // Ensure consistent audio format
      sampling_rate: 24000, // Match input sampling rate
      // Request smaller, more frequent chunks for smoother streaming
      chunk_length_ms: 50, // 50ms chunks instead of default larger chunks
    },

    // Avatar configuration (optional)
    // To change avatar, update avatarName to one of:
    // COMMON_AVATARS.HARRY_BUSINESS, HARRY_CASUAL, HARRY_YOUTHFUL
    // COMMON_AVATARS.MEG_BUSINESS, MEG_FORMAL, MEG_CASUAL  
    // COMMON_AVATARS.MAX_BUSINESS, MAX_CASUAL, MAX_FORMAL
    avatar: (() => {
      // Use Harry-business as a working avatar (available in AvatarPersonnelList)
      const avatarName = COMMON_AVATARS.HARRY_BUSINESS;
      const avatarConfig = getAvatarConfig(avatarName);
      
      if (!avatarConfig) {
        console.warn(`Avatar ${avatarName} not found, using default`);
        const defaultAvatar = getDefaultAvatar();
        const defaultConfig = getAvatarConfig(defaultAvatar.name) || { character: 'harry', style: 'business' };
        return {
          enabled: false,
          avatarName: defaultAvatar.name,
          character: defaultConfig.character,
          style: defaultConfig.style,
          customized: false,
          video: {
            bitrate: 2000000,
            codec: 'h264',
            resolution: {
              width: 1080,
              height: 1920,
            },
            background: {
              color: '#00FF00FF', // Green screen
            },
          },
        };
      }
      
      return {
        enabled: false,
        avatarName: avatarName,
        character: avatarConfig.character,
        style: avatarConfig.style,
        customized: false,
        video: {
          bitrate: 2000000,
          codec: 'h264',
          resolution: {
            width: 1080,
            height: 1920,
          },
          background: {
            color: '#00FF00FF', // Green screen
          },
        },
      };
    })(),
  },

  // Feature flags
  features: {
    enableTranscription: true, // Show real-time transcription
    enableAudioVisualization: true, // Show audio level visualization
    enableProactiveEngagement: true, // Agent speaks first when avatar loads
  },
};

// Helper to build WebSocket URL
export function buildWebSocketUrl() {
  const { resource, model } = config;
  const baseUrl = `wss://${resource.name}.services.ai.azure.com/voice-live/realtime?api-version=2025-10-01`;

  if (model.useAgent) {
    return `${baseUrl}&agent_id=${model.agentId}&project_id=${model.projectId}`;
  }

  return `${baseUrl}&model=${model.name}`;
}

// Helper to get auth headers
export async function getAuthHeaders() {
  const { resource } = config;

  if (resource.auth.method === 'apiKey' && resource.auth.apiKey) {
    return { 'api-key': resource.auth.apiKey };
  }

  if (resource.auth.method === 'entraId') {
    const token = await resource.getToken();
    if (token) {
      return { Authorization: `Bearer ${token}` };
    }
    throw new Error('Failed to get Entra ID token. Please ensure you are signed in.');
  }

  throw new Error(
    'No valid authentication method configured. Please check your auth configuration.',
  );
}

// Helper function to list available avatars (for debugging)
export function listAvailableAvatars() {
  console.log('Available avatars:', getAvailableAvatarNames());
  return getAvailableAvatarNames();
}

// Initialize and log avatar configuration for debugging
console.log('🎭 Avatar System Initialized');
console.log(`Selected avatar: ${config.session.avatar?.avatarName}`);
console.log(`Character: ${config.session.avatar?.character}, Style: ${config.session.avatar?.style}`);

// Log available avatars in development
if (import.meta.env.DEV) {
  listAvailableAvatars();
}

// Export avatar utilities for easy access in browser console
// Usage: configInstance.switchAvatar('Harry-casual')
export const configInstance = {
  ...config,
  switchAvatar: (avatarName: string) => {
    const avatarConfig = getAvatarConfig(avatarName);
    if (avatarConfig && config.session.avatar) {
      config.session.avatar.avatarName = avatarName;
      config.session.avatar.character = avatarConfig.character;
      config.session.avatar.style = avatarConfig.style;
      console.log(`🎭 Switched to avatar: ${avatarName} (${avatarConfig.character}-${avatarConfig.style})`);
      return true;
    } else {
      console.error(`❌ Avatar ${avatarName} not found`);
      return false;
    }
  },
  listAvatars: listAvailableAvatars,
  getAvailableAvatars: () => getAvailableAvatarNames()
};
