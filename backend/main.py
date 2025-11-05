"""
Azure Voice Live API Proxy Backend
FastAPI server that proxies WebSocket connections to Azure Voice Live API with avatar support
"""

import asyncio
import json
import logging
import ast
import os
import sys
import uuid
from typing import Optional

import uvicorn
import websockets
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from utils.voice_metadata import parse_voice_live_metadata, extract_selected_fields

from dataclasses import dataclass
from typing import Optional, Dict
import os

from typing import Optional, Dict, Any
import aiohttp
from urllib.parse import urljoin
from azure.identity.aio import DefaultAzureCredential

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

console = logging.StreamHandler(sys.stdout)

console.setLevel(logging.DEBUG)

console.setFormatter(logging.Formatter("%(asctime)s | %(levelname)s | line %(lineno)d | %(message)s"))
 
logger.addHandler(console)
 

 

# Azure Voice Live API Configuration
AZURE_VOICE_API_VERSION = os.getenv("API_VERSION", "2025-05-01-preview")
AZURE_COGNITIVE_SERVICES_DOMAIN = "cognitiveservices.azure.com"
VOICE_AGENT_ENDPOINT = "voice-agent/realtime"

# Configuration from environment
AZURE_AI_RESOURCE_NAME = os.getenv("AZURE_AI_RESOURCE_NAME")
MODEL_DEPLOYMENT_NAME = os.getenv("MODEL_DEPLOYMENT_NAME", "gpt-4o")
AVATAR_CHARACTER = os.getenv("AVATAR_CHARACTER", "lisa")
AVATAR_STYLE = os.getenv("AVATAR_STYLE", "casual-sitting")
VOICE_NAME = os.getenv("VOICE_NAME", "en-US-Ava:DragonHDLatestNeural")
VOICE_TYPE = os.getenv("VOICE_TYPE", "azure-standard")
AZURE_PROJECT_NAME = os.getenv("AZURE_PROJECT_NAME")
AZURE_EXISTING_AGENT_NAME= os.getenv("AZURE_EXISTING_AGENT_NAME")
AZURE_EXISTING_AGENT_VERSION= os.getenv("AZURE_EXISTING_AGENT_VERSION")
AZURE_EXISTING_AIPROJECT_ENDPOINT= os.getenv("AZURE_EXISTING_AIPROJECT_ENDPOINT")

# Create FastAPI app
app = FastAPI(title="Azure Voice Live Proxy", version="1.0.0")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001", "http://localhost:3002"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@dataclass
class ApiEndpointConfig:
    path: str
    api_version: str
    is_project: bool
    token_params: Optional[Dict[str, str]] = None

async def get_api_config() -> ApiEndpointConfig:
    """Get API endpoint configuration based on resource ID."""
    # Base configuration
    api_version = "2025-05-15-preview"

    
    return ApiEndpointConfig(
        path=AZURE_EXISTING_AIPROJECT_ENDPOINT,
        api_version=api_version,
        is_project=True,
        token_params={"tokenType": "aml_default"}
    )

async def get_agent_v2() -> Dict[str, Any]:
    # Get API configuration
    config = await get_api_config()
    
    # Build request URL
    url = f"{config.path}/agents/{AZURE_EXISTING_AGENT_NAME}/versions/{AZURE_EXISTING_AGENT_VERSION}"
    
    logger.info(f"Fetching agent from URL: {url}")
    # Prepare query parameters
    params = {
        'api-version': config.api_version
    }
    
    # Add token params if present (for project endpoints)
    if config.token_params:
        params.update(config.token_params)

    credentials = DefaultAzureCredential()
    token = await credentials.get_token("https://ai.azure.com/")
    # Prepare headers
    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {token.token}'
    }
    
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                url,
                params=params,
                headers=headers
            ) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise ValueError(
                        f"Failed to fetch agent: {response.status} - {error_text}"
                    )
                
                return await response.json()
            
    except Exception as e:
        logger.error(f"Error fetching agent {AZURE_EXISTING_AGENT_NAME} v{AZURE_EXISTING_AGENT_VERSION}: {e}")
        raise


