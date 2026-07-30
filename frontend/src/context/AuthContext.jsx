import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { clearSession, getCurrentUser, login as loginRequest } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('darkMode') === 'true');

  useEffect(() => {
    let mounted = true;
    const restore = async () => {
      if (!localStorage.getItem('accessToken')) { setLoading(false); return; }
      try {
        const currentUser = await getCurrentUser();
        if (mounted) setUser(currentUser);
      } catch {
        clearSession();
      } finally {
        if (mounted) setLoading(false);
      }
    };
    restore();
    const expire = () => setUser(null);
    window.addEventListener('session-expired', expire);
    return () => { mounted = false; window.removeEventListener('session-expired', expire); };
  }, []);

  useEffect(() => { localStorage.setItem('darkMode', String(darkMode)); }, [darkMode]);
  const login = async (email, password, userType, department) => {
    const data = await loginRequest(email, password, userType, department);
    setUser(data.user);
    return data.user;
  };
  const logout = () => { clearSession(); setUser(null); };
  const value = useMemo(() => ({ user, loading, login, logout, setCurrentUser: setUser, darkMode, setDarkMode }), [user, loading, darkMode]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
