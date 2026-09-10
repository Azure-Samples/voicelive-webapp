import type { PublicExecutiveProfile } from '../shared/protocol';

import { FoundryVoiceSession } from './foundryVoiceSession';
import { PersonalMedia } from './personalMedia';
import { initializeTeamsHost } from './teamsHost';
import './styles.css';

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing page element: ${id}`);
  }
  return element as T;
}

const profileSelect = requiredElement<HTMLSelectElement>('profile');
const contextInput = requiredElement<HTMLTextAreaElement>('conversation-context');
const connectButton = requiredElement<HTMLButtonElement>('connect-button');
const disconnectButton =
  requiredElement<HTMLButtonElement>('disconnect-button');
const agentStatus = requiredElement<HTMLElement>('agent-status');
const microphoneStatus = requiredElement<HTMLElement>('microphone-status');
const avatarStatus = requiredElement<HTMLElement>('avatar-status');
const transcript = requiredElement<HTMLOListElement>('transcript');
const errorMessage = requiredElement<HTMLParagraphElement>('error');
const avatarVideo = requiredElement<HTMLVideoElement>('avatar-video');
const textForm = requiredElement<HTMLFormElement>('text-form');
const textInput = requiredElement<HTMLInputElement>('text-input');
const sendButton = requiredElement<HTMLButtonElement>('send-button');

let authToken: string | undefined;
let isDisconnecting = false;
let media: PersonalMedia | undefined;
let voiceSession: FoundryVoiceSession | undefined;

function authHeaders(): HeadersInit | undefined {
  return authToken ? { Authorization: `Bearer ${authToken}` } : undefined;
}

function setError(message?: string): void {
  errorMessage.hidden = !message;
  errorMessage.textContent = message ?? '';
}

function addTranscript(role: 'You' | 'Agent', text: string): void {
  const item = document.createElement('li');
  const label = document.createElement('strong');
  label.textContent = `${role}: `;
  item.append(label, document.createTextNode(text.trim()));
  transcript.append(item);
  item.scrollIntoView({ block: 'nearest' });
}

async function loadProfiles(): Promise<void> {
  const response = await fetch('/api/profiles', {
    headers: authHeaders(),
  });
  if (response.status === 401 && !authToken) {
    const returnUrl = encodeURIComponent(window.location.href);
    window.location.assign(
      `/.auth/login/aad?post_login_redirect_uri=${returnUrl}`,
    );
    return;
  }
  const body = (await response.json()) as
    | PublicExecutiveProfile[]
    | { error?: string };
  if (!response.ok || !Array.isArray(body)) {
    throw new Error(
      !Array.isArray(body) && body.error
        ? body.error
        : 'Could not load agent profiles.',
    );
  }
  if (body.length === 0) {
    throw new Error('No agent profiles are assigned to this user.');
  }
  for (const profile of body) {
    const option = document.createElement('option');
    option.value = profile.id;
    option.textContent = profile.displayName;
    profileSelect.append(option);
  }
}

async function disconnect(): Promise<void> {
  if (isDisconnecting) {
    return;
  }
  isDisconnecting = true;
  connectButton.disabled = true;
  disconnectButton.disabled = true;
  sendButton.disabled = true;
  try {
    voiceSession?.close();
    voiceSession = undefined;
    await media?.close();
    media = undefined;
    agentStatus.textContent = 'Not connected';
    microphoneStatus.textContent = 'Off';
    avatarStatus.textContent = 'Waiting';
    connectButton.disabled = false;
  } finally {
    isDisconnecting = false;
  }
}

connectButton.addEventListener('click', () => {
  void (async () => {
    setError();
    connectButton.disabled = true;
    disconnectButton.disabled = false;
    transcript.replaceChildren();

    try {
      media = new PersonalMedia(avatarVideo);
      voiceSession = new FoundryVoiceSession({
        authToken,
        profileId: profileSelect.value,
        sessionId: crypto.randomUUID(),
        meetingBrief: contextInput.value.trim(),
        onClose: () => {
          void disconnect();
        },
        onStatus: status => {
          agentStatus.textContent = status;
        },
        onAvatarStatus: status => {
          avatarStatus.textContent = status;
        },
        onAudio: pcm => media?.playPcm(pcm) ?? Promise.resolve(),
        onInterruption: () => media?.clearPlayback(),
        onAvatarTrack: async (kind, stream) => {
          await media?.attachAvatarTrack(kind, stream);
          if (kind === 'video') {
            avatarStatus.textContent = 'Streaming';
          }
        },
        onTranscript: addTranscript,
      });
      await voiceSession.connect();
      await media.startMicrophone(chunk => {
        voiceSession?.sendAudio(chunk);
      });
      microphoneStatus.textContent = 'Listening';
      sendButton.disabled = false;
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Could not connect to the agent.',
      );
      await disconnect();
    }
  })();
});

disconnectButton.addEventListener('click', () => {
  void disconnect();
});

textForm.addEventListener('submit', event => {
  event.preventDefault();
  const text = textInput.value.trim();
  if (!text || !voiceSession) {
    return;
  }
  addTranscript('You', text);
  voiceSession.sendText(text);
  textInput.value = '';
});

window.addEventListener('beforeunload', () => {
  voiceSession?.close();
  void media?.close();
});

void (async () => {
  try {
    const teamsContext = await initializeTeamsHost();
    authToken = teamsContext.authToken;
    if (teamsContext.theme) {
      document.documentElement.dataset.teamsTheme = teamsContext.theme;
    }
    await loadProfiles();
  } catch (error) {
    setError(
      error instanceof Error
        ? error.message
        : 'Could not initialize the Teams agent.',
    );
    connectButton.disabled = true;
  }
})();
