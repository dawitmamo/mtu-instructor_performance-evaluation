import { useState } from 'react';
import { BarChart3, BookMarked, BookOpen, CalendarClock, CalendarDays, CircleUserRound, Database, Gauge, GraduationCap, LayoutDashboard, Link2, ListOrdered, LogOut, Menu, Moon, Sun, Users, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import mtuLogo from '../assets/mtu-logo.png';

const items = [
  ['dashboard', 'Dashboard', LayoutDashboard],
  ['profile', 'My Profile', CircleUserRound],
  ['departments', 'Departments', GraduationCap],
  ['semesters', 'Semesters', CalendarDays],
  ['courses', 'Courses', BookOpen],
  ['course-preferences', 'Course Preferences', BookMarked],
  ['course-assignments', 'Course Assignments', BookMarked],
  ['assignments', 'Evaluation Assignments', Link2],
  ['performance-metrics', 'Performance Metrics', Gauge],
  ['schedules', 'Schedules', CalendarClock],
  ['committees', 'Course & Exam Committee', Users],
  ['stream-selection', 'Stream Selection', ListOrdered],
  ['reports', 'Reports', BarChart3],
  ['users', 'Users', Users]
];

function allowed(page, user) {
  const { role, committeeRoles = [] } = user;
  if (page === 'profile') return true;
  if (page === 'users') return role === 'SUPER_ADMIN' || role === 'HOD';
  if (page === 'committees') return role === 'HOD' || role === 'SUPER_ADMIN';
  if (page === 'performance-metrics') return role === 'HOD';
  if (page === 'course-preferences') return role === 'HOD' || role === 'INSTRUCTOR';
  if (page === 'stream-selection') return role === 'STUDENT' || role === 'HOD' || committeeRoles.includes('COURSE_EXAM_COMMITTEE');
  if (role === 'STUDENT') return ['dashboard', 'courses', 'schedules'].includes(page);
  if (role === 'INSTRUCTOR') {
    if (!committeeRoles.length) return ['dashboard', 'course-preferences', 'schedules', 'reports'].includes(page);
    return ['dashboard', 'semesters', 'courses', 'course-preferences', 'course-assignments', 'assignments', 'schedules', 'reports'].includes(page);
  }
  if (role === 'SUPER_ADMIN') return true;
  return true;
}

export function Sidebar({ activePage, onNavigate, databaseConnected }) {
  const { user, logout, darkMode, setDarkMode } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const visibleItems = items.filter(([id]) => allowed(id, user));
  const links = visibleItems.map(([id, label, Icon]) => (
    <button type='button' className={activePage === id ? 'nav-item active' : 'nav-item'} key={id} onClick={() => { onNavigate(id); setMobileOpen(false); }}>
      <Icon size={18} /><span>{label}</span>
    </button>
  ));
  return <aside className={mobileOpen ? 'sidebar mobile-open' : 'sidebar'}>
    <div className='brand'>
      <img src={mtuLogo} alt='Mizan-Tepi University logo' />
      <div><strong>UAMIPES</strong><span>MTU Academic Evaluation Suite</span><small>Light of the Green Valley</small></div>
      <button type='button' className='mobile-sign-out-button' onClick={logout} aria-label='Sign out of UAMIPES' title='Sign out'><LogOut size={20} /></button>
      <button type='button' className='sidebar-menu-button' onClick={() => setMobileOpen((open) => !open)} aria-expanded={mobileOpen} aria-controls='primary-navigation' aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}>{mobileOpen ? <X size={21} /> : <Menu size={21} />}</button>
    </div>
    <nav id='primary-navigation'>{links}</nav>
    <div className='sidebar-footer'>
      <div className={databaseConnected ? 'db-status connected' : 'db-status'}><Database size={16} /><span>{databaseConnected ? 'Data connected' : 'Checking data'}</span></div>
      <button type='button' className='mode-button' onClick={() => setDarkMode(!darkMode)}>{darkMode ? <Sun size={18} /> : <Moon size={18} />}<span>{darkMode ? 'Light' : 'Dark'} mode</span></button>
      <button type='button' className='mode-button sign-out-button' onClick={logout} aria-label='Sign out of UAMIPES'><LogOut size={18} /><span>Sign out</span></button>
    </div>
  </aside>;
}
