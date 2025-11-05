"""
Azure Voice Live Integration Server with Agent V2 Support

FastAPI server that integrates with Azure Voice Live API using an existing Agent V2.
"""

import asyncio
import json
import logging
import os
from datetime import datetime
import sys
from typing import Dict, Any, Optional
from dataclasses import dataclass

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Import the necessary modules
from azure.core.credentials import AzureKeyCredential
from azure.identity import DefaultAzureCredential
from azure.ai.voicelive.aio import connect
from voice_live_with_agent_v2 import (
    AudioProcessor,
    BasicVoiceAssistant
)

MODEL_DEPLOYMENT_NAME = os.getenv("MODEL_DEPLOYMENT_NAME", "gpt-4")

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

console = logging.StreamHandler(sys.stdout)

console.setLevel(logging.DEBUG)

console.setFormatter(logging.Formatter("%(asctime)s | %(levelname)s | line %(lineno)d | %(message)s"))
 
logger.addHandler(console)
 

# Load environment variables
load_dotenv()

# Configuration from environment
# Azure Voice Live API Configuration
AZURE_VOICE_API_VERSION = os.getenv("API_VERSION", "2025-05-01-preview")
AZURE_COGNITIVE_SERVICES_DOMAIN = "cognitiveservices.azure.com"
VOICE_AGENT_ENDPOINT = "voice-agent/realtime"

# Configuration from environment
AZURE_AI_RESOURCE_NAME = os.getenv("AZURE_AI_RESOURCE_NAME")
AZURE_AI_API_KEY = os.getenv("AZURE_AI_API_KEY")
MODEL_DEPLOYMENT_NAME = os.getenv("MODEL_DEPLOYMENT_NAME", "gpt-4o")
AVATAR_CHARACTER = os.getenv("AVATAR_CHARACTER", "lisa")
AVATAR_STYLE = os.getenv("AVATAR_STYLE", "casual-sitting")
VOICE_NAME = os.getenv("VOICE_NAME", "en-US-Ava:DragonHDLatestNeural")
VOICE_TYPE = os.getenv("VOICE_TYPE", "azure-standard")
AZURE_PROJECT_NAME = os.getenv("AZURE_PROJECT_NAME")
AZURE_EXISTING_AGENT_NAME = os.getenv("AZURE_EXISTING_AGENT_NAME")
AZURE_EXISTING_AGENT_VERSION = os.getenv("AZURE_EXISTING_AGENT_VERSION")
AZURE_EXISTING_AIPROJECT_ENDPOINT = os.getenv("AZURE_EXISTING_AIPROJECT_ENDPOINT")
AZURE_BEARER_TOKEN = os.getenv("AZURE_BEARER_TOKEN")
AZURE_AI_ENDPOINT=os.getenv("AZURE_AI_ENDPOINT")


# Create FastAPI app
app = FastAPI(title="Azure Voice Live Agent V2 Integration Server", version="1.0.0")

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

def get_api_config() -> ApiEndpointConfig:
    """Get API endpoint configuration based on resource ID."""
    # Base configuration
    api_version = "2025-05-15-preview"


    return ApiEndpointConfig(
        path=AZURE_EXISTING_AIPROJECT_ENDPOINT,
        api_version=api_version,
        is_project=True,
        token_params={"tokenType": "aml_default"}
    )

def get_agent_v2_url() -> str:
    # Get API configuration
    config = get_api_config()

    # Build request URL
    url = f"{config.path}/agents/{AZURE_EXISTING_AGENT_NAME}/versions/{AZURE_EXISTING_AGENT_VERSION}"

    logger.info(f"Building Agent V2 URL with base: {url}")

    return url


