/**
 * React Hook for Authentication Management
 * Provides authentication state and actions for React components
 */

import { useState, useEffect, useCallback } from 'react';
import authService from './authService';
import { config } from '../config';
import type { UserInfo } from '../types';

interface UseAuthReturn {
  isAuthenticated: boolean;
  user: UserInfo | null;
  isLoading: boolean;
  error: string | null;
  requireAuth: boolean;
  signIn: (method?: 'popup' | 'redirect') => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
  getAccessToken: () => Promise<string | null>;
}

export function useAuth(): UseAuthReturn {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Check authentication status on mount
  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // If using API key authentication, mark as authenticated
        if (config.resource.auth.method === 'apiKey') {
          setIsAuthenticated(true);
          setUser({ name: 'API Key User', method: 'apiKey' });
          return;
        }

        // For Entra ID, check if user is signed in
        if (config.resource.auth.method === 'entraId') {
          const isSignedIn = authService.isSignedIn();
          setIsAuthenticated(isSignedIn);
          
          if (isSignedIn) {
            const userInfo = authService.getUserInfo();
            setUser({ ...userInfo, method: 'entraId' });
          }
        }
      } catch (err) {
        console.error('Error checking auth status:', err);
        setError(err instanceof Error ? err.message : 'Unknown error occurred');
        setIsAuthenticated(false);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuthStatus();
  }, []);

  // Sign in function
  const signIn = useCallback(async (method = 'popup') => {
    if (config.resource.auth.method !== 'entraId') {
      throw new Error('Sign in is only available with Entra ID authentication');
    }

    try {
      setIsLoading(true);
      setError(null);

      let response;
      if (method === 'popup') {
        response = await authService.signInPopup();
      } else if (method === 'redirect') {
        await authService.signInRedirect();
        return; // Redirect will reload the page
      }

      if (response && response.account) {
        setIsAuthenticated(true);
        const userInfo = authService.getUserInfo();
        setUser({ ...userInfo, method: 'entraId' });
      }
    } catch (err) {
      console.error('Sign in failed:', err);
      setError(err instanceof Error ? err.message : 'Sign in failed');
      setIsAuthenticated(false);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Sign out function
  const signOut = useCallback(async () => {
    if (config.resource.auth.method !== 'entraId') {
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      await authService.signOut();
      setIsAuthenticated(false);
      setUser(null);
    } catch (err) {
      console.error('Sign out failed:', err);
      setError(err instanceof Error ? err.message : 'Sign out failed');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Get access token (for direct API calls if needed)
  const getAccessToken = useCallback(async () => {
    if (config.resource.auth.method === 'apiKey') {
      throw new Error('Access token not available with API key authentication');
    }

    try {
      return await authService.getAccessToken();
    } catch (err) {
      console.error('Failed to get access token:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      throw err;
    }
  }, []);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    // State
    isAuthenticated,
    user,
    isLoading,
    error,
    
    // Actions
    signIn,
    signOut,
    getAccessToken,
    clearError,
    
    // Configuration
    requireAuth: config.resource.auth.method === 'entraId' && config.resource.auth.entraId.requireAuth,
  };
}

export default useAuth;