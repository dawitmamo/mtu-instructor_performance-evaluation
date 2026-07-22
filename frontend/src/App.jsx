import { Dashboard } from './pages/Dashboard.jsx';
import { Login } from './pages/Login.jsx';
import { useAuth } from './context/AuthContext.jsx';

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <div className='full-page-state'>Connecting to the evaluation system...</div>;
  return user ? <Dashboard /> : <Login />;
}
