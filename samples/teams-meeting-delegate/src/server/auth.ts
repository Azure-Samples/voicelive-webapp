import type { IncomingHttpHeaders } from 'node:http';

interface EasyAuthPrincipal {
  userId?: string;
  userDetails?: string;
}

function firstHeaderValue(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function resolveAuthenticatedUserId(
  headers: IncomingHttpHeaders,
  devUserId?: string,
): string {
  const principalId = firstHeaderValue(
    headers['x-ms-client-principal-id'],
  )?.trim();
  if (principalId) {
    return principalId;
  }

  const encodedPrincipal = firstHeaderValue(
    headers['x-ms-client-principal'],
  )?.trim();
  if (encodedPrincipal) {
    try {
      const principal = JSON.parse(
        Buffer.from(encodedPrincipal, 'base64').toString('utf8'),
      ) as EasyAuthPrincipal;
      if (principal.userId?.trim()) {
        return principal.userId.trim();
      }
    } catch {
      throw new Error('The authenticated principal header is invalid.');
    }
  }

  if (devUserId) {
    return devUserId;
  }

  throw new Error('Authentication is required.');
}
