# Foundry Voice Agent Teams Delegate

This standalone accelerator turns an existing Microsoft Foundry Voice-First
Agent into a browser-hosted participant in a Microsoft Teams meeting.

The Foundry agent remains the only agent runtime. This code does not copy or
override the agent's model, instructions, voice, avatar, tools, knowledge,
Work IQ connections, safety settings, conversation storage, tracing, or
evaluation configuration.

## Architecture

```text
Teams meeting
    <-> ACS Calling SDK in the browser
    <-> same-origin Node.js security proxy
    <-> existing Foundry Voice-First Agent
    <-> avatar WebRTC audio/video
```

The browser receives only a short-lived ACS `voip` token. The backend owns the
ACS connection string and obtains a Foundry bearer token with
`DefaultAzureCredential`. The browser cannot choose an arbitrary Foundry URL,
change the agent configuration, or access another executive's profile.

## What is implemented

- Join a Teams meeting with an ACS communication identity.
- Capture the mixed incoming meeting audio and resample it to 24-kHz PCM16.
- Stream meeting audio to an existing Foundry Voice-First Agent.
- Route agent response audio into the ACS outgoing audio stream.
- Establish the agent avatar WebRTC session.
- Draw avatar video into a stable canvas-backed ACS outgoing video stream.
- Inject a per-session meeting brief with `x-ms-voice-structured-inputs`.
- Isolate executive profiles by agent name, project endpoint, and Entra user
  allowlist.
- Reject browser `session.update` events so agent-owned settings remain the
  source of truth.

## Prerequisites

1. Node.js 22 or later.
2. An Azure Communication Services resource with Teams interoperability.
3. An existing Foundry Voice-First Agent with voice and avatar configured.
4. Conversation storage, knowledge, Work IQ, tools, guardrails, tracing, and
   evaluation configured on that agent as required.
5. The backend identity assigned **Foundry User** on the Foundry resource.
6. A Teams meeting policy that allows the ACS participant to join and publish
   audio/video.
7. A single-tenant Microsoft Entra application and client secret for
   Container Apps built-in authentication.

The browser raw-media path is suitable for a customer PoC and requires the tab
to remain open. A fully unattended production meeting participant requires a
Microsoft Graph application-hosted media bot on supported Windows Server
infrastructure; that is a different host adapter, while the Foundry agent and
security boundary can remain the same.

## Configure profiles

Copy `.env.example` to `.env`. `EXECUTIVE_PROFILES_JSON` is a JSON array:

```json
[
  {
    "id": "executive-1",
    "displayName": "CTO delegate",
    "projectEndpoint": "https://resource.services.ai.azure.com/api/projects/project",
    "agentName": "executive-meeting-delegate",
    "owner": "Executive",
    "persona": "Represent the owner accurately and follow meeting etiquette.",
    "structuredInputsEnabled": true,
    "allowedUserIds": ["entra-object-id"]
  }
]
```

Use a separate agent/profile for each executive. Do not reuse knowledge,
Work IQ connections, conversation stores, or allowed identities across
executives until those isolation boundaries have been explicitly reviewed.

Set `structuredInputsEnabled` only when the agent declares compatible
structured inputs for `owner`, `persona`, and `brief`. The proxy omits the
preview header otherwise; sending it to an agent without that schema can cause
the Voice-First WebSocket handshake to be rejected.

For Azure hosting, encode the JSON as base64 and set
`EXECUTIVE_PROFILES_BASE64`. The server prefers the base64 value when both
variables are present; this avoids shell and ARM escaping issues.

Set `EXECUTIVE_PROFILES_BASE64` in the azd environment before running
`azd up`.

Also set `ENTRA_CLIENT_ID`, `ENTRA_TENANT_ID`, and `ENTRA_CLIENT_SECRET` in
the azd environment. Do not commit these values.

## Run locally

```powershell
Copy-Item .env.example .env
npm install
npm run dev
```

Open `http://localhost:5173`. Local development uses `DEV_USER_ID`; production
does not.

## Deploy the PoC host

The included `azure.yaml`, Bicep, and Dockerfile deploy the browser and proxy
to Azure Container Apps and provision Azure Communication Services.

```powershell
azd auth login
azd up
```

After deployment:

1. Add
   `https://<container-app-host>/.auth/login/aad/callback` as a Web redirect
   URI on the Entra application. The deployment enables authentication and
   blocks unauthenticated access before this redirect is configured.
2. Add the deployed managed identity as **Foundry User** on the Foundry
   resource.
3. Confirm `EXECUTIVE_PROFILES_BASE64` contains production Entra object IDs.
4. Remove `DEV_USER_ID`.

The application fails closed when no authenticated principal is supplied.

## Optional meeting tools

The sibling [`../meeting-tools-function`](../meeting-tools-function) template
adds deterministic disclosure filtering, transcript-backed recaps, calendar
booking, out-of-office guidance, and Web PubSub hand controls. Deploy it, set
`MEETING_TOOLS_BASE_URL` and `MEETING_TOOLS_FUNCTION_KEY` on this host, and
attach its OpenAPI document to the Foundry agent.

## Security notes

- Never put an ACS connection string, Foundry key, or Foundry bearer token in
  browser code.
- Keep the profile allowlist populated in production.
- The proxy constructs and validates the Foundry URL from server-side profile
  configuration and only permits the expected `*.services.ai.azure.com`
  project endpoint.
- Meeting briefs are limited to 4,000 characters and are sent only as the
  initial structured-input header.
- Use one profile and one agent per executive for the first deployment.
- Treat meeting audio, transcripts, and stored conversations according to the
  customer's retention and privacy policies.

## Current preview dependencies

This template uses the Voice-First Agent endpoint:

```text
wss://<resource>.services.ai.azure.com/api/projects/<project>/agents/<agent>/endpoint/protocols/voice
```

with API version `2025-11-15-preview` and the
`VoiceAgents=V1Preview` feature header. Avatar and ACS raw-media capabilities
are preview features and should be revalidated before production use.
