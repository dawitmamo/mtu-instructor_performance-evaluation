import { lazy, Suspense, useEffect, useState } from 'react';
import { Sidebar } from '../components/Sidebar.jsx';
import { ProfileAvatar } from '../components/ProfileAvatar.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getHealth } from '../api/client.js';

const DashboardHome = lazy(() => import('./DashboardHome.jsx').then((module) => ({ default: module.DashboardHome })));
const catalogPage = (name) => lazy(() => import('./CatalogPages.jsx').then((module) => ({ default: module[name] })));
const AssignmentsPage = catalogPage('AssignmentsPage');
const CourseAssignmentsPage = catalogPage('CourseAssignmentsPage');
const CoursesPage = catalogPage('CoursesPage');
const DepartmentsPage = catalogPage('DepartmentsPage');
const ExamCommitteesPage = catalogPage('ExamCommitteesPage');
const SemestersPage = catalogPage('SemestersPage');
const UsersPage = catalogPage('UsersPage');
const ReportsPage = lazy(() => import('./ManagementPages.jsx').then((module) => ({ default: module.ReportsPage })));
const StreamSelectionPage = lazy(() => import('./StreamSelectionPage.jsx').then((module) => ({ default: module.StreamSelectionPage })));
const SchedulesPage = lazy(() => import('./SchedulesPage.jsx').then((module) => ({ default: module.SchedulesPage })));
const CoursePreferencesPage = lazy(() => import('./CoursePreferencesPage.jsx').then((module) => ({ default: module.CoursePreferencesPage })));
const ProfilePage = lazy(() => import('./ProfilePage.jsx').then((module) => ({ default: module.ProfilePage })));
const PerformanceMetricsPage = lazy(() => import('./PerformanceMetricsPage.jsx').then((module) => ({ default: module.PerformanceMetricsPage })));

const titles = {
  dashboard: 'Instructor Performance Evaluation',
  departments: 'Departments', semesters: 'Semesters', courses: 'Courses', 'course-assignments': 'Course Assignments', assignments: 'Evaluation Assignments', committees: 'Course and Exam Committee',
  reports: 'Reports', users: 'Users', schedules: 'Schedules', 'stream-selection': 'Stream Selection', 'course-preferences': 'Course Preferences', 'performance-metrics': 'Performance Metrics', profile: 'My Profile'
};

export function Dashboard() {
  const { user, darkMode } = useAuth();
  const [activePage, setActivePage] = useState('dashboard');
  const [databaseConnected, setDatabaseConnected] = useState(false);
  useEffect(() => { getHealth().then((health) => setDatabaseConnected(Boolean(health.database?.connected))).catch(() => setDatabaseConnected(false)); }, []);
  const name = user.name || [user.firstName, user.lastName].filter(Boolean).join(' ');
  return <div className={darkMode ? 'app dark' : 'app'}>
    <Sidebar activePage={activePage} onNavigate={setActivePage} databaseConnected={databaseConnected} />
    <main className='workspace'>
      <header className='topbar'>
        <div className='topbar-heading'><span className='breadcrumb'>UAMIPES / {titles[activePage]}</span><h1>{titles[activePage]}</h1><p>Light of the Green Valley · Mizan-Tepi University</p></div>
        <button type='button' className='profile' onClick={() => setActivePage('profile')} aria-label='Open my profile'><ProfileAvatar user={user} /><span><strong>{name}</strong><small>{[user.role, ...(user.committeeRoles || [])].map((role) => role.replaceAll('_', ' ')).join(' / ')}</small></span></button>
      </header>
      <Suspense fallback={<div className='loading-state'>Loading page...</div>}><Page activePage={activePage} user={user} /></Suspense>
    </main>
  </div>;
}

function Page({ activePage, user }) {
  if (activePage === 'profile') return <ProfilePage />;
  if (activePage === 'departments') return <DepartmentsPage />;
  if (activePage === 'semesters') return <SemestersPage />;
  if (activePage === 'courses') return <CoursesPage />;
  if (activePage === 'course-assignments') return <CourseAssignmentsPage />;
  if (activePage === 'assignments') return <AssignmentsPage />;
  if (activePage === 'course-preferences') return <CoursePreferencesPage />;
  if (activePage === 'committees') return <ExamCommitteesPage />;
  if (activePage === 'reports') return <ReportsPage user={user} />;
  if (activePage === 'users') return <UsersPage />;
  if (activePage === 'stream-selection') return <StreamSelectionPage />;
  if (activePage === 'schedules') return <SchedulesPage user={user} />;
  if (activePage === 'performance-metrics') return <PerformanceMetricsPage />;
  return <DashboardHome user={user} />;
}
