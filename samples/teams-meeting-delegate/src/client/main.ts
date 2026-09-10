import type { PublicExecutiveProfile } from '../shared/protocol';

import { AcsMeetingBridge } from './acsMeetingBridge';
import { PcmCapture } from './audio';
import { FoundryVoiceSession } from './foundryVoiceSession';
import { MediaBridge } from './mediaBridge';
import './styles.css';

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing page element: ${id}`);
  }
  return element as T;
}

const form = requiredElement<HTMLFormElement>('join-form');
const profileSelect = requiredElement<HTMLSelectElement>('profile');
const meetingLinkInput =
  requiredElement<HTMLInputElement>('meeting-link');
const meetingBriefInput =
  requiredElement<HTMLTextAreaElement>('meeting-brief');
const joinButton = requiredElement<HTMLButtonElement>('join-button');
const leaveButton = requiredElement<HTMLButtonElement>('leave-button');
const teamsStatus = requiredElement<HTMLElement>('teams-status');
const agentStatus = requiredElement<HTMLElement>('agent-status');
const avatarStatus = requiredElement<HTMLElement>('avatar-status');
const transcript = requiredElement<HTMLOListElement>('transcript');
const errorMessage = requiredElement<HTMLParagraphElement>('error');
const canvas = requiredElement<HTMLCanvasElement>('avatar-canvas');

let acsBridge: AcsMeetingBridge | undefined;
let voiceSession: FoundryVoiceSession | undefined;
let mediaBridge: MediaBridge | undefined;
let pcmCapture: PcmCapture | undefined;
let meetingSessionId: string | undefined;

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
  const response = await fetch('/api/profiles');
  if (response.status === 401) {
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
        : 'Could not load executive profiles.',
    );
  }
  if (body.length === 0) {
    throw new Error('No executive profiles are assigned to this user.');
  }
  for (const profile of body) {
    const option = document.createElement('option');
    option.value = profile.id;
    option.textContent = profile.displayName;
    profileSelect.append(option);
  }
}

async function leave(): Promise<void> {
  joinButton.disabled = true;
  leaveButton.disabled = true;
  await pcmCapture?.stop();
  pcmCapture = undefined;
  voiceSession?.close();
  voiceSession = undefined;
  await acsBridge?.leave();
  acsBridge = undefined;
  meetingSessionId = undefined;
  await mediaBridge?.close();
  mediaBridge = undefined;

  teamsStatus.textContent = 'Not connected';
  agentStatus.textContent = 'Not connected';
  avatarStatus.textContent = 'Waiting';
  joinButton.disabled = false;
}

form.addEventListener('submit', event => {
  event.preventDefault();
  void (async () => {
    setError();
    joinButton.disabled = true;
    leaveButton.disabled = false;
    transcript.replaceChildren();

    try {
      meetingSessionId = crypto.randomUUID();
      mediaBridge = new MediaBridge(canvas);
      acsBridge = new AcsMeetingBridge();
      teamsStatus.textContent = 'Joining';
      const remoteMeetingAudio = await acsBridge.join(
        profileSelect.value,
        meetingSessionId,
        meetingLinkInput.value.trim(),
        mediaBridge,
        state => {
          teamsStatus.textContent = state || 'Unknown';
        },
      );

      voiceSession = new FoundryVoiceSession({
        profileId: profileSelect.value,
        sessionId: meetingSessionId,
        meetingBrief: meetingBriefInput.value.trim(),
        onStatus: status => {
          agentStatus.textContent = status;
        },
        onAvatarStatus: status => {
          avatarStatus.textContent = status;
        },
        onAudio: pcm => mediaBridge?.playPcm(pcm) ?? Promise.resolve(),
        onInterruption: () => mediaBridge?.clearPlayback(),
        onAvatarTrack: async (kind, stream) => {
          await mediaBridge?.attachAvatarTrack(kind, stream);
          if (kind === 'video') {
            avatarStatus.textContent = 'Streaming';
          }
        },
        onTranscript: addTranscript,
      });
      await voiceSession.connect();

      pcmCapture = new PcmCapture(mediaBridge.audioContext);
      await pcmCapture.start(remoteMeetingAudio, chunk => {
        voiceSession?.sendAudio(chunk);
      });
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Could not start the delegate.',
      );
      await leave();
    }
  })();
});

leaveButton.addEventListener('click', () => {
  void leave();
});

window.addEventListener('beforeunload', () => {
  voiceSession?.close();
  void acsBridge?.leave();
});

void loadProfiles().catch(error => {
  setError(error instanceof Error ? error.message : 'Could not load profiles.');
  joinButton.disabled = true;
});
