/**
 * Authentication Component
 * Handles sign-in/sign-out UI and authentication status display
 */

import { config } from '../config';
import { useAuth } from '../utils/useAuth';
import './AuthComponent.css';

export function AuthComponent(): JSX.Element | null {
  const {
    isAuthenticated,
    user,
    isLoading,
    error,
    signIn,
    signOut,
    clearError,
  } = useAuth();

  // Don't render anything if using API key auth
  if (config.resource.auth.method === 'apiKey') {
    return null;
  }

  if (isLoading) {
    return (
      <div className="auth-component loading">
        <div className="auth-spinner"></div>
        <span>Checking authentication...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="auth-component error">
        <div className="auth-error">
          <span className="error-icon">⚠️</span>
          <span className="error-message">{error}</span>
          <button onClick={clearError} className="error-dismiss">
            ×
          </button>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="auth-component signin">
        <div className="signin-card">
          <div className="signin-header">
            <h3>Sign In Required</h3>
            <p>Please sign in with your Microsoft account to use Voice Live Agent</p>
          </div>
          <div className="signin-actions">
            <button
              onClick={() => signIn('popup')}
              className="signin-button primary"
              disabled={isLoading}
            >
              <span className="button-icon">🔐</span>
              Sign In with Microsoft
            </button>
            <button
              onClick={() => signIn('redirect')}
              className="signin-button secondary"
              disabled={isLoading}
            >
              Sign In (Redirect)
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-component authenticated">
      <div className="user-info">
        <div className="user-avatar">
          {user?.name ? user.name.charAt(0).toUpperCase() : '👤'}
        </div>
        <div className="user-details">
          <span className="user-name">{user?.name || user?.username || 'Signed In'}</span>
          <span className="user-method">Microsoft Entra ID</span>
        </div>
        <button
          onClick={signOut}
          className="signout-button"
          disabled={isLoading}
          title="Sign Out"
        >
          🚪
        </button>
      </div>
    </div>
  );
}

export default AuthComponent;