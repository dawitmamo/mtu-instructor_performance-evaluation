import { useState } from 'react';
import { BookOpenCheck, ClipboardCheck, Database, GraduationCap, LogIn, ShieldCheck, Sparkles, UserRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import mtuLogo from '../assets/mtu-logo.png';

const demoAccounts = [
  { label: 'Login as Admin', detail: 'All departments, setup and reports', email: 'admin@mtu.edu.et', Icon: ShieldCheck },
  { label: 'Login as Student', detail: 'Evaluate assigned course instructors', email: 'student.alex@mtu.edu.et', Icon: GraduationCap },
  { label: 'Login as Instructor', detail: 'Assigned courses, peer tasks and reports', email: 'instructor.ada@mtu.edu.et', Icon: UserRound },
  { label: 'Login as HOD', detail: 'Manage your department and evaluations', email: 'hod.cs@mtu.edu.et', Icon: BookOpenCheck },
  { label: 'Login as Course Committee', detail: 'Courses, classes and instructor assignments', email: 'instructor.kojo@mtu.edu.et', Icon: BookOpenCheck },
  { label: 'Login as Exam Committee', detail: 'Evaluation keys and academic reports', email: 'committee.cs@mtu.edu.et', Icon: ClipboardCheck }
];

export function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('admin@mtu.edu.et');
  const [password, setPassword] = useState('Password123!');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const chooseAccount = (accountEmail) => {
    setEmail(accountEmail);
    setPassword('Password123!');
    setError('');
  };
  const submit = async (event) => {
    event.preventDefault(); setError(''); setBusy(true);
    try { await login(email, password); }
    catch (requestError) { setError(requestError.response?.data?.message || 'Cannot reach the API. Make sure the backend is running.'); }
    finally { setBusy(false); }
  };
  return <main className='login-page'>
    <section className='login-hero'>
      <div className='university-mark'>
        <img src={mtuLogo} alt='Mizan-Tepi University logo' />
        <span>Mizan-Tepi University</span>
      </div>
      <p className='eyebrow'>Instructor Performance Evaluation System</p>
      <h1>Evaluate Instructor performance with clarity.</h1>
      <p>Role-based dashboards, MongoDB-backed academic data, and PDF-aligned criteria for students, instructors, HODs, and administrators.</p>
      <div className='hero-badges'>
        <span>Live MongoDB</span>
        <span>Role-aware access</span>
        <span>Semester based</span>
      </div>
    </section>
    <section className='login-card'>
      <div className='login-brand'><img src={mtuLogo} alt='Mizan-Tepi University logo' /><div><strong>UIPES</strong><span>MTU Instructor Evaluation</span></div></div>
      <h1>Choose how to log in</h1><p>Select a role, then sign in with that account. You can also enter another registered email.</p>
      <div className='account-grid' aria-label='Login as a user role'>
        {demoAccounts.map(({ label, detail, email: accountEmail, Icon }) =>
          <button type='button' className={email === accountEmail ? 'selected' : ''} onClick={() => chooseAccount(accountEmail)} key={accountEmail}>
            <Icon size={20} /><span><strong>{label}</strong><small>{detail}</small></span>
          </button>
        )}
      </div>
      <form onSubmit={submit}>
        <label><span>MTU email address</span><input type='email' value={email} onChange={(event) => setEmail(event.target.value)} pattern='.+@mtu[.]edu[.]et' title='Use an @mtu.edu.et email address' placeholder='name@mtu.edu.et' required /></label>
        <label><span>Password</span><input type='password' value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
        {error && <div className='error-message' role='alert'>{error}</div>}
        <button className='primary-action' disabled={busy}><LogIn size={18} /> {busy ? 'Signing in...' : 'Sign in'}</button>
      </form>
      <div className='demo-hint'><Database size={17} /><span>Demo password: <strong>Password123!</strong>. Instructors see only the peer evaluation tasks explicitly assigned to them.</span></div>
      <div className='secure-note'><Sparkles size={15} /><span>Modernized for MTU academic evaluation workflows.  Designed by Dawit Mamo</span></div>
    </section>
  </main>;
}
