import { app, authentication } from '@microsoft/teams-js';

export interface TeamsHostContext {
  authToken?: string;
  theme?: string;
}

export async function initializeTeamsHost(): Promise<TeamsHostContext> {
  const isTeamsHost =
    new URLSearchParams(window.location.search).get('inTeams') === '1';
  if (!isTeamsHost) {
    return {};
  }

  await app.initialize();
  const [context, authToken] = await Promise.all([
    app.getContext(),
    authentication.getAuthToken(),
  ]);
  return {
    authToken,
    theme: context.app.theme,
  };
}
