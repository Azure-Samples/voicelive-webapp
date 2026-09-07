import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  findAuthorizedProfile,
  loadConfig,
  validateProjectEndpoint,
} from './config.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('configuration', () => {
  it('accepts only Foundry project endpoints', () => {
    expect(
      validateProjectEndpoint(
        'https://resource.services.ai.azure.com/api/projects/project',
      ).hostname,
    ).toBe('resource.services.ai.azure.com');
    expect(() =>
      validateProjectEndpoint('https://example.com/api/projects/project'),
    ).toThrow('Foundry project endpoints');
  });

  it('isolates profiles by allowed user ID', () => {
    const profile = {
      id: 'cto',
      displayName: 'CTO',
      projectEndpoint:
        'https://resource.services.ai.azure.com/api/projects/project',
      agentName: 'cto-agent',
      owner: 'CTO',
      persona: 'Delegate',
      structuredInputsEnabled: false,
      allowedUserIds: ['allowed-user'],
    };
    expect(
      findAuthorizedProfile([profile], 'cto', 'allowed-user').agentName,
    ).toBe('cto-agent');
    expect(() =>
      findAuthorizedProfile([profile], 'cto', 'different-user'),
    ).toThrow('unavailable');
  });

  it('does not enable development identity in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('PORT', '3000');
    vi.stubEnv('ACS_CONNECTION_STRING', 'endpoint=https://acs;accesskey=secret');
    vi.stubEnv('DEV_USER_ID', 'local-developer');
    vi.stubEnv(
      'EXECUTIVE_PROFILES_JSON',
      JSON.stringify([
        {
          id: 'cto',
          displayName: 'CTO',
          projectEndpoint:
            'https://resource.services.ai.azure.com/api/projects/project',
          agentName: 'cto-agent',
          owner: 'CTO',
          persona: 'Delegate',
          structuredInputsEnabled: false,
          allowedUserIds: ['allowed-user'],
        },
      ]),
    );

    expect(loadConfig().devUserId).toBeUndefined();
  });

  it('loads base64 profile configuration for Azure hosting', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ACS_CONNECTION_STRING', 'endpoint=https://acs;accesskey=secret');
    vi.stubEnv(
      'EXECUTIVE_PROFILES_BASE64',
      Buffer.from(
        JSON.stringify([
          {
            id: 'cto',
            displayName: 'CTO',
            projectEndpoint:
              'https://resource.services.ai.azure.com/api/projects/project',
            agentName: 'cto-agent',
            owner: 'CTO',
            persona: 'Delegate',
            structuredInputsEnabled: false,
            allowedUserIds: ['allowed-user'],
          },
        ]),
      ).toString('base64'),
    );

    expect(loadConfig().profiles[0]?.agentName).toBe('cto-agent');
  });
});
