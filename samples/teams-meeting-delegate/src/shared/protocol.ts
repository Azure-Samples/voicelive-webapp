export interface PublicExecutiveProfile {
  id: string;
  displayName: string;
}

export interface AcsTokenResponse {
  token: string;
  userId: string;
  expiresOn: string;
  displayName: string;
}

export interface BridgeConfigureMessage {
  type: 'bridge.configure';
  meetingBrief: string;
  sessionId: string;
}

export interface BridgeReadyMessage {
  type: 'bridge.ready';
}

export interface BridgeTextMessage {
  type: 'bridge.text';
  text: string;
}

export interface BridgeErrorMessage {
  type: 'bridge.error';
  message: string;
}

export type BridgeServerMessage = BridgeReadyMessage | BridgeErrorMessage;

export const ALLOWED_BROWSER_EVENT_TYPES = new Set([
  'input_audio_buffer.append',
  'input_audio_buffer.clear',
  'response.cancel',
  'response.create',
  'session.avatar.connect',
]);
