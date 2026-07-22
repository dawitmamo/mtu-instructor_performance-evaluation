import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Sidebar } from '../components/Sidebar.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getHealth } from '../api/client.js';
import { DashboardHome } from './DashboardHome.jsx';
import { AssignmentsPage, CoursesPage, DepartmentsPage, ExamCommitteesPage, SemestersPage, UsersPage } from './CatalogPages.jsx';
import { EvaluationKeysPage, ReportsPage } from './ManagementPages.jsx';
import { StreamSelectionPage } from './StreamSelectionPage.jsx';
import { SchedulesPage } from './SchedulesPage.jsx';

const titles = {
  dashboard: 'Instructor Performance Evaluation',
  departments: 'Departments', semesters: 'Semesters', courses: 'Courses', assignments: 'Assignments', committees: 'Exam Committee', keys: 'Evaluation Keys',
  reports: 'Reports', users: 'Users', schedules: 'Schedules', 'stream-selection': 'Stream Selection'
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
        <div><span className='breadcrumb'>UIPES / {titles[activePage]}</span><h1>{titles[activePage]}</h1></div>
        <div className='profile'><ShieldCheck size={18} /><span><strong>{name}</strong><small>{[user.role, ...(user.committeeRoles || [])].map((role) => role.replaceAll('_', ' ')).join(' / ')}</small></span></div>
      </header>
      <Page activePage={activePage} user={user} />
    </main>
  </div>;
}

function Page({ activePage, user }) {
  if (activePage === 'departments') return <DepartmentsPage />;
  if (activePage === 'semesters') return <SemestersPage />;
  if (activePage === 'courses') return <CoursesPage />;
  if (activePage === 'assignments') return <AssignmentsPage />;
  if (activePage === 'committees') return <ExamCommitteesPage />;
  if (activePage === 'keys') return <EvaluationKeysPage />;
  if (activePage === 'reports') return <ReportsPage user={user} />;
  if (activePage === 'users') return <UsersPage />;
  if (activePage === 'stream-selection') return <StreamSelectionPage />;
  if (activePage === 'schedules') return <SchedulesPage user={user} />;
  return <DashboardHome user={user} />;
}
