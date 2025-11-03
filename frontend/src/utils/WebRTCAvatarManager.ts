/**
 * WebRTC Avatar Manager for Voice Live Sample App
 * Handles avatar video streams using WebRTC peer connections
 * Based on Azure AI Foundry's avatar implementation
 */

export interface AvatarMediaElements {
  video: HTMLVideoElement | null;
  audio: HTMLAudioElement | null;
}

export interface ICEServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export class WebRTCAvatarManager {
  private peerConnection: RTCPeerConnection | null = null;
  private mediaElements: AvatarMediaElements = { video: null, audio: null };
  private receivedTracks = new Set<string>();
  private onAvatarReady: (() => void) | null = null;
  private onConnectionStateChange: ((state: RTCPeerConnectionState) => void) | null = null;
  private sendOfferCallback: ((sdp: string) => void) | null = null;
  private offerSent: boolean = false;

  constructor(sendOfferCallback?: (sdp: string) => void) {
    console.log('🎭 WebRTCAvatarManager constructor called');
    this.sendOfferCallback = sendOfferCallback || null;
    console.log('📤 Send offer callback set:', !!this.sendOfferCallback);
    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    // Event handlers will be set up when peer connection is created
  }

  /**
   * Set up peer connection with ICE servers
   */
  async setupPeerConnection(iceServers: RTCIceServer[]): Promise<void> {
    try {
      console.log('🔗 Setting up WebRTC peer connection with ICE servers:', iceServers);
      console.log('🔗 Number of ICE servers:', iceServers.length);
      
      // Close existing connection
      if (this.peerConnection) {
        console.log('🔄 Closing existing peer connection');
        this.peerConnection.close();
        this.peerConnection = null;
      }

      // Reset offer sent flag
      this.offerSent = false;

      // Check WebRTC support
      if (typeof RTCPeerConnection === 'undefined') {
        throw new Error('WebRTC not supported in this environment');
      }

      console.log('✅ WebRTC is supported');

      // Create new peer connection
      this.peerConnection = new RTCPeerConnection({ iceServers });
      
      // Set up event handlers
      this.peerConnection.oniceconnectionstatechange = () => {
        if (this.peerConnection) {
          console.log('❄️ ICE connection state:', this.peerConnection.iceConnectionState);
          if (this.onConnectionStateChange) {
            this.onConnectionStateChange(this.peerConnection.connectionState);
          }
        }
      };

      this.peerConnection.onicecandidate = (event) => {
        console.log('🧊 ICE candidate:', event.candidate);
        if (!event.candidate && this.peerConnection?.localDescription && this.sendOfferCallback && !this.offerSent) {
          // All ICE candidates have been gathered, send the complete offer
          this.offerSent = true;
          const sdp = btoa(JSON.stringify({
            type: 'offer',
            sdp: this.peerConnection.localDescription.sdp
          }));
          console.log('📤 Sending SDP offer to Azure (ICE complete)');
          this.sendOfferCallback(sdp);
        }
      };

      this.peerConnection.ontrack = (event) => {
        console.log('📺 Media track received:', event.track.kind);
        this.handleMediaTrack(event);
      };

      // Add transceivers for receiving avatar streams
      this.peerConnection.addTransceiver('video', { direction: 'recvonly' });
      this.peerConnection.addTransceiver('audio', { direction: 'sendrecv' });

      // Create data channel for events
      this.peerConnection.createDataChannel('eventChannel');

      console.log('✅ Peer connection setup completed');
    } catch (error) {
      console.error('❌ Failed to setup peer connection:', error);
      throw error;
    }
  }

  /**
   * Create WebRTC offer and establish connection
   */
  async createOfferAndConnect(): Promise<void> {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }

    try {
      console.log('🤝 Creating WebRTC offer...');
      
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);

      console.log('📤 Local description set, ICE gathering will trigger offer send...');
      
