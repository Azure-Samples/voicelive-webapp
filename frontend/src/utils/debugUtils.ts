/**
 * Debug utilities for Voice Live Client troubleshooting
 */

import { config, buildWebSocketUrl, getAuthHeaders } from '../config.js';

/**
 * Test authentication and basic WebSocket connection
 */
export async function testConnection() {
  console.group('🔍 Voice Live Connection Test');
  
  try {
    // Test 1: Check configuration
    console.log('1️⃣ Configuration check:');
    console.log('  Resource name:', config.resource.name);
    console.log('  Region:', config.resource.region);
    console.log('  Auth method:', config.resource.auth.method);
    console.log('  Avatar enabled:', config.session.avatar?.enabled);
    
    // Test 2: Check WebSocket URL
    console.log('2️⃣ WebSocket URL generation:');
    const wsUrl = buildWebSocketUrl();
    console.log('  Base URL:', wsUrl);
    
    // Test 3: Check authentication
    console.log('3️⃣ Authentication test:');
    const authHeaders = await getAuthHeaders();
    const authType = Object.keys(authHeaders)[0];
    console.log('  Auth type:', authType);
    console.log('  Has credentials:', !!authHeaders[authType]);
    
    if (authType === 'Authorization') {
      const token = authHeaders['Authorization'].replace('Bearer ', '');
      console.log('  Token length:', token.length);
      console.log('  Token preview:', token.substring(0, 20) + '...');
      
      // Try to decode JWT token (if it's a JWT)
      try {
        const tokenParts = token.split('.');
        if (tokenParts.length === 3) {
          const payload = JSON.parse(atob(tokenParts[1]));
          console.log('  Token payload:', payload);
          console.log('  Token expires:', new Date(payload.exp * 1000));
          console.log('  Token audience:', payload.aud);
          console.log('  Token scopes:', payload.scp);
        }
      } catch (e) {
        console.log('  Token is not a valid JWT or cannot be decoded');
      }
    }
    
    // Test 4: Create minimal session update (without avatar)
    console.log('4️⃣ Minimal session configuration:');
    const minimalSession = {
      type: 'session.update',
      session: {
        instructions: config.session.instructions,
        modalities: config.session.modalities,
        voice: {
          name: config.session.voice.name,
          type: config.session.voice.type,
        },
        turn_detection: {
          type: 'server_vad', // Use simpler VAD for testing
          threshold: 0.5,
        },
        input_audio_sampling_rate: 24000,
      },
    };
    console.log('  Minimal session:', JSON.stringify(minimalSession, null, 2));
    
    // Test 5: Test WebSocket connection with minimal config
    console.log('5️⃣ Testing WebSocket connection...');
    await testWebSocketConnection(wsUrl, authHeaders, minimalSession);
    
  } catch (error) {
    console.error('❌ Connection test failed:', error);
  } finally {
    console.groupEnd();
  }
}

/**
 * Test WebSocket connection with given parameters
 */
async function testWebSocketConnection(wsUrl, authHeaders, sessionUpdate) {
  return new Promise((resolve, reject) => {
    let finalUrl = wsUrl;
    
    if (authHeaders['api-key']) {
      finalUrl += `&api-key=${encodeURIComponent(authHeaders['api-key'])}`;
    } else if (authHeaders['Authorization']) {
      const token = authHeaders['Authorization'].replace('Bearer ', '');
      finalUrl += `&authorization=${encodeURIComponent(token)}`;
    }
    
    console.log('  Connecting to:', finalUrl.replace(/(api-key|authorization)=[^&]+/g, '$1=***'));
    
    const ws = new WebSocket(finalUrl);
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('Connection timeout'));
    }, 10000);
    
    ws.onopen = () => {
      console.log('  ✅ WebSocket connected');
      console.log('  📤 Sending session update...');
      ws.send(JSON.stringify(sessionUpdate));
    };
    
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      console.log('  📩 Received:', message.type, message);
      
      if (message.type === 'session.created') {
        console.log('  ✅ Session created successfully!');
        clearTimeout(timeout);
        ws.close();
        resolve(message);
      } else if (message.type === 'error') {
        console.error('  ❌ Session error:', message.error);
        clearTimeout(timeout);
        ws.close();
        reject(new Error(message.error.message || 'Session error'));
      }
    };
    
    ws.onerror = (error) => {
      console.error('  ❌ WebSocket error:', error);
      clearTimeout(timeout);
      reject(error);
    };
    
    ws.onclose = (event) => {
      console.log('  🔌 WebSocket closed:', event.code, event.reason);
      clearTimeout(timeout);
      if (event.code !== 1000) {
        reject(new Error(`WebSocket closed with code ${event.code}: ${event.reason}`));
      }
    };
  });
}

/**
 * Test avatar-specific configuration
 */
