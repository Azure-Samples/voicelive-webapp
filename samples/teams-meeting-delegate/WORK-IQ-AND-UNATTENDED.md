# Work IQ and unattended meeting participation

This document describes the supported design for two extensions to the
browser-hosted meeting delegate:

1. ground an executive's delegate in that executive's Microsoft 365 context
   through Microsoft Work IQ; and
2. start the delegate through an API without keeping an authenticated browser
   page open.

These extensions have different identity requirements. Work IQ is delegated
to a user. Unattended Teams meeting participation is performed by an
application-hosted media bot.

## Customer questions and direct answers

### Can the delegate produce a meeting summary?

**Yes for an extractive summary.** The optional `meeting-tools-function`
stores transcript events and automatically finalizes a transcript-backed
summary when the meeting bridge closes. It captures overview statements,
decisions, action items, open questions, and executive mentions. Generative
summary rewriting and external delivery remain optional follow-on work.

### Can we link Work IQ for a selected user to the agent?

**Yes, with a delegated connection that the selected user authorizes.** Work
IQ does not support application-only authentication, and the application
cannot choose a user ID and impersonate that person. For the initial customer
deployment, configure one executive profile, one Foundry agent, and one
executive-authorized Work IQ connection per selected user. The profile
selector chooses that preconfigured boundary.

### Can an API start the delegate and join a meeting without a user keeping the page open?

