import { useEffect, useState, useRef } from 'react';
import { exchangeCodeForToken, type TokenResponse } from '../auth/authService';
import axios from 'axios';
import { fetchCurrentUser } from '../services/api';
import { type InforUser } from '../types/api';
import { isTokenExpired, getStoredToken } from '../auth/tokenUtils';

/**
 * Custom hook for managing authentication state, URL code exchange, and basic routing path syncing.
 */
export function useAuth() {
  const [token, setToken] = useState<string | null>(getStoredToken);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      return !!urlParams.get('code');
    }
    return false;
  });
  const [currentUser, setCurrentUser] = useState<InforUser | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState<boolean>(false);
  const codeExchangedRef = useRef<string | null>(null);

  // Monitor URL params for OAuth redirect codes and manage polling sync
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');

    if (code) {
      if (codeExchangedRef.current === code) {
        return;
      }
      codeExchangedRef.current = code;
      setLoading(true);
      setError(null);
      exchangeCodeForToken(code)
        .then((tokenData: TokenResponse) => {
          console.log("Token received via code exchange:", tokenData);
          const tokenDataWithTimestamp = {
            ...tokenData,
            retrieved_at: Date.now()
          };
          localStorage.setItem("accessToken", JSON.stringify(tokenDataWithTimestamp));
          setToken(tokenData.access_token || JSON.stringify(tokenDataWithTimestamp));
          // Redirect browser URL cleanly to /dashboard
          window.history.replaceState({}, document.title, '/dashboard');
        })
        .catch((err: unknown) => {
          console.error("Code exchange error:", err);
          
          // If we already have a valid token stored in localStorage, redirect directly to dashboard
          const existingToken = getStoredToken();
          if (existingToken) {
            console.log("Code exchange failed, but found existing token. Redirecting to dashboard.");
            window.history.replaceState({}, document.title, '/dashboard');
            return;
          }

          let errMsg = "Failed to exchange authorization code";
          if (axios.isAxiosError(err)) {
            errMsg = err.response?.data
              ? (typeof err.response.data === 'object' ? JSON.stringify(err.response.data, null, 2) : String(err.response.data))
              : (err.message || errMsg);
          } else if (err instanceof Error) {
            errMsg = err.message;
          }
          setError(errMsg);
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      // Clear session on mount to start clean if we don't have a token
      if (!localStorage.getItem('accessToken')) {
        localStorage.removeItem('session');
      }
    }

    const checkToken = () => {
      const rawToken = localStorage.getItem('accessToken');
      if (rawToken && isTokenExpired(rawToken)) {
        console.log("Token expired. Auto-logging out...");
        localStorage.removeItem('accessToken');
        localStorage.removeItem('session');
        setToken(null);
        setCurrentUser(null);
      } else {
        const nextToken = getStoredToken();
        setToken(nextToken);
        if (!nextToken) {
          setCurrentUser(null);
        }
      }
    };

    window.addEventListener('storage', checkToken);
    window.addEventListener('focus', checkToken);
    return () => {
      window.removeEventListener('storage', checkToken);
      window.removeEventListener('focus', checkToken);
    };
  }, []);

  // Load user profile once when authenticated
  useEffect(() => {
    if (!token) {
      return;
    }

    async function loadUser() {
      setIsLoadingUser(true);
      try {
        const userData = await fetchCurrentUser();
        setCurrentUser(userData);
      } catch (err) {
        console.error('Failed to load user profile:', err);
      } finally {
        setIsLoadingUser(false);
      }
    }

    void loadUser();
  }, [token]);

  // [DEV] Log current token whenever it changes — visible in DevTools console
  useEffect(() => {
    if (token) {
      console.log('%c[AUTH] Active Token', 'color: #22c55e; font-weight: bold;', token);
    } else {
      console.log('%c[AUTH] Token cleared / not authenticated', 'color: #ef4444; font-weight: bold;');
    }
  }, [token]);

  const logout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('session');
    setToken(null);
    setCurrentUser(null);
  };

  return {
    token,
    error,
    loading,
    setError,
    logout,
    currentUser,
    isLoadingUser,
  };
}
