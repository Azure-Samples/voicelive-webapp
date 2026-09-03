import type { ExecutiveProfile } from './types.js';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function parseProfiles(): ExecutiveProfile[] {
  const encoded = required('EXECUTIVE_PROFILES_BASE64');
  const parsed = JSON.parse(
    Buffer.from(encoded, 'base64').toString('utf8'),
  ) as unknown;
  if (!Array.isArray(parsed) || parsed.length !== 1) {
    throw new Error(
      'EXECUTIVE_PROFILES_BASE64 must contain exactly one profile.',
    );
  }
  return parsed.map((candidate, index) => {
    if (!candidate || typeof candidate !== 'object') {
      throw new Error(`Profile ${index} is invalid.`);
    }
    const profile = candidate as Partial<ExecutiveProfile>;
    for (const field of ['id', 'ownerName', 'ownerUserId'] as const) {
      if (!profile[field]?.trim()) {
        throw new Error(`Profile ${index}.${field} is required.`);
      }
    }
    return {
      id: profile.id!.trim(),
      ownerName: profile.ownerName!.trim(),
      ownerUserId: profile.ownerUserId!.trim(),
      confidentialTerms: profile.confidentialTerms ?? [],
      sensitiveProjects: profile.sensitiveProjects ?? [],
    };
  });
}

export const config = {
  profiles: parseProfiles(),
  storageConnectionString: required('AzureWebJobsStorage'),
  webPubSubConnectionString: required('WEB_PUBSUB_CONNECTION_STRING'),
  webPubSubHub: process.env.WEB_PUBSUB_HUB?.trim() || 'meeting-control',
};

export function getProfile(profileId: string): ExecutiveProfile {
  const profile = config.profiles.find(candidate => candidate.id === profileId);
  if (!profile) {
    throw new Error('The executive profile is unavailable.');
  }
  return profile;
}
