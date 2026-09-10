import { describe, expect, it } from 'vitest';

import {
  buildVoiceAgentUrl,
  parseConfigureMessage,
  parseTextMessage,
} from './foundryProxy.js';

const profile = {
  id: 'cto',
  displayName: 'CTO',
  projectEndpoint:
    'https://resource.services.ai.azure.com/api/projects/project',
  agentName: 'cto agent',
  owner: 'CTO',
  persona: 'Delegate',
  structuredInputsEnabled: false,
  allowedUserIds: ['allowed-user'],
};

describe('Foundry proxy policy', () => {
  it('builds the direct existing-agent voice endpoint', () => {
    const url = buildVoiceAgentUrl(profile);
    expect(url.protocol).toBe('wss:');
    expect(url.pathname).toBe(
      '/api/projects/project/agents/cto%20agent/endpoint/protocols/voice',
    );
    expect(url.searchParams.get('api-version')).toBe('2025-11-15-preview');
    expect(url.searchParams.get('agent_session_id')).toMatch(
      /^teams-delegate-/,
    );
  });

  it('limits the meeting brief', () => {
    expect(
      parseConfigureMessage({
        type: 'bridge.configure',
        meetingBrief: 'Quarterly strategy review',
        sessionId: 'meeting-session-1',
      }).meetingBrief,
    ).toBe('Quarterly strategy review');
    expect(() =>
      parseConfigureMessage({
        type: 'bridge.configure',
        meetingBrief: 'x'.repeat(4_001),
        sessionId: 'meeting-session-1',
      }),
    ).toThrow('at most 4,000');
  });

  it('accepts bounded user text and rejects empty messages', () => {
    expect(
      parseTextMessage({
        type: 'bridge.text',
        text: '  What is on my calendar?  ',
      }),
    ).toEqual({
      type: 'bridge.text',
      text: 'What is on my calendar?',
    });
    expect(() =>
      parseTextMessage({ type: 'bridge.text', text: '   ' }),
    ).toThrow('cannot be empty');
  });
});
