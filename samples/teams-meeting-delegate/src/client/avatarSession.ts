export class AvatarSession {
  readonly #sendEvent: (event: Record<string, unknown>) => void;
  readonly #onTrack: (
    kind: 'audio' | 'video',
    stream: MediaStream,
  ) => Promise<void>;
  #peerConnection?: RTCPeerConnection;

  public constructor(
    sendEvent: (event: Record<string, unknown>) => void,
    onTrack: (
      kind: 'audio' | 'video',
      stream: MediaStream,
    ) => Promise<void>,
  ) {
    this.#sendEvent = sendEvent;
    this.#onTrack = onTrack;
  }

  public async connect(iceServers: RTCIceServer[]): Promise<void> {
    this.close();
    const servers = iceServers.map(server => {
      const originalUrls = Array.isArray(server.urls)
        ? server.urls
        : [server.urls];
      const urls = [...originalUrls];
      for (const url of originalUrls) {
        if (
          typeof url === 'string' &&
          url.startsWith('turn:') &&
          !url.includes('transport=tcp')
        ) {
          const tcpUrl = `${(url.split('?')[0] ?? url).replace(/:3478$/, ':443')}?transport=tcp`;
          if (!urls.includes(tcpUrl)) {
            urls.push(tcpUrl);
          }
        }
      }
      return { ...server, urls };
    });

    const peerConnection = new RTCPeerConnection({ iceServers: servers });
    this.#peerConnection = peerConnection;
    peerConnection.ontrack = event => {
      const stream = event.streams.at(0);
      if (
        stream &&
        (event.track.kind === 'audio' || event.track.kind === 'video')
      ) {
        void this.#onTrack(event.track.kind, stream);
      }
    };
    peerConnection.addTransceiver('video', { direction: 'sendrecv' });
    peerConnection.addTransceiver('audio', { direction: 'sendrecv' });
    peerConnection.createDataChannel('eventChannel');

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    await this.#waitForIceGathering(peerConnection);
    if (!peerConnection.localDescription) {
      throw new Error('Avatar SDP offer was not created.');
    }

    const clientSdp = btoa(
      JSON.stringify({
        type: peerConnection.localDescription.type,
        sdp: peerConnection.localDescription.sdp,
      }),
    );
    this.#sendEvent({
      type: 'session.avatar.connect',
      client_sdp: clientSdp,
    });
  }

  public async applyServerSdp(serverSdp: string): Promise<void> {
    if (!this.#peerConnection) {
      throw new Error('Avatar peer connection is unavailable.');
    }
    const description = JSON.parse(
      atob(serverSdp),
    ) as RTCSessionDescriptionInit;
    await this.#peerConnection.setRemoteDescription(description);
  }

  public close(): void {
    this.#peerConnection?.close();
    this.#peerConnection = undefined;
  }

  async #waitForIceGathering(
    peerConnection: RTCPeerConnection,
  ): Promise<void> {
    if (peerConnection.iceGatheringState === 'complete') {
      return;
    }
    await Promise.race([
      new Promise<void>(resolve => {
        const handleChange = () => {
          if (peerConnection.iceGatheringState === 'complete') {
            peerConnection.removeEventListener(
              'icegatheringstatechange',
              handleChange,
            );
            resolve();
          }
        };
        peerConnection.addEventListener(
          'icegatheringstatechange',
          handleChange,
        );
      }),
      new Promise<void>(resolve => window.setTimeout(resolve, 2_000)),
    ]);
  }
}
