import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const UserContext = createContext(null);

export function UserProvider({ children }) {
  const [userId, setUserIdState] = useState('');
  const [onboarding, setOnboarding] = useState(null);
  const [loading, setLoading]    = useState(true);

  // Reads the session and onboarding state together. Called on mount, and again
  // after login so a fresh sign-in picks up onboarding without a page reload.
  const refreshUser = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', {
        credentials: 'include',  // Send cookie with request
      });
      if (res.ok) {
        const data = await res.json();
        setUserIdState(data.user.email);
        setOnboarding(data.user.onboarding || null);
        return data.user;
      }
      setUserIdState('');
      setOnboarding(null);
    } catch (_) {
      setUserIdState('');
      setOnboarding(null);
    }
    return null;
  }, []);

  // On mount, check if we have a valid session via /api/auth/me
  // This uses the HTTP-only cookie automatically
  useEffect(() => {
    refreshUser().finally(() => setLoading(false));
  }, [refreshUser]);

  const login = async (email) => {
    // Cookie is already set by the server response
    // We just store the email for display purposes
    setUserIdState(email);
    // Pull onboarding state for the account that just signed in
    await refreshUser();
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method:      'POST',
        credentials: 'include',
      });
    } catch (_) {}
    setUserIdState('');
    setOnboarding(null);
  };

  /** Patch onboarding state; updates locally from the server's response. */
  const updateOnboarding = useCallback(async (patch) => {
    // Optimistic — the checklist should feel instant
    setOnboarding(prev => (prev ? { ...prev, ...patch } : prev));
    try {
      const res = await fetch('/api/auth/onboarding', {
        method:      'PATCH',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify(patch),
      });
      if (res.ok) {
        const data = await res.json();
        setOnboarding(data.onboarding);
      }
    } catch (_) {
      // Non-fatal: the checklist stays usable, state resyncs on next load
    }
  }, []);

  return (
    <UserContext.Provider value={{
      userId, login, logout, loading,
      onboarding, updateOnboarding, refreshUser,
    }}>
      {children}
    </UserContext.Provider>
  );
}

export const useUser = () => useContext(UserContext);
