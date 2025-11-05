# Azure AI Voice Live Agent Sample

# Azure AI Voice Live Agent Sample with Avatar Support

A **complete, working** standalone sample application demonstrating real-time voice conversation with AI avatars using Azure AI Foundry's Voice Live API. This app showcases WebSocket-based streaming, WebRTC avatar video, and natural voice interactions with AI characters.

## ✨ Features

- **🎭 AI Avatar Video**: Real-time video avatars with WebRTC streaming  
- **🗣️ Real-time Voice Conversation**: Bidirectional audio streaming with Azure Speech Service
- **🔗 WebSocket + WebRTC**: Hybrid architecture for control and media streaming
- **🎵 Complete Audio Pipeline**: Web Audio API integration
  - Microphone capture using AudioWorklet
  - Real-time audio playbook
  - PCM16 encoding/decoding
- **🤖 Turn Detection**: Semantic Voice Activity Detection (VAD)
- **🔊 Audio Enhancements**:
  - Noise suppression
  - Echo cancellation
  - Automatic gain control
- **📝 Live Transcription**: Real-time speech-to-text display with captions toggle
- **📊 Visual Feedback**: Animated pulse visualization with audio level monitoring
- **🎨 Preview Layout**: Clean UI matching Azure AI Foundry agent preview design
- **🔧 Backend Proxy**: FastAPI backend for Azure integration and WebRTC setup

## 🏗️ Architecture

```
Frontend (React) → FastAPI Backend → Azure Voice Live API
     ↓                                       ↓
WebRTC Video ← ← ← ← ICE Servers ← ← ← Avatar Service
```

**Two-layer communication:**
- **WebSocket**: Control messages, audio, text (Frontend ↔ Backend ↔ Azure)
- **WebRTC**: Direct video streaming (Frontend ↔ Azure Avatar Service)

## Features

- **Real-time Voice Conversation**: Bidirectional audio streaming with Azure Speech Service
- **WebSocket Communication**: Direct connection to Azure Voice Live API
- **Audio Pipeline**: Complete Web Audio API integration
  - Microphone capture using AudioWorklet
  - Real-time audio playback
  - PCM16 encoding/decoding
- **Turn Detection**: Semantic Voice Activity Detection (VAD)
- **Audio Enhancements**:
  - Noise suppression
  - Echo cancellation
  - Automatic gain control
- **Live Transcription**: Real-time speech-to-text display with captions toggle
- **Visual Feedback**: Animated pulse visualization with audio level monitoring
- **Preview Layout**: Clean UI matching Azure AI Foundry agent preview design
  - Grid-based layout with centered content
  - Top bar with agent name and icon
  - Action buttons at bottom
  - Fluent UI design tokens for consistent styling
- **Session Management**: Connection state handling and error recovery

## 🚀 Quick Start

### Prerequisites

- **Node.js 18+** (with npm or pnpm)  
- **Python 3.8+** (for FastAPI backend)
- **Azure AI Services Resource** (with avatar support)
- **Microphone** for voice input
- **HTTPS/localhost** (required for microphone/camera access)

### Installation

#### 1. Frontend Setup
```bash
npm install
```

#### 2. Backend Setup  
```bash
cd backend
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your Azure credentials
```

#### 3. Configuration

Edit `backend/.env` with your Azure credentials:

```bash
AZURE_AI_RESOURCE_NAME=your-resource-name
AZURE_AI_API_KEY=your-api-key-here
AZURE_AI_REGION=swedencentral
MODEL_DEPLOYMENT_NAME=gpt-4o
```

#### 4. Run Both Servers

**Windows:**
```bash
start.bat
```

**Linux/Mac:**  
```bash
chmod +x start.sh
./start.sh
```

**Manual:**
```bash
# Terminal 1: Backend
cd backend && python main.py

# Terminal 2: Frontend  
npm run dev
```

### Azure Resource Requirements

```javascript
export const config = {
  resource: {
    name: 'your-resource-name', // e.g., 'my-ai-foundry'
    region: 'eastus', // e.g., 'eastus', 'westus2'
    auth: {
      method: 'apiKey',
      apiKey: 'your-api-key-here', // Get from Azure Portal
    },
  },

  model: {
    name: 'gpt-realtime', // or 'gpt-4o-realtime'
  },

  session: {
    voice: {
      name: 'en-US-Ava:DragonHDLatestNeural', // Azure HD voice
    },
  },
};
```

