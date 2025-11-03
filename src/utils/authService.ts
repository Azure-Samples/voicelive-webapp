/**
 * Microsoft Entra ID Authentication Service
 * Handles authentication using MSAL (Microsoft Authentication Library)
 */

import { 
  PublicClientApplication, 
  LogLevel, 
  type Configuration, 
  type SilentRequest,
  type RedirectRequest,
  type PopupRequest,
  type EndSessionPopupRequest,
  type AuthenticationResult,
  type AccountInfo
} from '@azure/msal-browser';

// MSAL configuration
const msalConfig: Configuration = {
  auth: {
    clientId: import.meta.env.VITE_AZURE_CLIENT_ID || 'your-client-id', // Replace with your Azure app registration client ID
    authority: import.meta.env.VITE_AZURE_AUTHORITY || 'https://login.microsoftonline.com/common', // Use 'common' for multi-tenant or your specific tenant ID
    redirectUri: import.meta.env.VITE_AZURE_REDIRECT_URI || window.location.origin, 
  },
  cache: {
    cacheLocation: 'sessionStorage', // This configures where your cache will be stored
    storeAuthStateInCookie: false, // Set this to "true" if you are having issues on IE11 or Edge
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) {
          return;
        }
        switch (level) {
          case LogLevel.Error:
            console.error(message);
            return;
          case LogLevel.Info:
            console.info(message);
            return;
          case LogLevel.Verbose:
            console.debug(message);
            return;
          case LogLevel.Warning:
            console.warn(message);
            return;
        }
      },
    },
  },
};

// Scopes needed for Azure AI Services
const loginRequest: PopupRequest = {
  scopes: [
    'https://cognitiveservices.azure.com/.default', // Azure Cognitive Services scope
  ],
};

class AuthService {
  private msalInstance: PublicClientApplication;
  private account: AccountInfo | null;

  constructor() {
    this.msalInstance = new PublicClientApplication(msalConfig);
    this.account = null;
    
    // Initialize MSAL
    this.initialize();
  }

  async initialize() {
    try {
      await this.msalInstance.initialize();
      
      // Handle redirect promise
      const response = await this.msalInstance.handleRedirectPromise();
      if (response) {
        this.account = response.account;
      } else {
        // Check if there are any accounts in cache
        const accounts = this.msalInstance.getAllAccounts();
        if (accounts.length > 0) {
          this.account = accounts[0];
        }
      }
    } catch (error) {
      console.error('Failed to initialize MSAL:', error);
    }
  }

  /**
   * Sign in the user using popup
   */
  async signInPopup(): Promise<AuthenticationResult> {
    try {
      const response = await this.msalInstance.loginPopup(loginRequest);
      this.account = response.account;
      return response;
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  }

  /**
   * Sign in the user using redirect
   */
  async signInRedirect(): Promise<void> {
    try {
      await this.msalInstance.loginRedirect(loginRequest);
    } catch (error) {
      console.error('Login redirect failed:', error);
      throw error;
    }
  }

  /**
   * Sign out the user
   */
  async signOut(): Promise<void> {
    try {
      const logoutRequest: EndSessionPopupRequest = {
        account: this.account,
        postLogoutRedirectUri: window.location.origin,
      };
      await this.msalInstance.logoutPopup(logoutRequest);
      this.account = null;
    } catch (error) {
      console.error('Logout failed:', error);
      throw error;
    }
  }

  /**
   * Get access token for Azure AI Services
   */
  async getAccessToken(): Promise<string> {
    if (!this.account) {
      throw new Error('No user account found. Please sign in first.');
    }

    const silentRequest: SilentRequest = {
      scopes: loginRequest.scopes,
      account: this.account,
    };

    try {
      // Try to get token silently first
      const response = await this.msalInstance.acquireTokenSilent(silentRequest);
      return response.accessToken;
    } catch (error) {
      console.warn('Silent token acquisition failed, falling back to popup:', error);
      
      // If silent token acquisition fails, fall back to popup
      try {
        const response = await this.msalInstance.acquireTokenPopup(silentRequest);
        return response.accessToken;
      } catch (popupError) {
        console.error('Token acquisition failed:', popupError);
        throw popupError;
      }
    }
  }

  /**
   * Check if user is signed in
   */
  isSignedIn(): boolean {
    return this.account !== null;
  }

  /**
   * Get current user account
   */
  getCurrentAccount(): AccountInfo | null {
    return this.account;
  }

  /**
   * Get user information
   */
  getUserInfo(): { name?: string; username?: string; localAccountId?: string; homeAccountId?: string } | null {
    if (this.account) {
      return {
        name: this.account.name,
        username: this.account.username,
        localAccountId: this.account.localAccountId,
        homeAccountId: this.account.homeAccountId,
      };
    }
    return null;
  }
}

// Create singleton instance
const authService = new AuthService();

export default authService;

// Export configuration for easy updates
export { msalConfig, loginRequest };