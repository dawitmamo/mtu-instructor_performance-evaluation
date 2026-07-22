import { BarChart3, BookOpen, CalendarClock, CalendarDays, Database, GraduationCap, KeyRound, LayoutDashboard, Link2, ListOrdered, LogOut, Moon, Sun, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import mtuLogo from '../assets/mtu-logo.png';

const items = [
  ['dashboard', 'Dashboard', LayoutDashboard],
  ['departments', 'Departments', GraduationCap],
  ['semesters', 'Semesters', CalendarDays],
  ['courses', 'Courses', BookOpen],
  ['assignments', 'Assignments', Link2],
  ['schedules', 'Schedules', CalendarClock],
  ['committees', 'Exam Committee', Users],
  ['stream-selection', 'Stream Selection', ListOrdered],
  ['keys', 'Evaluation Keys', KeyRound],
  ['reports', 'Reports', BarChart3],
  ['users', 'Users', Users]
];

function allowed(page, user) {
  const { role, committeeRoles = [] } = user;
  if (page === 'committees') return role === 'HOD';
  if (page === 'stream-selection') return role === 'STUDENT' || role === 'HOD' || role === 'EXAM_COMMITTEE' || committeeRoles.includes('EXAM_COMMITTEE');
  if (role === 'STUDENT') return ['dashboard', 'courses', 'schedules'].includes(page);
  if (role === 'INSTRUCTOR') {
    if (!committeeRoles.length) return ['dashboard', 'schedules'].includes(page);
    return ['dashboard', 'semesters', 'courses', 'assignments', 'schedules', 'keys', 'reports', 'users'].includes(page);
  }
  if (role === 'SUPER_ADMIN') return page !== 'keys';
  if (role === 'EXAM_COMMITTEE') return true;
  return true;
}

export function Sidebar({ activePage, onNavigate, databaseConnected }) {
  const { user, logout, darkMode, setDarkMode } = useAuth();
  const visibleItems = items.filter(([id]) => allowed(id, user));
  const links = visibleItems.map(([id, label, Icon]) => (
    <button type='button' className={activePage === id ? 'nav-item active' : 'nav-item'} key={id} onClick={() => onNavigate(id)}>
      <Icon size={18} /><span>{label}</span>
    </button>
  ));
  return <aside className='sidebar'>
    <div className='brand'>
      <img src={mtuLogo} alt='Mizan-Tepi University logo' />
      <div><strong>UIPES</strong><span>MTU Evaluation Suite</span></div>
    </div>
    <nav>{links}</nav>
    <div className='sidebar-footer'>
      <div className={databaseConnected ? 'db-status connected' : 'db-status'}><Database size={16} /><span>{databaseConnected ? 'MongoDB connected' : 'Checking database'}</span></div>
      <button type='button' className='mode-button' onClick={() => setDarkMode(!darkMode)}>{darkMode ? <Sun size={18} /> : <Moon size={18} />}<span>{darkMode ? 'Light' : 'Dark'} mode</span></button>
      <button type='button' className='mode-button sign-out-button' onClick={logout} aria-label='Sign out of UIPES'><LogOut size={18} /><span>Sign out</span></button>
    </div>
  </aside>;
}
