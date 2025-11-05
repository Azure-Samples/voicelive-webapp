# Voice Live Web Application

A real-time voice chat application with avatar support built using Azure Voice Live API and WebRTC.

## Features

- Real-time voice communication with AI agent
- Customizable avatar display
- WebRTC-based video streaming
- Voice activity detection
- Transcription support with captions
- Interactive controls (mute, pause, captions toggle)
- Configurable voice and speech settings

## Project Structure

```
voicelive-webapp/
├── backend/                # Python FastAPI backend
│   ├── main.py            # Main server implementation
│   ├── utils/             # Utility functions
│   └── requirements.txt   # Python dependencies
├── frontend/              # React TypeScript frontend
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── utils/        # Utility functions
│   │   └── types/        # TypeScript type definitions
│   ├── package.json      # Node dependencies
│   └── index.html        # Entry point
```

## Prerequisites

- Python 3.10 or higher
- Node.js 16 or higher
- Azure subscription with Voice Live API access

## Setup

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Install Python dependencies:
```bash
pip install -r requirements.txt
```

3. Configure environment variables:
Create a `.env` file in the backend directory with:
```
AZURE_VOICE_LIVE_KEY=your_key_here
AZURE_VOICE_LIVE_REGION=your_region
```

4. Start the backend server:
```bash
python main.py
```

### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install Node dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

## Features

### Voice Live Client

The application uses WebSocket connection to communicate with Azure Voice Live API:
- Real-time audio streaming
- Voice activity detection
- Transcription support

### Avatar Support

- WebRTC-based avatar video streaming
- Customizable avatar selection
- Synchronized audio-visual experience

### Interactive Controls

- Mute/Unmute audio
- Pause/Resume conversation
- Toggle captions
- Start/End call functionality

## Configuration

### Backend Configuration

The backend supports configuration of:
- Speech language
- Voice type and settings
- Voice activity detection parameters
- Avatar settings

### Frontend Configuration

Configurable features include:
- Audio input/output settings
- WebRTC configuration
- Avatar display options
- UI customization

## Development

### Adding New Features

1. Backend:
- Add new routes in `main.py`
- Implement utility functions in `utils/`
- Update configuration handling as needed

2. Frontend:
- Create new components in `components/`
- Add utility functions in `utils/`
- Update TypeScript types in `types/`

### WebRTC Avatar Implementation

The application uses WebRTC for avatar video streaming:
- Peer connection setup
- ICE server configuration
- SDP offer/answer exchange
- Video stream handling

## Troubleshooting

Common issues and solutions:

1. WebSocket Connection:
- Verify Azure credentials
- Check network connectivity
- Ensure backend is running

2. Avatar Display:
- Verify WebRTC configuration
- Check browser compatibility
- Ensure proper ICE server setup

3. Audio Issues:
- Check microphone permissions
- Verify audio device selection
- Check audio stream configuration

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.
