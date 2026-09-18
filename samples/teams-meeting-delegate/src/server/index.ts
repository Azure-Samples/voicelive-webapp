import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';

import { resolveAuthenticatedUserId } from './auth.js';
import { AcsTokenService } from './acsTokenService.js';
import { findAuthorizedProfile, loadConfig } from './config.js';
import { createFoundryProxy } from './foundryProxy.js';
import { MeetingToolsClient } from './meetingToolsClient.js';
import {
  extractBearerToken,
  WorkIqClient,
} from './workIqClient.js';

if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

const config = loadConfig();
const app = express();
const server = createServer(app);
const tokenService = new AcsTokenService(config.acsConnectionString);
const meetingTools = new MeetingToolsClient(config);
const workIq = new WorkIqClient(config.workIq);
const foundryProxy = createFoundryProxy(config, meetingTools);

app.use((_request, response, next) => {
  response.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; connect-src 'self' https: wss:; img-src 'self' data: blob:; media-src 'self' blob:; script-src 'self'; style-src 'self'; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  );
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  next();
});
app.use(express.json({ limit: '16kb' }));
app.use('/api', (request, response, next) => {
  response.on('finish', () => {
    console.log(`${request.method} ${request.path} ${response.statusCode}`);
  });
  next();
});

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok' });
});

app.get('/api/profiles', (request, response) => {
  try {
    const userId = resolveAuthenticatedUserId(
      request.headers,
      config.devUserId,
    );
    response.json(
      config.profiles
        .filter(profile => profile.allowedUserIds.includes(userId))
        .map(profile => ({
          id: profile.id,
          displayName: profile.displayName,
        })),
    );
  } catch (error) {
    response
      .status(401)
      .json({ error: error instanceof Error ? error.message : 'Unauthorized' });
  }
});

app.get('/api/acs/token', async (request, response) => {
  try {
    const userId = resolveAuthenticatedUserId(
      request.headers,
      config.devUserId,
    );
    const profileId =
      typeof request.query.profileId === 'string' ? request.query.profileId : '';
    const profile = findAuthorizedProfile(config.profiles, profileId, userId);
    response.setHeader('Cache-Control', 'no-store');
    response.json(await tokenService.createToken(profile.displayName));
  } catch (error) {
    response.status(403).json({
      error:
        error instanceof Error ? error.message : 'Could not issue ACS token.',
    });
  }
});

app.post('/api/workiq/ask', async (request, response) => {
  try {
    const userId = resolveAuthenticatedUserId(
      request.headers,
      config.devUserId,
    );
    const profileId =
      typeof request.body?.profileId === 'string'
        ? request.body.profileId
        : '';
    findAuthorizedProfile(config.profiles, profileId, userId);
    if (!workIq.configured) {
      response.status(501).json({ error: 'Work IQ is not configured.' });
      return;
    }
    const question =
      typeof request.body?.question === 'string'
        ? request.body.question
        : '';
    const timeZone =
      typeof request.body?.timeZone === 'string'
        ? request.body.timeZone
        : '';
    const timeZoneOffset =
      typeof request.body?.timeZoneOffset === 'number'
        ? request.body.timeZoneOffset
        : Number.NaN;
    const token = extractBearerToken(
      request.headers.authorization,
      config.workIqDevAccessToken,
    );
    response.setHeader('Cache-Control', 'no-store');
    response.json(
      await workIq.ask(token, question, {
        timeZone,
        timeZoneOffset,
      }),
    );
  } catch (error) {
    response.status(403).json({
      error:
        error instanceof Error
          ? error.message
          : 'Could not query Work IQ.',
    });
  }
});

app.get('/api/control/negotiate', async (request, response) => {
  try {
    const userId = resolveAuthenticatedUserId(
      request.headers,
      config.devUserId,
    );
    const profileId =
      typeof request.query.profileId === 'string' ? request.query.profileId : '';
    const sessionId =
      typeof request.query.sessionId === 'string' ? request.query.sessionId : '';
    findAuthorizedProfile(config.profiles, profileId, userId);
    response.setHeader('Cache-Control', 'no-store');
    if (!meetingTools.configured) {
      response.status(204).end();
      return;
    }
    response.json({ url: await meetingTools.negotiate(sessionId) });
  } catch (error) {
    response.status(503).json({
      error:
        error instanceof Error
          ? error.message
          : 'Could not connect the meeting control channel.',
    });
  }
});

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const clientDirectory = join(currentDirectory, '..', '..', 'client');
if (existsSync(clientDirectory)) {
  app.use(express.static(clientDirectory));
  app.get('*path', (_request, response) => {
    response.sendFile(join(clientDirectory, 'index.html'));
  });
}

server.on('upgrade', (request, socket, head) => {
  const requestUrl = new URL(
    request.url ?? '',
    `http://${request.headers.host ?? 'localhost'}`,
  );
  if (requestUrl.pathname !== '/api/voice') {
    socket.destroy();
    return;
  }
  foundryProxy.handleUpgrade(request, socket, head);
});

server.listen(config.port, () => {
  console.log(`Teams delegate host listening on port ${config.port}.`);
});
