# Teams personal app package

This package exposes `personal.html` as a Microsoft Teams personal app. It is
the direct, private interaction surface from the AURA hackathon pattern:

```text
Teams personal tab
    -> Teams SSO token
    -> same-origin security proxy
    -> existing Microsoft Foundry Voice-First Agent
    -> voice, text, tools, and avatar
```

1. Deploy the host and record its HTTPS hostname.
2. Configure the Entra application ID URI as
   `api://<APP_HOST>/<ENTRA_CLIENT_ID>`.
3. Add the Teams desktop/mobile and Teams web clients as authorized client
   applications for the exposed scope.
4. Replace the `${...}` values in `manifest.template.json`.
5. Add a 192x192 `color.png` and a 32x32 transparent `outline.png`.
6. Zip `manifest.json`, `color.png`, and `outline.png`, then upload the
   package through **Teams > Apps > Manage your apps > Upload an app**.

The content URL includes `inTeams=1`. That tells the page to initialize
TeamsJS and obtain a Teams SSO token. The token is sent only over HTTPS to
create a one-time, 60-second WebSocket ticket; it is never placed in a
WebSocket URL or browser log.

The included Container Apps template intentionally runs one replica because
the PoC ticket store is process-local. Replace it with a shared atomic store
such as Azure Managed Redis before increasing the replica count.

For the app registration and authorized client IDs, follow
[Microsoft Teams tab SSO](https://learn.microsoft.com/microsoftteams/platform/tabs/how-to/authentication/tab-sso-register-aad).