export async function testAvatarConnection() {
  console.group('🎭 Avatar Connection Test');
  
  try {
    const wsUrl = buildWebSocketUrl();
    const authHeaders = await getAuthHeaders();
    
    // Create avatar-enabled session update
    const avatarSession = {
      type: 'session.update',
      session: {
        instructions: config.session.instructions,
        modalities: config.session.modalities,
        voice: {
          name: config.session.voice.name,
          type: config.session.voice.type,
        },
        turn_detection: {
          type: 'azure_semantic_vad',
          threshold: 0.3,
        },
        input_audio_sampling_rate: 24000,
        avatar: {
          character: config.session.avatar.character,
          style: config.session.avatar.style,
          customized: config.session.avatar.customized,
          video: config.session.avatar.video,
        },
      },
    };
    
    console.log('🎭 Testing with avatar configuration:', JSON.stringify(avatarSession, null, 2));
    await testWebSocketConnection(wsUrl, authHeaders, avatarSession);
    
  } catch (error) {
    console.error('❌ Avatar connection test failed:', error);
  } finally {
    console.groupEnd();
  }
}

/**
 * Debug avatar loading issues
 */
export async function debugAvatarLoading() {
  console.group('🎭 Avatar Loading Debug');
  
  try {
    // Check avatar configuration
    console.log('🔧 Avatar Configuration:');
    console.log('  Enabled:', config.session.avatar?.enabled);
    console.log('  Character:', config.session.avatar?.character);
    console.log('  Style:', config.session.avatar?.style);
    console.log('  Video config:', config.session.avatar?.video);
    
    // Check if avatar images are accessible
    console.log('🖼️ Avatar Image Accessibility:');
    const avatar = config.session.avatar;
    if (avatar?.avatarImg) {
      try {
        const response = await fetch(avatar.avatarImg, { method: 'HEAD' });
        console.log('  Avatar thumbnail:', response.ok ? '✅ Accessible' : '❌ Not accessible');
      } catch (e) {
        console.log('  Avatar thumbnail: ❌ Error -', e.message);
      }
    }
    
    if (avatar?.avatarBigImg) {
      try {
        const response = await fetch(avatar.avatarBigImg, { method: 'HEAD' });
        console.log('  Avatar big image:', response.ok ? '✅ Accessible' : '❌ Not accessible');
      } catch (e) {
        console.log('  Avatar big image: ❌ Error -', e.message);
      }
    }
    
    // Test with avatar disabled first
    console.log('🚀 Testing connection without avatar...');
    const originalAvatarConfig = config.session.avatar.enabled;
    config.session.avatar.enabled = false;
    
    try {
      const wsUrl = buildWebSocketUrl();
      const authHeaders = await getAuthHeaders();
      const basicSession = {
        type: 'session.update',
        session: {
          instructions: config.session.instructions,
          modalities: config.session.modalities,
          voice: {
            name: config.session.voice.name,
            type: config.session.voice.type,
          },
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
          },
          input_audio_sampling_rate: 24000,
        },
      };
      
      await testWebSocketConnection(wsUrl, authHeaders, basicSession);
      console.log('✅ Basic connection works without avatar');
      
    } catch (error) {
      console.error('❌ Basic connection failed:', error);
      return;
    } finally {
      // Restore avatar config
      config.session.avatar.enabled = originalAvatarConfig;
    }
    
    // Now test with avatar enabled
    console.log('🎭 Testing connection with avatar...');
    try {
      await testAvatarConnection();
      console.log('✅ Avatar connection test completed');
    } catch (error) {
      console.error('❌ Avatar connection failed:', error);
    }
    
  } catch (error) {
    console.error('❌ Avatar debug failed:', error);
  } finally {
    console.groupEnd();
  }
}

/**
 * Monitor avatar loading in real-time
 */
export function monitorAvatarLoading() {
  console.log('🎭 Starting avatar loading monitor...');
  
  // Monitor DOM changes for avatar elements
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // Check for avatar video elements
          const videos = node.querySelectorAll ? node.querySelectorAll('video') : [];
          if (node.tagName === 'VIDEO') videos.push(node);
          
          videos.forEach((video) => {
            if (video.className.includes('avatar-video')) {
              console.log('📺 Avatar video element added:', video);
              
              video.addEventListener('loadstart', () => console.log('📺 Video load started'));
              video.addEventListener('loadeddata', () => console.log('📺 Video data loaded'));
              video.addEventListener('canplay', () => console.log('📺 Video can play'));
              video.addEventListener('error', (e) => console.error('📺 Video error:', e));
            }
          });
          
          // Check for loading indicators
          const loadingElements = node.querySelectorAll ? node.querySelectorAll('.avatar-loading') : [];
          if (node.className && node.className.includes('avatar-loading')) loadingElements.push(node);
          
          loadingElements.forEach((element) => {
            console.log('⏳ Avatar loading element detected:', element.textContent);
          });
        }
      });
    });
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  console.log('👁️ Avatar loading monitor active');
  
  // Return cleanup function
  return () => {
    observer.disconnect();
    console.log('👁️ Avatar loading monitor stopped');
  };
}

// Make functions available globally for easy testing
window.testVoiceLiveConnection = testConnection;
window.testAvatarConnection = testAvatarConnection;
window.debugAvatarLoading = debugAvatarLoading;
window.monitorAvatarLoading = monitorAvatarLoading;