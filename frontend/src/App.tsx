import { VoiceLiveAgent } from './components/VoiceLiveAgent';
import { AuthComponent } from './components/AuthComponent';
import { useAuth } from './utils/useAuth';
import { config } from './config';
import './App.css';

function App(): JSX.Element {
  const { isAuthenticated, isLoading, requireAuth } = useAuth();

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="preview-wrapper">
        <div className="container">
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <p>Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  // Show authentication UI if required and not authenticated
  if (requireAuth && !isAuthenticated) {
    return (
      <div className="preview-wrapper">
        <div className="container">
          <div className="top-bar">
            <div className="left-section">
              <div className="agent-icon-container">
                <svg
                  className="agent-icon"
                  width="32"
                  height="32"
                  viewBox="0 0 32 32"
                  fill="currentColor"
                >
                  <circle cx="16" cy="16" r="16" opacity="0.2" />
                  <path d="M16 8a4 4 0 100 8 4 4 0 000-8zm-6 12a3 3 0 00-3 3v1a1 1 0 001 1h16a1 1 0 001-1v-1a3 3 0 00-3-3h-12z" />
                </svg>
                <h1 className="agent-name">Voice Live Agent</h1>
              </div>
            </div>
          </div>

          <div className="content auth-required">
            <AuthComponent />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="preview-wrapper">
      <div className="container">
        <div className="top-bar">
          <div className="left-section">
            <div className="agent-icon-container">
              <svg
                className="agent-icon"
                width="32"
                height="32"
                viewBox="0 0 32 32"
                fill="currentColor"
              >
                <circle cx="16" cy="16" r="16" opacity="0.2" />
              </svg>
              <h1 className="agent-name">Voice Live Agent</h1>
            </div>
          </div>
          
          {config.resource.auth.method === 'entraId' && (
            <div className="right-section">
              <AuthComponent />
            </div>
          )}
        </div>

        <div className="content">
          <VoiceLiveAgent />
        </div>
      </div>
    </div>
  );
}

export default App;
