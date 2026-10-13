import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api, { onUnauthorized, setStoredToken, clearStoredToken } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // Status finite state machine: 'loading' | 'authenticated' | 'unauthenticated' | 'error'
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  /**
   * Bootstrap session with GET /api/me (with 15s timeout and 1 bounded retry for cold starts).
   */
  const bootstrapAuth = useCallback(async (retryCount = 0) => {
    try {
      const res = await api.get('/me?skipStats=true');
      if (res.success && res.data?.user) {
        setUser(res.data.user);
        setStatus('authenticated');
        setError(null);
        return res.data.user;
      }
      setUser(null);
      setStatus('unauthenticated');
      setError(null);
      return null;
    } catch (err) {
      const isAuthError =
        err?.status === 401 ||
        err?.code === 'AUTH_REQUIRED' ||
        err?.code === 'UNAUTHORIZED' ||
        err?.code === 'INVALID_TOKEN' ||
        err?.code === 'ACCOUNT_DISABLED';

      if (isAuthError) {
        setUser(null);
        setStatus('unauthenticated');
        setError(null);
        return null;
      }

      // If backend was sleeping / cold-starting, retry once after a short 1s backoff
      if (retryCount < 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return bootstrapAuth(retryCount + 1);
      }

      setUser(null);
      setStatus('error');
      setError(err);
      return null;
    }
  }, []);

  // Initial bootstrap on mount
  useEffect(() => {
    bootstrapAuth();
  }, [bootstrapAuth]);

  // Subscribe to 401 events emitted from protected endpoints in client.js
  useEffect(() => {
    const unsubscribe = onUnauthorized(() => {
      setUser(null);
      setStatus('unauthenticated');
    });
    return unsubscribe;
  }, []);

  // Handle bfcache restores (pageshow with persisted=true)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handlePageShow = (event) => {
      if (event.persisted) {
        // Restored from Back-Forward cache: re-validate session
        bootstrapAuth();
      }
    };

    window.addEventListener('pageshow', handlePageShow);
    return () => {
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [bootstrapAuth]);

  const login = async (username, password) => {
    const cleanUsername = username ? username.trim().toLowerCase() : '';
    const res = await api.post('/auth/login', {
      username: cleanUsername,
      password,
    });

    if (res.success) {
      if (res.data?.token) {
        setStoredToken(res.data.token);
      }
      if (res.data?.user) {
        setUser(res.data.user);
        setStatus('authenticated');
        setError(null);
      }
      // Re-fetch /me to establish fully hydrated session state
      const refreshedUser = await bootstrapAuth();
      return refreshedUser || res.data?.user;
    }
    return null;
  };

  const register = async ({ name, username, password, email, phone, inviteCode, shareToken }) => {
    const cleanUsername = username ? username.trim().toLowerCase() : '';
    const res = await api.post('/auth/register', {
      name,
      username: cleanUsername,
      password,
      email: email ? email.trim() : undefined,
      phone: phone ? phone.trim() : undefined,
      inviteCode: inviteCode ? inviteCode.trim() : undefined,
      shareToken: shareToken ? shareToken.trim() : undefined,
    });

    if (res.success) {
      if (res.data?.token) {
        setStoredToken(res.data.token);
      }
      if (res.data?.user) {
        setUser(res.data.user);
        setStatus('authenticated');
        setError(null);
      }
      // Re-fetch /me to establish authenticated session state in background
      await bootstrapAuth();
      return {
        user: res.data?.user,
        recoveryCodes: res.data?.recoveryCodes || [],
        claimed: res.data?.claimed,
      };
    }
    return res;
  };

  const dismissPasswordNotice = async () => {
    try {
      await api.post('/auth/password-notice/dismiss');
      setUser((prev) => (prev ? { ...prev, passwordChangeNoticePending: false } : null));
    } catch (err) {
      console.error('Failed to dismiss password notice:', err);
    }
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (err) {
      console.warn('Logout request failed; continuing local cleanup:', err);
    } finally {
      clearStoredToken();
      setUser(null);
      setStatus('unauthenticated');
      setError(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        status,
        loading: status === 'loading',
        error,
        login,
        register,
        logout,
        setUser,
        refreshUser: bootstrapAuth,
        dismissPasswordNotice,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