**Not with the current browser-hosted ACS implementation.** Its Teams media
session exists in the browser, so closing the page ends the delegate. A truly
unattended implementation requires a Microsoft Graph application-hosted media
bot running on supported Azure Windows Server infrastructure. The recommended
command API and worker lifecycle are described in
[Start the delegate without an open page](#start-the-delegate-without-an-open-page).

## Capability status

| Capability | Current sample | Recommended extension |
| --- | --- | --- |
| Join a meeting | Authenticated browser and ACS Calling SDK | Microsoft Graph application-hosted media bot |
| Start through an API | Not supported; the browser owns the media session | Durable command API and worker on the media-bot host |
| Work IQ grounding | Configure the connection on the selected profile's Foundry agent | One agent/profile and delegated Work IQ authorization per executive |
| Meeting recap source | Transcript events are stored by `meeting-tools-function` | Keep as the factual input to a summary workflow |
| Automatic post-meeting summary | Extractive transcript-backed summary is implemented | Add optional generative rewriting and customer-approved delivery |

## Link Work IQ to a selected executive

Work IQ uses Microsoft Entra delegated authentication. Requests run as the
signed-in user, on-behalf-of (OBO) is supported, and application-only
authentication is not supported. Selecting an executive ID in this sample
must therefore select a preconfigured profile; it must not impersonate an
arbitrary user.

Use this isolation model:

```text
executive profile
    -> one Foundry Voice-First Agent
    -> one executive-authorized Work IQ connection
    -> one conversation store and approved tool set
    -> explicit operator allowlist
```

Provisioning each profile requires an interactive authorization step:

1. Enable Work IQ in the executive's tenant.
2. Register the customer application and request the delegated
   `api://workiq.svc.cloud.microsoft/WorkIQAgent.Ask` scope. Tenant admin
   consent is required.
3. Have the executive sign in and authorize the Work IQ connection used by
   that executive's Foundry agent.
4. Put that agent's project endpoint and agent name in the corresponding
   `EXECUTIVE_PROFILES_JSON` entry.
5. Restrict `allowedUserIds` to the people who may operate that delegate.

The runtime profile selector then chooses the already isolated agent and its
connection. It does not pass a user ID to Work IQ. The user context comes from
the delegated access token.

If Work IQ is called through a custom tool instead of a Foundry-managed
connection, the tool must exchange the signed-in user's token through OBO and
call Work IQ with the resulting delegated token. Do not log, place in URLs, or
send Work IQ access tokens to the browser. Token caching must remain
user-partitioned and revocation-aware.

### Unattended limitation

An app-only meeting bot cannot independently acquire Work IQ access for a
selected executive. The initial executive authorization is still required,
and tenant policy or token expiry can require the executive to sign in again.
The meeting bot must continue safely without Work IQ when delegated
authorization is unavailable; it must not fall back to another user's
context.

## Start the delegate without an open page

The existing ACS Calling SDK and raw-media bridge execute in the browser.
Moving the current `/join` logic into the Node.js server does not make it
unattended because the server does not own a Teams media stack.

Use a Microsoft Graph application-hosted media bot for the unattended
adapter. This adapter:

- uses Microsoft Graph application permissions rather than a signed-in user;
- joins the meeting with `POST /communications/calls`;
- uses `Calls.AccessMedia.All` with the appropriate call-join permission;
- is implemented in C#/.NET with
  `Microsoft.Graph.Communications.Calls.Media`;
- runs on supported Windows Server infrastructure in Azure; and
- keeps every live call pinned to the VM instance that created it.

The Foundry Voice-First Agent remains unchanged. Replace only the Teams
transport:

```text
Scheduler or customer service
    -> authenticated delegation command API
    -> durable queue
    -> Windows media-bot worker
    <-> Teams meeting through Microsoft Graph real-time media
    <-> existing Foundry Voice-First Agent
    -> meeting transcript store
```

### Suggested command API

The command API should accept application authentication through Microsoft
Entra ID or a managed identity. Do not expose it with a shared public API key.

```http
POST /api/delegations
Authorization: Bearer <application-token>
Idempotency-Key: <stable-customer-request-id>
Content-Type: application/json

{
  "profileId": "executive-1",
  "meetingJoinUrl": "https://teams.microsoft.com/l/meetup-join/...",
  "scheduledStartTime": "2026-09-18T09:00:00Z",
  "meetingBrief": "Represent the executive during the quarterly review."
}
```

Return `202 Accepted` with a server-generated delegation ID:

```json
{
  "delegationId": "01K5...",
  "status": "scheduled",
  "statusUrl": "/api/delegations/01K5..."
}
```

The minimum lifecycle API is:

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/delegations` | Schedule or immediately start a delegate |
| `GET` | `/api/delegations/{id}` | Read queued, joining, active, completed, or failed status |
| `DELETE` | `/api/delegations/{id}` | Cancel a queued job or end an active call |
| `POST` | `/api/calls/callback` | Receive and validate Microsoft Graph call notifications |

The worker must:

- validate the Teams join URL and map `profileId` only through server-side
  configuration;
- make `Idempotency-Key` unique per caller so retries do not create duplicate
  meeting participants;
- persist jobs and call state in a durable store;
- start early enough to handle lobby admission;
- apply bounded retries with an explicit terminal failure state;
- enforce one call per configured capacity slot;
- drain active calls before VM maintenance;
- correlate the delegation ID, Graph call ID, Foundry session ID, and meeting
  transcript ID; and
- end the Foundry session and media resources when the Teams call terminates.

## Meeting summaries

The sibling `meeting-tools-function` stores transcription events, returns the
authoritative recap source through `tools/meeting-recap`, and writes an
extractive summary through `tools/meeting-summary` when the bridge closes.

For a generative summary and customer delivery, extend the workflow:

1. The media host marks the call completed.
2. The transcript writer flushes all pending events and records a finalized
   timestamp.
3. A durable summary job reads `tools/meeting-summary` and
   `tools/meeting-recap`.
4. The configured Foundry text-capable summarization flow produces decisions,
   action items, open questions, and mentions of the executive.
5. The workflow stores the summary with its transcript references and sends it
   only to the configured destination after policy checks.

Do not summarize partial transcript data on a disconnect callback. Keep the
raw transcript as the source of truth, identify missing intervals, and make
summary generation idempotent so a retry replaces or versions the same
meeting summary instead of sending duplicates.

## References

- [Microsoft Work IQ API](https://learn.microsoft.com/microsoft-365/copilot/extensibility/work-iq/api-overview)
- [Work IQ API permissions](https://learn.microsoft.com/microsoft-365/copilot/extensibility/work-iq/permissions)
- [Create a Microsoft Graph call](https://learn.microsoft.com/graph/api/application-post-calls)
- [Requirements and considerations for application-hosted media bots](https://learn.microsoft.com/microsoftteams/platform/bots/calls-and-meetings/requirements-considerations-application-hosted-media-bots)
