# Azure Voice Live Proxy Backend

FastAPI backend that proxies WebSocket connections to Azure Voice Live API with avatar support.

## Setup

1. **Install Python Dependencies**
```bash
cd backend
pip install -r requirements.txt
```

2. **Configure Environment**
```bash
cp .env.example .env
# Edit .env with your Azure credentials
```

3. **Required Azure Configuration**
- `AZURE_AI_RESOURCE_NAME`: Your Azure AI Services resource name
- `AZURE_AI_API_KEY`: API key for your Azure resource
- `MODEL_DEPLOYMENT_NAME`: GPT model deployment (e.g., gpt-4o)

## Running the Server

```bash
python main.py
```

Server will start on `http://localhost:8080`
WebSocket endpoint: `ws://localhost:8080/ws`

## Features

- ✅ **Avatar Support**: Automatically configures Lisa avatar with casual-sitting style
- ✅ **ICE Server Provisioning**: Gets real WebRTC ICE servers from Azure
- ✅ **Message Proxying**: Forwards all WebSocket messages to/from Azure
- ✅ **CORS Support**: Allows frontend connections from localhost
- ✅ **Logging**: Detailed logs for debugging WebRTC setup

## Testing

Visit `http://localhost:8080` to see server status and configuration.