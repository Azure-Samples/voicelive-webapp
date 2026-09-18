# Foundry Meeting Tools

This reusable Azure Functions template keeps meeting business logic out of the
Teams media accelerator. A Foundry Voice-First Agent attaches `openapi.json`
as an OpenAPI tool and remains the only reasoning runtime.

## Responsibilities

- Customizable deterministic group-meeting confidentiality and PII filtering.
- Conflict-aware Microsoft Graph calendar booking.
- Transcript ingestion and precise meeting recap data.
- Automatic extractive summary finalization when the meeting bridge closes.
- Out-of-office catch-up orchestration guidance.
- Web PubSub commands for Teams hand raise and lower hand.
- Persisted create, status, and cancel APIs for an unattended media host.

The ACS bridge still owns only real-time mechanics that cannot be delegated to
an HTTP tool: audio/video transport, barge-in, floor safety, and executing the
generic hand control command on the active Teams call.

`tools/meeting-recap` returns the stored transcript and identifies records
that address or mention the executive. `tools/meeting-summary` returns the
finalized extractive summary generated when the meeting bridge closes.

## Foundry tool setup

After deployment, attach:

```text
https://<function-app>.azurewebsites.net/api/openapi.json
```

Configure API-key authentication with the Functions host key in the
`x-functions-key` header.

Use the ready-to-copy [`agent-instructions.md`](agent-instructions.md)
template.

## Required settings

- `AzureWebJobsStorage`
- `WEB_PUBSUB_CONNECTION_STRING`
- `WEB_PUBSUB_HUB` (default `meeting-control`)
- `EXECUTIVE_PROFILES_BASE64`

Optional unattended-host settings:

- `UNATTENDED_MEDIA_HOST_BASE_URL`
- `UNATTENDED_MEDIA_HOST_KEY`

The decoded profile value must contain exactly one profile:

```json
[
  {
    "id": "executive-1",
    "ownerName": "Executive",
    "ownerUserId": "user@contoso.com",
    "confidentialTerms": ["internal initiative"],
    "sensitiveProjects": ["project codename"]
  }
]
```

Deploy one Function App per executive. The Function key authorizes all
operations in that deployment, so sharing one Function App across executive
profiles would allow caller-selected cross-profile actions.

The Function App managed identity needs Microsoft Graph application permission
`Calendars.ReadWrite` with tenant admin consent before calendar writes work.

## Deploy

Deploy the Azure resources into a resource group:

```powershell
az deployment group create `
  --resource-group <resource-group> `
  --template-file infra\main.bicep `
  --parameters executiveProfilesBase64='<base64-json-array>'
```

Validate the project, create a source deployment archive, and let the Function
App perform the production build:

```powershell
pnpm install --frozen-lockfile
pnpm test
pnpm run build
Compress-Archive `
  -Path host.json,package.json,pnpm-lock.yaml,tsconfig.json,src `
  -DestinationPath foundry-meeting-tools.zip `
  -Force

az functionapp deployment source config-zip `
  --resource-group <resource-group> `
  --name <function-app-name> `
  --src foundry-meeting-tools.zip `
  --build-remote true
```

After deployment:

1. Open `https://<function-app>.azurewebsites.net/api/health`.
2. Retrieve a Function host key without placing it in source control.
3. Attach `/api/openapi.json` to the Foundry agent with API-key authentication
   in the `x-functions-key` header.
4. Configure the Teams delegate with the Function base URL and host key.

Do not publish Function keys, storage connection strings, profile data, or
Microsoft Graph tokens.

## Unattended delegation API

When the media-host settings are configured, create a delegate:

```http
POST /api/delegations
x-functions-key: <function-key>
Content-Type: application/json

{
  "clientRequestId": "customer-meeting-20260918",
  "profileId": "executive-1",
  "meetingJoinUrl": "https://teams.microsoft.com/l/meetup-join/...",
  "meetingBrief": "Represent the executive and capture follow-up actions."
}
```

The response includes the deterministic delegation `id`, status, and media
host call ID. Repeating the same `clientRequestId` for the profile returns the
existing record instead of joining twice.

```http
GET /api/delegations/{id}
DELETE /api/delegations/{id}
```

The configured media host implements:

```text
POST   /api/calls
DELETE /api/calls/{callId}
header x-media-host-key
```

The API orchestrator and media host are separate so the existing Linux
Function App remains independent of the Windows application-hosted media
process required by Microsoft Teams.

The included disclosure rules are a conservative starter baseline, not a
replacement for organizational DLP, sensitivity labels, or a comprehensive
PII service. Extend the configured confidential terms and integrate the
customer's approved data-protection controls before production use.