      // Wait a bit for ICE gathering, then send offer regardless
      setTimeout(() => {
        if (this.peerConnection?.localDescription && this.sendOfferCallback && !this.offerSent) {
          this.offerSent = true;
          const sdp = btoa(JSON.stringify({
            type: 'offer',
            sdp: this.peerConnection.localDescription.sdp
          }));
          console.log('📤 Sending SDP offer to Azure (timeout fallback)');
          this.sendOfferCallback(sdp);
        }
      }, 2000); // Wait 2 seconds for ICE candidates

    } catch (error) {
      console.error('❌ Failed to create offer:', error);
      throw error;
    }
  }

  /**
   * Wait for ICE gathering to complete
   */
  private async waitForIceGathering(): Promise<void> {
    if (!this.peerConnection || this.peerConnection.iceGatheringState === 'complete') {
      return;
    }

    console.log('❄️ Waiting for ICE gathering...', this.peerConnection.iceGatheringState);

    return Promise.race([
      new Promise<void>((resolve) => {
        const handleIceGatheringStateChange = () => {
          if (this.peerConnection?.iceGatheringState === 'complete') {
            this.peerConnection.removeEventListener('icegatheringstatechange', handleIceGatheringStateChange);
            console.log('✅ ICE gathering completed');
            resolve();
          }
        };
        this.peerConnection?.addEventListener('icegatheringstatechange', handleIceGatheringStateChange);
      }),
      new Promise<void>((resolve) => {
        setTimeout(() => {
          console.log('⏰ ICE gathering timeout after 2 seconds');
          resolve();
        }, 2000);
      })
    ]);
  }

  /**
   * Handle SDP answer from Azure
   */
  async handleAnswer(serverSdp: string): Promise<void> {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }

    try {
      console.log('📥 Received SDP answer from Azure');
      const answer = JSON.parse(atob(serverSdp));
      
      await this.peerConnection.setRemoteDescription({
        type: 'answer',
        sdp: answer.sdp
      });
      
      console.log('✅ Remote description set, WebRTC connection established');
    } catch (error) {
      console.error('❌ Failed to handle SDP answer:', error);
      throw error;
    }
  }

  /**
   * Handle incoming media tracks from avatar stream
   */
  private handleMediaTrack(event: RTCTrackEvent): void {
    try {
      const stream = event.streams[0];
      if (!stream) {
        console.warn('⚠️ No stream in track event');
        return;
      }

      const mediaType = event.track.kind; // 'audio' or 'video'
      console.log(`📺 Processing ${mediaType} track`);

      // Track received media types
      this.receivedTracks.add(mediaType);

      // Assign stream to appropriate element
      const mediaElement = mediaType === 'video' ? this.mediaElements.video : this.mediaElements.audio;
      if (mediaElement) {
        (mediaElement as HTMLMediaElement).srcObject = stream;
        console.log(`✅ ${mediaType} stream assigned to element`);
        
        // For video elements, ensure autoplay
        if (mediaType === 'video' && mediaElement instanceof HTMLVideoElement) {
          mediaElement.play().catch(error => {
            console.warn('⚠️ Auto-play failed (this is normal in some browsers):', error);
          });
        }
      } else {
        console.warn(`⚠️ No ${mediaType} element available for stream assignment`);
      }

      // Check if avatar is ready (both video and audio received)
      if (this.receivedTracks.has('video') && this.receivedTracks.has('audio')) {
        console.log('🎭 Avatar ready - both video and audio tracks received');
        if (this.onAvatarReady) {
          this.onAvatarReady();
        }
      }
    } catch (error) {
      console.error('❌ Error handling media track:', error);
    }
  }

  /**
   * Set media elements for avatar display (foundry compatibility)
   */
  setMediaElements(elements: { video: HTMLVideoElement | null; audio: HTMLAudioElement | null }): void;
  setMediaElements(video: HTMLVideoElement | null, audio: HTMLAudioElement | null): void;
  setMediaElements(
    elementsOrVideo: { video: HTMLVideoElement | null; audio: HTMLAudioElement | null } | HTMLVideoElement | null,
    audio?: HTMLAudioElement | null
  ): void {
    // Handle both call signatures for foundry compatibility
    if (elementsOrVideo && typeof elementsOrVideo === 'object' && 'video' in elementsOrVideo) {
      // New foundry pattern: setMediaElements({ video, audio })
      this.mediaElements = elementsOrVideo;
    } else {
      // Old pattern: setMediaElements(video, audio)
      this.mediaElements = { 
        video: elementsOrVideo as HTMLVideoElement | null, 
        audio: audio || null 
      };
    }
    
    console.log('📺 Avatar media elements set:', { 
      hasVideo: !!this.mediaElements.video, 
      hasAudio: !!this.mediaElements.audio 
    });
  }

  /**
   * Set callback for when avatar is ready
   */
  onReady(callback: () => void): void {
    this.onAvatarReady = callback;
  }

  /**
   * Set callback for connection state changes
   */
  onConnectionState(callback: (state: RTCPeerConnectionState) => void): void {
    this.onConnectionStateChange = callback;
  }

  /**
   * Close peer connection and cleanup
   */
  close(): void {
    try {
      console.log('🔌 Closing WebRTC avatar connection...');

      // Clear media elements
      if (this.mediaElements.video) {
        this.mediaElements.video.srcObject = null;
      }
      if (this.mediaElements.audio) {
        this.mediaElements.audio.srcObject = null;
      }

      // Reset state
      this.mediaElements = { video: null, audio: null };
      this.receivedTracks.clear();

      // Close peer connection
      if (this.peerConnection) {
        this.peerConnection.close();
        this.peerConnection = null;
      }

      console.log('✅ WebRTC avatar connection closed');
    } catch (error) {
      console.error('❌ Error closing WebRTC connection:', error);
    }
  }

  /**
   * Get current connection state
   */
  getConnectionState(): RTCPeerConnectionState | 'disconnected' {
    return this.peerConnection?.connectionState || 'disconnected';
  }

  /**
   * Check if avatar is currently ready
   */
  isAvatarReady(): boolean {
    return this.receivedTracks.has('video') && this.receivedTracks.has('audio');
  }
}