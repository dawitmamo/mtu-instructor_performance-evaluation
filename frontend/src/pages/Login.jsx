import { useEffect, useState } from 'react';
import { Eye, EyeOff, LogIn, Moon, ShieldCheck, Sparkles, Sun, UserRound } from 'lucide-react';
import { PasswordRecovery } from '../components/PasswordRecovery.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getLoginDepartments } from '../api/client.js';
import mtuLogo from '../assets/mtu-logo.png';

const userTypes = [
  ['SUPER_ADMIN', 'Administrator'],
  ['HOD', 'Head of Department (HOD)'],
  ['INSTRUCTOR', 'Instructor'],
  ['STUDENT', 'Student'],
  ['COURSE_EXAM_COMMITTEE', 'Course & Exam Committee']
];

export function Login() {
  const { login, darkMode, setDarkMode } = useAuth();
  const [userType, setUserType] = useState('SUPER_ADMIN');
  const [departments, setDepartments] = useState([]);
  const [department, setDepartment] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getLoginDepartments()
      .then((rows) => {
        setDepartments(rows);
        setDepartment((current) => current || rows[0]?._id || '');
      })
      .catch(() => setError('Departments could not be loaded. Make sure the backend is running.'));
  }, []);

  const submitLogin = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(identifier, password, userType, userType === 'SUPER_ADMIN' ? undefined : department);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Cannot reach the API. Make sure the backend is running.');
    } finally {
      setBusy(false);
    }
  };

  return <main className={darkMode ? 'login-page dark' : 'login-page'}>
    <button className='login-theme-toggle' type='button' onClick={() => setDarkMode(!darkMode)} aria-label={darkMode ? 'Use light mode' : 'Use dark mode'}>
      {darkMode ? <Sun size={18} /> : <Moon size={18} />}<span>{darkMode ? 'Light mode' : 'Dark mode'}</span>
    </button>
    <section className='login-hero'>
      <div className='university-mark'><img src={mtuLogo} alt='Mizan-Tepi University logo' /><div><span>Mizan-Tepi University</span><small>Light of the Green Valley</small></div></div>
      <p className='eyebrow'>University Academic Management and Instructor Performance Evaluation System</p>
      <h1>Manage academic workflows and evaluate instructor performance with clarity.</h1>
      <p>Role-based academic management, schedules, stream allocation, reporting, and instructor evaluation for students, instructors, HODs, committees, and administrators.</p>
      <div className='hero-badges'><span>Live data</span><span>Role-aware access</span><span>Semester based</span></div>
    </section>
    <section className='login-card'>
      <div className='login-brand'><img src={mtuLogo} alt='Mizan-Tepi University logo' /><div><strong>UAMIPES</strong><span>MTU Academic Management &amp; Evaluation</span></div></div>
      <div className='login-heading'><span className='login-heading-icon'><UserRound size={21} /></span><div><h1>Sign in</h1><p>Use the credentials assigned to your account.</p></div></div>
      <form onSubmit={submitLogin}>
        <label><span>Login as</span><select value={userType} onChange={(event) => { const nextType = event.target.value; setUserType(nextType); if (nextType !== 'SUPER_ADMIN' && !department) setDepartment(departments[0]?._id || ''); setError(''); }} aria-label='Select account role'>{userTypes.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><small>Select the role assigned to this account.</small></label>
        <label><span>Department</span><select value={userType === 'SUPER_ADMIN' ? '' : department} onChange={(event) => { setDepartment(event.target.value); setError(''); }} aria-label='Select account department' required={userType !== 'SUPER_ADMIN'} disabled={userType === 'SUPER_ADMIN' || !departments.length}>{userType === 'SUPER_ADMIN' ? <option value=''>University administration</option> : departments.map((item) => <option value={item._id} key={item._id}>{item.name} ({item.code})</option>)}</select><small>{userType === 'SUPER_ADMIN' ? 'Administrators are not limited to one department.' : 'Select the department assigned to your account.'}</small></label>
        <label><span>MTU email or username</span><input type='text' value={identifier} onChange={(event) => setIdentifier(event.target.value.toLowerCase())} autoComplete='username' autoCapitalize='none' spellCheck='false' placeholder='name@mtu.edu.et or assigned username' aria-describedby='username-help' autoFocus required /><small id='username-help'>Use your institutional email or the username assigned by your Super Admin or HOD.</small></label>
        <label><span>Password</span><div className='password-input'><input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete='current-password' placeholder='Enter your password' required /><button type='button' onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide password' : 'Show password'} title={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
        {error && <div className='error-message' role='alert'>{error}</div>}
        <button className='primary-action' disabled={busy}><LogIn size={18} /> {busy ? 'Signing in...' : 'Sign in'}</button>
      </form>
      <PasswordRecovery defaultEmail={identifier.includes('@') ? identifier : ''} />
      <div className='demo-hint'><ShieldCheck size={18} /><span>Super Admins manage all accounts. HODs manage instructors and students in their own departments.</span></div>
      <div className='secure-note'><Sparkles size={15} /><span>Modernized for MTU academic evaluation workflows. Designed by Dawit Mamo</span></div>
    </section>
  </main>;
}
