export interface ExecutiveProfile {
  id: string;
  displayName: string;
  projectEndpoint: string;
  agentName: string;
  owner: string;
  persona: string;
  structuredInputsEnabled: boolean;
  allowedUserIds: string[];
}

export interface AppConfig {
  port: number;
  nodeEnv: string;
  acsConnectionString: string;
  devUserId?: string;
  meetingToolsBaseUrl?: string;
  meetingToolsFunctionKey?: string;
  profiles: ExecutiveProfile[];
}

const FOUNDRY_HOST_PATTERN = /^[\da-z-]+\.services\.ai\.azure\.com$/i;
const PROJECT_PATH_PATTERN = /^\/api\/projects\/[^/]+$/;

function requiredEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseProfiles(rawProfiles: string): ExecutiveProfile[] {
  let value: unknown;
  try {
    value = JSON.parse(rawProfiles);
  } catch {
    throw new Error('EXECUTIVE_PROFILES_JSON must contain valid JSON.');
  }

  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('EXECUTIVE_PROFILES_JSON must contain at least one profile.');
  }

  const profiles = value.map((candidate, index) => {
    if (!candidate || typeof candidate !== 'object') {
      throw new Error(`Executive profile ${index} must be an object.`);
    }

    const profile = candidate as Record<string, unknown>;
    const stringField = (name: string): string => {
      const fieldValue = profile[name];
      if (typeof fieldValue !== 'string' || !fieldValue.trim()) {
        throw new Error(`Executive profile ${index} requires ${name}.`);
      }
      return fieldValue.trim();
    };

    const allowedUserIds = profile.allowedUserIds;
    if (
      !Array.isArray(allowedUserIds) ||
      allowedUserIds.length === 0 ||
      !allowedUserIds.every(
        userId => typeof userId === 'string' && userId.trim().length > 0,
      )
    ) {
      throw new Error(
        `Executive profile ${index} requires a non-empty allowedUserIds array.`,
      );
    }

    const projectEndpoint = stringField('projectEndpoint');
    validateProjectEndpoint(projectEndpoint);

    return {
      id: stringField('id'),
      displayName: stringField('displayName'),
      projectEndpoint,
      agentName: stringField('agentName'),
      owner: stringField('owner'),
      persona: stringField('persona'),
      structuredInputsEnabled: profile.structuredInputsEnabled === true,
      allowedUserIds: allowedUserIds.map(userId => userId.trim()),
    };
  });

  if (new Set(profiles.map(profile => profile.id)).size !== profiles.length) {
    throw new Error('Executive profile IDs must be unique.');
  }

  return profiles;
}

export function validateProjectEndpoint(rawEndpoint: string): URL {
  let endpoint: URL;
  try {
    endpoint = new URL(rawEndpoint);
  } catch {
    throw new Error('A Foundry project endpoint is invalid.');
  }

  if (
    endpoint.protocol !== 'https:' ||
    endpoint.username ||
    endpoint.password ||
    !FOUNDRY_HOST_PATTERN.test(endpoint.hostname) ||
    !PROJECT_PATH_PATTERN.test(endpoint.pathname.replace(/\/$/, '')) ||
    endpoint.search ||
    endpoint.hash
  ) {
    throw new Error(
      'Foundry project endpoints must use https://<resource>.services.ai.azure.com/api/projects/<project>.',
    );
  }

  endpoint.pathname = endpoint.pathname.replace(/\/$/, '');
  return endpoint;
}

export function loadConfig(): AppConfig {
  const nodeEnv = process.env.NODE_ENV?.trim() || 'production';
  const rawPort = process.env.PORT?.trim() || '3000';
  const port = Number.parseInt(rawPort, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be a valid TCP port.');
  }

  const encodedProfiles = process.env.EXECUTIVE_PROFILES_BASE64?.trim();
  const rawProfiles = encodedProfiles
    ? Buffer.from(encodedProfiles, 'base64').toString('utf8')
    : requiredEnvironmentVariable('EXECUTIVE_PROFILES_JSON');

  return {
    port,
    nodeEnv,
    acsConnectionString: requiredEnvironmentVariable('ACS_CONNECTION_STRING'),
    devUserId:
      nodeEnv === 'development'
        ? process.env.DEV_USER_ID?.trim() || undefined
        : undefined,
    meetingToolsBaseUrl:
      process.env.MEETING_TOOLS_BASE_URL?.trim().replace(/\/$/, '') ||
      undefined,
    meetingToolsFunctionKey:
      process.env.MEETING_TOOLS_FUNCTION_KEY?.trim() || undefined,
    profiles: parseProfiles(rawProfiles),
  };
}

export function findAuthorizedProfile(
  profiles: ExecutiveProfile[],
  profileId: string,
  userId: string,
): ExecutiveProfile {
  const profile = profiles.find(candidate => candidate.id === profileId);
  if (!profile || !profile.allowedUserIds.includes(userId)) {
    throw new Error('The executive profile is unavailable.');
  }
  return profile;
}