async def initialize_agent():
    agent = await get_agent_v2()
    return agent

# Global variables for storing agent data
agent = None
flat_metadata = None

@app.on_event("startup")
async def startup_event():
    """Initialize the agent when the application starts."""
    global agent, flat_metadata
    agent = await initialize_agent()
    metadata = agent.get("metadata", {})
    flat_metadata = parse_voice_live_metadata(metadata)
    logger.info(f"Extracted flat metadata: {flat_metadata}")

class AzureVoiceProxyHandler:
    """Handles WebSocket proxy connections between client and Azure Voice API."""

    async def handle_connection(self, client_ws: WebSocket) -> None:
        """Handle a WebSocket connection from a client."""
        azure_ws = None
        
        try:
            # Accept the WebSocket connection
            await client_ws.accept()
            logger.info(f"✅ Client connected")

            # Connect to Azure Voice Live API
            azure_ws = await self._connect_to_azure()
            if not azure_ws:
                await client_ws.send_text(json.dumps({
                    "type": "error", 
                    "error": {"message": "Failed to connect to Azure Voice API"}
                }))
                return

            # Send connection confirmation
            await client_ws.send_text(json.dumps({
                "type": "proxy.connected", 
                "message": "Connected to Azure Voice API with avatar support"
            }))

            await self._handle_message_forwarding(client_ws, azure_ws)

        except WebSocketDisconnect:
            logger.info("🔌 Client disconnected")
        except Exception as e:
            logger.error(f"❌ Proxy error: {e}")
            try:
                await client_ws.send_text(json.dumps({
                    "type": "error", 
                    "error": {"message": str(e)}
                }))
            except:
                pass
        finally:
            if azure_ws:
                await azure_ws.close()
            logger.info("🔌 Connection closed")
    

    async def _connect_to_azure(self) -> Optional[websockets.WebSocketClientProtocol]:
        """Connect to Azure Voice Live API."""

        try:
            # Build Azure WebSocket URL
            azure_url = (
                f"wss://{AZURE_AI_RESOURCE_NAME}.{AZURE_COGNITIVE_SERVICES_DOMAIN}/"
                f"{VOICE_AGENT_ENDPOINT}?api-version={AZURE_VOICE_API_VERSION}"
                f"&agent-name={AZURE_EXISTING_AGENT_NAME}"
                f"&agent-project-name={AZURE_PROJECT_NAME}"
            )


            print(f"🔑 Azure URL: {azure_url}")
            credentials = DefaultAzureCredential()
            token = await credentials.get_token("https://ai.azure.com/.default")

            print(f"🔑 Acquired Azure token: {token.token}")
            # Connect with API key authentication using extra_headers
            headers = {"Authorization": f'Bearer {token.token}'}
            azure_ws = await websockets.connect(azure_url, extra_headers=headers)
            
            logger.info(f"✅ Connected to Azure Voice API: {AZURE_AI_RESOURCE_NAME}")

            # Send initial avatar-enabled session configuration
            await self._send_initial_avatar_config(azure_ws)

            return azure_ws

        except Exception as e:
            logger.error(f"❌ Failed to connect to Azure: {e}")
            return None

    async def _send_initial_avatar_config(self, azure_ws: websockets.WebSocketClientProtocol) -> None:
        """Send initial session configuration with avatar enabled."""
        global flat_metadata
        avatar_name = flat_metadata.get('avatar.selectedAvatar.avatarName')
        character_name = avatar_name.split("-")[0].lower()
        character_style = avatar_name.split("-")[1]
        session_config = {
            "type": "session.update",
            "session": {
                "modalities": ["text", "audio"],
                "turn_detection": {"type": flat_metadata.get('speech.voiceActivityDetection')},
                "input_audio_noise_reduction": {"type": "azure_deep_noise_suppression" if flat_metadata.get('speech.noiseSuppression') else "near_field"},
                "input_audio_echo_cancellation": {"type": "server_echo_cancellation"},
                "avatar": {
                    "character": character_name,
                    "style": character_style,
                },
                "voice": {
                    "name": flat_metadata.get('speech.voice.shortName'),
                    "type": VOICE_TYPE,
                },
            },
        }

        logger.info(f"varshaaaaaaa {session_config}")
        
        await azure_ws.send(json.dumps(session_config))
        logger.info(f"📤 Sent avatar session config: character={AVATAR_CHARACTER}, style={AVATAR_STYLE}")

    async def _handle_message_forwarding(
        self, 
        client_ws: WebSocket, 
        azure_ws: websockets.WebSocketClientProtocol
    ) -> None:
        """Handle bidirectional message forwarding between client and Azure."""
        
        # Create tasks for both directions
        client_to_azure_task = asyncio.create_task(
            self._forward_client_to_azure(client_ws, azure_ws)
        )
        azure_to_client_task = asyncio.create_task(
            self._forward_azure_to_client(azure_ws, client_ws)
        )

        # Wait for either task to complete (connection close)
        _, pending = await asyncio.wait(
            [client_to_azure_task, azure_to_client_task],
            return_when=asyncio.FIRST_COMPLETED
        )

        # Cancel remaining tasks
        for task in pending:
            task.cancel()

    async def _forward_client_to_azure(
        self, 
        client_ws: WebSocket, 
        azure_ws: websockets.WebSocketClientProtocol
    ) -> None:
        """Forward messages from client to Azure."""
        try:
            async for message in client_ws.iter_text():
                logger.debug(f"📤 Client→Azure: {message[:100]}...")
                await azure_ws.send(message)
        except WebSocketDisconnect:
            logger.debug("🔌 Client disconnected during forwarding")
        except Exception as e:
            logger.error(f"❌ Error forwarding client to Azure: {e}")

    async def _forward_azure_to_client(
        self, 
        azure_ws: websockets.WebSocketClientProtocol, 
        client_ws: WebSocket
    ) -> None:
        """Forward messages from Azure to client."""
        try:
            async for message in azure_ws:
                logger.debug(f"📥 Azure→Client: {message[:100]}...")
                
                # Log ICE servers when they arrive
                try:
                    data = json.loads(message)
                    if (data.get("type") == "session.updated" and 
                        data.get("session", {}).get("avatar", {}).get("ice_servers")):
                        ice_servers = data["session"]["avatar"]["ice_servers"]
                        logger.info(f"🧊 ICE servers received from Azure: {len(ice_servers)} servers")
                except:
                    pass  # Not all messages are JSON
                
                await client_ws.send_text(message)
        except websockets.exceptions.ConnectionClosed:
            logger.debug("🔌 Azure connection closed during forwarding")
        except Exception as e:
            logger.error(f"❌ Error forwarding Azure to client: {e}")


# Initialize the proxy handler
proxy_handler = AzureVoiceProxyHandler()


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """Main WebSocket endpoint for client connections."""
    await proxy_handler.handle_connection(websocket)


@app.get("/")
async def root():
    """Health check endpoint."""
    return {
        "message": "Azure Voice Live Proxy Server", 
        "status": "running",
        "avatar_support": True,
        "azure_resource": AZURE_AI_RESOURCE_NAME
    }


@app.get("/config")
async def get_config():
    """Return client configuration."""
    return {
        "ws_endpoint": "/ws",
        "config": flat_metadata
    }


if __name__ == "__main__":
    # Configuration
    host = os.getenv("HOST", "localhost")
    port = int(os.getenv("PORT", 8080))
    
    logger.info(f"🚀 Starting Azure Voice Live Proxy Server")
    logger.info(f"📡 Server: http://{host}:{port}")
    logger.info(f"🌐 WebSocket: ws://{host}:{port}/ws")
    logger.info(f"☁️  Azure Resource: {AZURE_AI_RESOURCE_NAME}")
    logger.info(f"👤 Avatar: {AVATAR_CHARACTER} ({AVATAR_STYLE})")
    
    # Start the server
    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        reload=True,
        log_level="info"
    )