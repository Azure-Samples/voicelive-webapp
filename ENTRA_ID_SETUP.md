# Microsoft Entra ID Authentication Setup Guide

This guide will help you configure Microsoft Entra ID (Azure AD) authentication for the Voice Live Agent application.

## Prerequisites

1. An Azure subscription
2. An Azure AI Foundry resource
3. Administrative access to create Azure AD app registrations

## Step 1: Create an Azure AD App Registration

1. Navigate to the [Azure Portal](https://portal.azure.com)
2. Go to **Azure Active Directory** > **App registrations**
3. Click **New registration**
4. Configure the registration:
   - **Name**: `Voice Live Agent` (or your preferred name)
   - **Supported account types**: Choose based on your needs:
     - **Accounts in this organizational directory only**: Single tenant
     - **Accounts in any organizational directory**: Multi-tenant
     - **Accounts in any organizational directory and personal Microsoft accounts**: Multi-tenant + personal accounts
   - **Redirect URI**: 
     - Platform: **Single-page application (SPA)**
     - URI: `http://localhost:5173` (for development) or your production URL

## Step 2: Configure API Permissions

1. In your app registration, go to **API permissions**
2. Click **Add a permission**
3. Select **APIs my organization uses** and search for **Cognitive Services**
4. Select **Azure Cognitive Services**
5. Choose **Delegated permissions**
6. Select the **user_impersonation** permission
7. Click **Add permissions**
8. Click **Grant admin consent** (if you have admin rights)

## Step 3: Update Application Configuration

1. In your app registration, go to **Overview**
2. Copy the **Application (client) ID**
3. Update the configuration in `src/utils/authService.js`:

```javascript
const msalConfig = {
  auth: {
    clientId: 'YOUR_CLIENT_ID_HERE', // Replace with your client ID
    authority: 'https://login.microsoftonline.com/YOUR_TENANT_ID', // Replace with your tenant ID or use 'common'
    redirectUri: window.location.origin,
  },
  // ... rest of the configuration
};
```

4. Update the authentication method in `src/config.js`:

```javascript
auth: {
  method: 'entraId', // Set to 'entraId' to use Azure AD authentication
  entraId: {
    enabled: true,
    requireAuth: true, // Set to false if you want to allow anonymous access
    signInMethod: 'popup', // 'popup' or 'redirect'
  },
},
```

## Step 4: Configure Azure AI Foundry Resource Permissions

Ensure your Azure AI Foundry resource is configured to accept tokens from your Azure AD tenant:

1. In the Azure portal, navigate to your Azure AI Foundry resource
2. Go to **Access control (IAM)**
3. Add role assignments for users who need access:
   - **Cognitive Services User**: For standard access
   - **Cognitive Services Contributor**: For broader access

## Step 5: Test the Configuration

1. Start your development server:
   ```bash
   npm run dev
   ```

2. Open the application in your browser
3. You should see a sign-in prompt
4. Sign in with a Microsoft account that has access to your Azure AI Foundry resource
5. Verify that the Voice Live Agent connects successfully

## Troubleshooting

### Common Issues

1. **CORS Errors**: Ensure your redirect URI is correctly configured in the app registration
2. **Permission Errors**: Verify that API permissions are granted and admin consent is provided
3. **Token Scope Issues**: Make sure the Cognitive Services permissions are correctly configured

### Debugging Authentication

You can enable detailed logging by updating the `msalConfig` in `authService.js`:

```javascript
system: {
  loggerOptions: {
    loggerCallback: (level, message, containsPii) => {
      if (containsPii) return;
      console.log(`[MSAL ${level}]: ${message}`);
    },
    logLevel: LogLevel.Verbose, // Change to Verbose for detailed logs
  },
},
```

### Environment-Specific Configuration

For production deployments:

1. Update the redirect URI in your app registration to match your production domain
2. Consider using environment variables for the client ID:

```javascript
const msalConfig = {
  auth: {
    clientId: import.meta.env.VITE_AZURE_CLIENT_ID || 'your-default-client-id',
    authority: import.meta.env.VITE_AZURE_AUTHORITY || 'https://login.microsoftonline.com/common',
    redirectUri: window.location.origin,
  },
  // ...
};
```

3. Create a `.env` file for your environment variables:
```
VITE_AZURE_CLIENT_ID=your-client-id-here
VITE_AZURE_AUTHORITY=https://login.microsoftonline.com/your-tenant-id
```

## Security Best Practices

1. **Never commit sensitive information**: Keep client secrets and tenant IDs in environment variables
2. **Use appropriate account types**: Choose the most restrictive account type that meets your needs
3. **Regularly review permissions**: Periodically audit API permissions and user access
4. **Enable conditional access**: Consider implementing conditional access policies for additional security

## Next Steps

After successful authentication setup:

1. Test the voice live functionality with authenticated users
2. Configure appropriate user roles and permissions
3. Set up monitoring and logging for authentication events
4. Plan for production deployment with proper security measures