#### Option 2: Microsoft Entra ID Authentication (Recommended for Production)

For enhanced security, you can use Microsoft Entra ID (Azure AD) authentication:

1. **Set up Azure AD App Registration**: Follow the [Entra ID Setup Guide](./ENTRA_ID_SETUP.md)

2. **Update Configuration**:
```javascript
export const config = {
  resource: {
    name: 'your-resource-name',
    region: 'eastus',
    auth: {
      method: 'entraId',
      entraId: {
        enabled: true,
        requireAuth: true, // Users must sign in
        signInMethod: 'popup', // 'popup' or 'redirect'
      },
    },
  },
  // ... rest of config
};
```

3. **Configure Client ID**: Update `src/utils/authService.js` with your Azure AD app registration client ID

#### Environment Variables (Optional)

Create a `.env` file for secure configuration:

```bash
# Copy from .env.example
cp .env.example .env
```

Then update the values in `.env`:
```
VITE_AZURE_CLIENT_ID=your-client-id
VITE_AZURE_AI_RESOURCE_NAME=your-resource-name
VITE_AZURE_AI_REGION=your-region
VITE_AUTH_METHOD=entraId
```

### Run the App

```bash
npm run dev
# or
pnpm dev
```

Open [http://localhost:3001](http://localhost:3001) in your browser.

**Click "Start"** to begin your voice conversation!

## 📋 How to Get Azure Credentials

### Option 1: Azure AI Foundry Resource (Recommended)

1. Go to [Azure Portal](https://portal.azure.com)
2. Create or select an **Azure AI Foundry** resource
3. Go to **Keys and Endpoint**
4. Copy:
   - **Resource name** (from the endpoint URL)
   - **Region** (location of your resource)
   - **API Key** (Key 1 or Key 2)

### Option 2: Azure Speech Services Resource

1. Go to [Azure Portal](https://portal.azure.com)
2. Create a **Speech Services** resource
3. Go to **Keys and Endpoint**
4. Copy the same information as above

**Note**: Azure AI Foundry resources support more features including Agent integration.

## 🏗️ Architecture

### Project Structure

```
voice-live/
├── src/
│   ├── components/
│   │   ├── VoiceLiveAgent.jsx       # Main Voice Live component
│   │   └── VoiceLiveAgent.css       # Component styles
│   ├── utils/
│   │   ├── audioCodec.js            # PCM16 encoding/decoding
│   │   ├── audioProcessor.worklet.js # Audio worklet for mic input
│   │   ├── useAudioManager.js       # Audio recording/playback hook
│   │   └── useVoiceLiveClient.js    # WebSocket client hook
│   ├── App.jsx                      # Main app component
│   ├── App.css                      # App styles
│   ├── config.js                    # Configuration
│   └── main.jsx                     # Entry point
├── index.html
├── package.json
└── vite.config.js
```

### How It Works

1. **WebSocket Connection**: Connects to Azure Voice Live API endpoint
2. **Session Configuration**: Sends session.update with voice, turn detection, and audio settings
3. **Audio Recording**: Captures microphone input using Web Audio API + Audio Worklet
4. **Audio Encoding**: Converts Float32 to PCM16 format required by the API
5. **Streaming**: Sends audio chunks over WebSocket in real-time
6. **Turn Detection**: Server detects when user starts/stops speaking
7. **AI Response**: Receives agent's voice response as PCM16 audio chunks
8. **Audio Playback**: Decodes and plays audio with proper sequencing
9. **Transcription**: Displays real-time transcripts of conversation

## 🎙️ Voice Live API Features Used

### Turn Detection

- **Semantic VAD**: Understands semantic meaning, not just volume
- **End-of-Utterance Detection**: Natural pause handling
- **Filler Word Removal**: Reduces false alarms from "um", "uh", etc.

### Audio Enhancement

- **Deep Noise Suppression**: Removes background noise
- **Echo Cancellation**: Server-side echo removal
- **High-Quality Voices**: Azure HD neural voices

### Conversation Features

- **User Interruption**: Interrupt the AI naturally
- **Natural Pauses**: Doesn't cut you off mid-thought
- **Low Latency**: Near real-time responses

## 🔧 Advanced Configuration

### Using Azure AI Foundry Agent

```javascript
model: {
  useAgent: true,
  agentId: 'your-agent-id',
  projectId: 'your-project-id',
}
```

### Customizing Turn Detection

```javascript
turnDetection: {
  type: 'azure_semantic_vad', // or 'azure_semantic_vad_multilingual'
  threshold: 0.3, // Higher = requires more confidence
  silenceDurationMs: 500, // ms of silence to detect end
  removeFillerWords: true,
  endOfUtteranceDetection: {
    model: 'semantic_detection_v1',
    threshold: 0.01,
    timeout: 2,
  },
}
```

### Changing Voice

```javascript
voice: {
  name: 'en-US-AvaNeural', // Standard voice
  // OR
  name: 'en-US-Ava:DragonHDLatestNeural', // HD voice
  type: 'azure-standard',
  temperature: 0.8, // HD voices only: 0.5-1.5
  rate: '1.0', // Speaking rate: 0.5-1.5
}
```

See [Azure voices list](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=tts) for all available voices.

### Multilingual Support

```javascript
turnDetection: {
  type: 'azure_semantic_vad_multilingual', // Supports 10+ languages
  endOfUtteranceDetection: {
    model: 'semantic_detection_v1_multilingual',
  },
}
```

Supported languages: English, Spanish, French, Italian, German, Japanese, Portuguese, Chinese, Korean, Hindi

## 🐛 Troubleshooting

### "Microphone access denied"

- Check browser permissions (click lock icon in address bar)
- Ensure you're on `https://` or `localhost`
- Try refreshing the page

### "WebSocket connection error"

- Verify your API key is correct
- Check resource name matches your Azure resource
- Ensure resource region is correct
- Check your Azure resource is active

### "No audio playback"

- Check browser audio permissions
- Ensure volume is not muted
- Try a different browser (Chrome/Edge recommended)

### "Connection failed"

- Voice Live API requires Azure AI Foundry or Speech Services resource
- Not all regions support all features (see [regions documentation](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/regions))
- HD voices only available in specific regions

### "Poor audio quality"

- Enable noise suppression in config
- Enable echo cancellation if using speakers
- Check microphone quality
- Try reducing background noise

## 📚 Learn More

- [Voice Live API Documentation](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/voice-live-how-to)
- [Azure OpenAI Realtime API Reference](https://learn.microsoft.com/en-us/azure/ai-services/openai/realtime-audio-reference)
- [Azure Speech Service](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/)
- [Azure AI Foundry](https://learn.microsoft.com/en-us/azure/ai-foundry/)

## 🏷️ API Versions

This sample uses:

- **Voice Live API**: `2025-10-01`
- **Azure OpenAI Realtime API**: Compatible events/messages

## 🔐 Security Best Practices

For production:

1. **Never commit API keys** - Use environment variables
2. **Use Microsoft Entra ID** instead of API keys
3. **Implement token refresh** for long sessions
4. **Add rate limiting** to prevent abuse
5. **Validate inputs** on both client and server
6. **Use HTTPS** always (required for microphone access anyway)

Example with environment variables:

```javascript
// vite.config.js
export default {
  define: {
    'import.meta.env.VITE_AZURE_RESOURCE_NAME': JSON.stringify(process.env.VITE_AZURE_RESOURCE_NAME),
    'import.meta.env.VITE_AZURE_API_KEY': JSON.stringify(process.env.VITE_AZURE_API_KEY),
  }
}

// src/config.js
resource: {
  name: import.meta.env.VITE_AZURE_RESOURCE_NAME,
  apiKey: import.meta.env.VITE_AZURE_API_KEY,
}
```

## 🚢 Deployment

### Build for Production

```bash
npm run build
```

Output will be in `dist/` directory.

### Deploy To

- **Azure Static Web Apps**
- **Vercel**
- **Netlify**
- **GitHub Pages**
- **Azure App Service**

All require only static file hosting!

## 🤝 Contributing

This is a sample application. Feel free to:

- Fork and modify for your needs
- Report issues or suggestions
- Share improvements

## 📝 License

MIT License - use freely in your projects!

## 🙏 Acknowledgments

Based on the Azure AI Foundry Voice Live implementation. Special thanks to the Azure Speech and AI teams for the powerful Voice Live API.

---

**Need Help?** Check the [troubleshooting section](#-troubleshooting) or refer to the [official documentation](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/voice-live-how-to).

**Enjoy building real-time voice AI experiences! 🎉**
