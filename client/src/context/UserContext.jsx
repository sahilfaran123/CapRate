import { createContext, useContext, useState, useEffect } from 'react';

const UserContext = createContext(null);

export function UserProvider({ children }) {
  const [userId, setUserIdState] = useState('');
  const [loading, setLoading]    = useState(true);

  // On mount, check if we have a valid session via /api/auth/me
  // This uses the HTTP-only cookie automatically
  useEffect(() => {
    const checkSession = async () => {
      try {
        const res = await fetch('/api/auth/me', {
          credentials: 'include',  // Send cookie with request
        });
        if (res.ok) {
          const data = await res.json();
          setUserIdState(data.user.email);
        } else {
          setUserIdState('');
        }
      } catch (_) {
        setUserIdState('');
      } finally {
        setLoading(false);
      }
    };
    checkSession();
  }, []);

  const login = (email) => {
    // Cookie is already set by the server response
    // We just store the email for display purposes
    setUserIdState(email);
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method:      'POST',
        credentials: 'include',
      });
    } catch (_) {}
    setUserIdState('');
  };

  return (
    <UserContext.Provider value={{ userId, login, logout, loading }}>
      {children}
    </UserContext.Provider>
  );
}

export const useUser = () => useContext(UserContext);