async def setup_voice_connection():
    """Set up voice connection with the Agent V2."""
    logger.info("🔗 Setting up connection to Azure Voice Live...")
    try:
        # Get Azure credentials using DefaultAzureCredential
        credential = DefaultAzureCredential()

        # Create the endpoint URL with query parameters for Agent V2
        endpoint = get_agent_v2_url()

        logger.info(f"✅ Endpoint URL: {endpoint}")


        # Create connection
        connection = BasicVoiceAssistant(
            endpoint=AZURE_AI_ENDPOINT,
            credential=credential,
            agent_name=AZURE_EXISTING_AGENT_NAME,
            foundry_project_name=AZURE_PROJECT_NAME,
            voice=VOICE_NAME,
        )
        
        logger.info(f"✅ Connected to Azure Voice Live with Agent: {AZURE_EXISTING_AGENT_NAME}")
        return connection

    except Exception as e:
        logger.error(f"❌ Failed to connect to Azure: {e}")
        raise


class VoiceLiveHandler:
    """Handles WebSocket connections and Azure Voice Live Agent V2 integration."""

    def __init__(self):
        """Initialize the handler."""
        self.connection = None
        self.audio_processor = None
        self.conversation_log = []

    async def handle_connection(self, websocket: WebSocket) -> None:
        logger.info("🔗 hereeee...")
        """Handle a WebSocket connection from a client."""
        try:
            # Accept the WebSocket connection
            await websocket.accept()
            logger.info("✅ Client connected")

            # Connect to Azure Voice Live
            self.connection = await setup_voice_connection()
            if not self.connection:
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "error": {"message": "Failed to connect to Azure Voice Live"}
                }))
                return

            # # Initialize audio processor
            # self.audio_processor = AudioProcessor(self.connection)
            # self.audio_processor.start_capture()
            # self.audio_processor.start_playback()

            # Send connection confirmation
            await websocket.send_text(json.dumps({
                "type": "connected",
                "status": "success",
                "message": f"Connected to Agent: {AZURE_EXISTING_AGENT_NAME}"
            }))

            # Handle messages
            await self._handle_messages(websocket)

        except WebSocketDisconnect:
            logger.info("🔌 Client disconnected")
        except Exception as e:
            logger.error(f"❌ Error in connection handler: {e}")
            try:
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "error": {"message": str(e)}
                }))
            except:
                pass
        finally:
            # Save conversation log
            self._save_conversation_log()
            
            # Cleanup
            if self.audio_processor:
                self.audio_processor.stop_capture()
                self.audio_processor.stop_playback()
            if self.connection:
                await self.connection.close()
            logger.info("🔌 Connection closed")

    def _save_conversation_log(self) -> None:
        """Save the conversation log to a file."""
        try:
            filename = f"logs/{timestamp}_conversation.log"
            with open(filename, "w") as f:
                for entry in self.conversation_log:
                    f.write(json.dumps(entry) + "\n")
            logger.info(f"Conversation log saved to {filename}")
        except Exception as e:
            logger.error(f"Failed to save conversation log: {e}")

    async def _handle_messages(self, websocket: WebSocket) -> None:
        """Handle bidirectional message flow."""
        try:
            # Start Azure event handler
            # azure_task = asyncio.create_task(self._handle_azure_events(websocket))
            
            # Handle client messages
            while True:
                try:
                    # Get message from client
                    message = await websocket.receive_text()
                    data = json.loads(message)

                    logger.info(f"Received message from client: {data}")

                    # Log user input
                    if data.get("type") == "text":
                        self.conversation_log.append({
                            "timestamp": datetime.now().isoformat(),
                            "role": "user",
                            "text": data.get("text", "")
                        })
                        await self.connection.send_text(data.get("text", ""))
                    elif data.get("type") == "command":
                        await self._handle_command(websocket, data.get("command"))
                    
                except WebSocketDisconnect:
                    break
                except json.JSONDecodeError:
                    logger.error("Invalid JSON received from client")
                    continue
                except Exception as e:
                    logger.error(f"Error handling client message: {e}")
                    continue

        except Exception as e:
            logger.error(f"Error in message handler: {e}")
            raise

    async def _handle_command(self, websocket: WebSocket, command: Dict) -> None:
        """Handle custom commands from client."""
        try:
            cmd_type = command.get("type")
            if cmd_type == "reset":
                # Reset conversation
                self.conversation_log = []
                await websocket.send_text(json.dumps({
                    "type": "command",
                    "status": "success",
                    "command": "reset"
                }))
            
        except Exception as e:
            logger.error(f"Error handling command: {e}")
            await websocket.send_text(json.dumps({
                "type": "error",
                "error": {"message": f"Command failed: {str(e)}"}
            }))

    async def _handle_azure_events(self, websocket: WebSocket) -> None:
        """Handle events from Azure Voice Live."""
        if not self.connection or not self.audio_processor:
            logger.error("Connection or audio processor not initialized")
            return

        try:
            async for event in self.connection.events():
                try:
                    if event.type == "audio":
                        # Queue audio for playback
                        if event.data:
                            packet = self.audio_processor.AudioPlaybackPacket(
                                self.audio_processor._get_and_increase_seq_num(),
                                event.data
                            )
                            self.audio_processor.playback_queue.put(packet)
                    elif event.type == "text":
                        # Log assistant response
                        self.conversation_log.append({
                            "timestamp": datetime.now().isoformat(),
                            "role": "assistant",
                            "text": event.data
                        })
                        # Forward text to client
                        await websocket.send_text(json.dumps({
                            "type": "text",
                            "text": event.data
                        }))
                    elif event.type == "error":
                        logger.error(f"Received error from Azure: {event.data}")
                        await websocket.send_text(json.dumps({
                            "type": "error",
                            "error": {"message": str(event.data)}
                        }))
                
                except WebSocketDisconnect:
                    break
                except Exception as e:
                    logger.error(f"Error handling Azure event: {e}")
                    continue

        except asyncio.CancelledError:
            logger.info("Azure event handler cancelled")
        except Exception as e:
            logger.error(f"Error in Azure event handler: {e}")
            raise


