# Testing Avatar Video Integration

## Step-by-Step Testing Guide

### 1. Backend Setup Test
```bash
cd backend
python main.py
```

**Expected output:**
```
🚀 Starting Azure Voice Live Proxy Server
📡 Server: http://localhost:8080  
🌐 WebSocket: ws://localhost:8080/ws
☁️  Azure Resource: your-resource-name
👤 Avatar: lisa (casual-sitting)
```

**Test backend:** Visit `http://localhost:8080` - should show server status

### 2. Frontend Connection Test
```bash
npm run dev
```

**Expected console logs:**
```
🔌 Connecting to FastAPI proxy backend...
✅ WebSocket connected to proxy backend
✅ Connected to Azure proxy: Connected to Azure Voice API with avatar support
📤 Sent avatar session config: character=lisa, style=casual-sitting
```

### 3. Avatar WebRTC Test

**Look for these console messages:**
```
📥 Azure→Client: {"type":"session.updated"...
🧊 ICE servers received from Azure: 2 servers  
✅ Session updated
🎭 Setting up avatar WebRTC from session update: [ICE server array]
```

**If successful:**
- Avatar video element should show video stream (not static image)
- Console shows "✅ WebRTC peer connection established"
- No "using static avatar (video not available)" message

### 4. Troubleshooting

**❌ "Missing Azure configuration"**
- Check `backend/.env` file has correct values
- Verify `AZURE_AI_RESOURCE_NAME` and `AZURE_AI_API_KEY` are set

**❌ "Failed to connect to Azure"**  
- Verify Azure resource name is correct
- Check API key permissions
- Ensure resource supports avatars (try Sweden Central region)

**❌ "No ICE servers received"**
- Avatar feature may not be enabled on your Azure resource  
- Try different Azure region (Sweden Central recommended)
- Contact Azure support to enable avatar features

**❌ "WebRTC setup failed"**
- Check browser console for WebRTC errors
- Verify HTTPS/localhost (required for WebRTC)
- Try different browser (Chrome/Edge recommended)

### 5. Success Indicators

✅ **Backend logs:** "ICE servers received from Azure"  
✅ **Frontend logs:** "Setting up avatar WebRTC"  
✅ **UI:** Video element shows moving avatar (not static image)  
✅ **Network:** WebRTC peer connection established in dev tools

### 6. Fallback Behavior

If avatar video fails, the app should:
- Continue with voice-only conversation
- Show static avatar image  
- Log error but not crash
- All audio features work normally