# Initialize the handler
handler = VoiceLiveHandler()


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    """WebSocket endpoint for client connections."""
    logger.info("🌐 New WebSocket connection request hello")
    await handler.handle_connection(websocket)


@app.get("/")
async def root() -> Dict[str, Any]:
    """Health check endpoint."""
    return {
        "message": "Azure Voice Live Agent V2 Integration Server",
        "status": "running",
        "azure_resource": AZURE_AI_RESOURCE_NAME,
        "agent": AZURE_EXISTING_AGENT_NAME,
        "project": AZURE_PROJECT_NAME,
        "voice": VOICE_NAME
    }


if __name__ == "__main__":
    # Validate environment variables
    required_vars = {
        "AZURE_AI_RESOURCE_NAME": AZURE_AI_RESOURCE_NAME,
        "AZURE_PROJECT_NAME": AZURE_PROJECT_NAME,
        "AZURE_EXISTING_AGENT_NAME": AZURE_EXISTING_AGENT_NAME
    }
    
    missing_vars = [var for var, value in required_vars.items() if not value]
    if missing_vars:
        logger.error(f"❌ Missing required environment variables: {', '.join(missing_vars)}")
        raise ValueError(f"Required environment variables must be set in .env file: {', '.join(missing_vars)}")
    
    # Configuration
    host = os.getenv("HOST", "localhost")
    port = int(os.getenv("PORT", 8081))
    
    logger.info(f"🚀 Starting Azure Voice Live Agent V2 Integration Server")
    logger.info(f"📡 Server: http://{host}:{port}")
    logger.info(f"🌐 WebSocket: ws://{host}:{port}/ws")
    logger.info(f"☁️  Azure Resource: {AZURE_AI_RESOURCE_NAME}")
    logger.info(f"🤖 Agent: {AZURE_EXISTING_AGENT_NAME}")
    logger.info(f"📂 Project: {AZURE_PROJECT_NAME}")
    logger.info(f"🗣️  Voice: {VOICE_NAME}")
    
    # Start the server
    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        reload=True,
        log_level="info"
    )
