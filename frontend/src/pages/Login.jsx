import { useEffect, useState } from 'react';
import { CheckCircle2, Eye, EyeOff, LogIn, Moon, ShieldCheck, Sparkles, Sun, UserPlus, UserRound } from 'lucide-react';
import { PasswordRecovery } from '../components/PasswordRecovery.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getLoginDepartments, signup } from '../api/client.js';
import { academicStreams, isEceDepartment } from '../utils/academicStreams.js';
import mtuLogo from '../assets/mtu-logo.png';

const userTypes = [
  ['SUPER_ADMIN', 'Administrator'],
  ['HOD', 'Head of Department (HOD)'],
  ['INSTRUCTOR', 'Instructor'],
  ['STUDENT', 'Student'],
  ['COURSE_EXAM_COMMITTEE', 'Course & Exam Committee']
];

const initialRegistration = {
  firstName: '', lastName: '', email: '', password: '', confirmPassword: '', role: 'STUDENT',
  department: '', studentNumber: '', yearLevel: '', academicStream: '', employeeNumber: ''
};

export function Login() {
  const { login, darkMode, setDarkMode } = useAuth();
  const [mode, setMode] = useState('login');
  const [userType, setUserType] = useState('SUPER_ADMIN');
  const [departments, setDepartments] = useState([]);
  const [department, setDepartment] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [registration, setRegistration] = useState(initialRegistration);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getLoginDepartments()
      .then((rows) => {
        setDepartments(rows);
        setDepartment((current) => current || rows[0]?._id || '');
        setRegistration((current) => ({ ...current, department: current.department || rows[0]?._id || '' }));
      })
      .catch(() => setError('Departments could not be loaded. Make sure the backend is running.'));
  }, []);

  const setAuthMode = (nextMode) => {
    setMode(nextMode);
    setError('');
    setMessage('');
    setShowPassword(false);
  };

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

  const submitRegistration = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    if (registration.password !== registration.confirmPassword) {
      setError('The passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const payload = { ...registration };
      delete payload.confirmPassword;
      if (payload.yearLevel) payload.yearLevel = Number(payload.yearLevel); else delete payload.yearLevel;
      if (!payload.studentNumber) delete payload.studentNumber;
      if (!payload.academicStream) delete payload.academicStream;
      if (!payload.employeeNumber) delete payload.employeeNumber;
      const result = await signup(payload);
      setMessage(result.message);
      setIdentifier(registration.email);
      setUserType(registration.role);
      setDepartment(registration.department);
      setRegistration({ ...initialRegistration, department: departments[0]?._id || '' });
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Registration could not be submitted.');
    } finally {
      setBusy(false);
    }
  };

  const selectedRegistrationDepartment = departments.find((item) => item._id === registration.department);
  const registrationNeedsStream = isEceDepartment(selectedRegistrationDepartment)
    && (registration.role === 'INSTRUCTOR' || (registration.role === 'STUDENT' && Number(registration.yearLevel) >= 4));

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
    <section className={`login-card${mode === 'register' ? ' registration-card' : ''}`}>
      <div className='login-brand'><img src={mtuLogo} alt='Mizan-Tepi University logo' /><div><strong>UAMIPES</strong><span>MTU Academic Management &amp; Evaluation</span></div></div>
      <div className='auth-mode-tabs' role='tablist' aria-label='Authentication options'>
        <button type='button' className={mode === 'login' ? 'active' : ''} onClick={() => setAuthMode('login')}><LogIn size={16} /> Sign in</button>
        <button type='button' className={mode === 'register' ? 'active' : ''} onClick={() => setAuthMode('register')}><UserPlus size={16} /> Register</button>
      </div>
      <div className='login-heading'><span className='login-heading-icon'>{mode === 'login' ? <UserRound size={21} /> : <UserPlus size={21} />}</span><div><h1>{mode === 'login' ? 'Sign in' : 'Create an account'}</h1><p>{mode === 'login' ? 'Use the credentials assigned to your account.' : 'Students and instructors can request access.'}</p></div></div>
      {mode === 'login' ? <>
        <form onSubmit={submitLogin}>
          <label><span>Login as</span><select value={userType} onChange={(event) => { const nextType = event.target.value; setUserType(nextType); if (nextType !== 'SUPER_ADMIN' && !department) setDepartment(departments[0]?._id || ''); setError(''); }} aria-label='Select account role'>{userTypes.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><small>Select the role assigned to this account.</small></label>
          <label><span>Department</span><select value={userType === 'SUPER_ADMIN' ? '' : department} onChange={(event) => { setDepartment(event.target.value); setError(''); }} aria-label='Select account department' required={userType !== 'SUPER_ADMIN'} disabled={userType === 'SUPER_ADMIN' || !departments.length}>{userType === 'SUPER_ADMIN' ? <option value=''>University administration</option> : departments.map((item) => <option value={item._id} key={item._id}>{item.name} ({item.code})</option>)}</select><small>{userType === 'SUPER_ADMIN' ? 'Administrators are not limited to one department.' : 'Select the department assigned to your account.'}</small></label>
          <label><span>MTU email or username</span><input type='text' value={identifier} onChange={(event) => setIdentifier(event.target.value.toLowerCase())} autoComplete='username' autoCapitalize='none' spellCheck='false' placeholder='name@mtu.edu.et or assigned username' aria-describedby='username-help' autoFocus required /><small id='username-help'>Use your institutional email or assigned username.</small></label>
          <label><span>Password</span><div className='password-input'><input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete='current-password' placeholder='Enter your password' required /><button type='button' onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
          {error && <div className='error-message' role='alert'>{error}</div>}
          {message && <div className='success-message' role='status'>{message}</div>}
          <button className='primary-action' disabled={busy}><LogIn size={18} /> {busy ? 'Signing in...' : 'Sign in'}</button>
        </form>
        <PasswordRecovery defaultEmail={identifier.includes('@') ? identifier : ''} />
      </> : <form className='registration-form' onSubmit={submitRegistration}>
        <div className='auth-name-row'>
          <label><span>First name</span><input value={registration.firstName} onChange={(event) => setRegistration({ ...registration, firstName: event.target.value })} autoComplete='given-name' required /></label>
          <label><span>Last name</span><input value={registration.lastName} onChange={(event) => setRegistration({ ...registration, lastName: event.target.value })} autoComplete='family-name' required /></label>
        </div>
        <label><span>Account type</span><select value={registration.role} onChange={(event) => setRegistration({ ...registration, role: event.target.value, studentNumber: '', yearLevel: '', employeeNumber: '', academicStream: '' })}><option value='STUDENT'>Student</option><option value='INSTRUCTOR'>Instructor</option></select></label>
        <label><span>Department</span><select value={registration.department} onChange={(event) => setRegistration({ ...registration, department: event.target.value, academicStream: '' })} required><option value='' disabled>Select department</option>{departments.map((item) => <option value={item._id} key={item._id}>{item.name} ({item.code})</option>)}</select></label>
        {registration.role === 'STUDENT' ? <>
          <label><span>Student number</span><input value={registration.studentNumber} onChange={(event) => setRegistration({ ...registration, studentNumber: event.target.value })} placeholder='Student ID number' required /></label>
          <label><span>Grade / year level</span><select value={registration.yearLevel} onChange={(event) => setRegistration({ ...registration, yearLevel: event.target.value, academicStream: Number(event.target.value) >= 4 ? registration.academicStream : '' })} required><option value='' disabled>Select year</option>{[2, 3, 4, 5].map((year) => <option value={year} key={year}>Year {year}</option>)}</select></label>
        </> : <label><span>Employee number</span><input value={registration.employeeNumber} onChange={(event) => setRegistration({ ...registration, employeeNumber: event.target.value })} placeholder='Staff ID number (optional)' /></label>}
        {registrationNeedsStream && <label><span>Branch / stream</span><select value={registration.academicStream} onChange={(event) => setRegistration({ ...registration, academicStream: event.target.value })} required><option value='' disabled>Select stream</option>{academicStreams.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>}
        <label className='registration-email'><span>MTU email</span><input type='email' value={registration.email} onChange={(event) => setRegistration({ ...registration, email: event.target.value.toLowerCase() })} pattern='.+@mtu[.]edu[.]et' title='Use an @mtu.edu.et email address' autoComplete='email' placeholder='name@mtu.edu.et' required /></label>
        <label><span>Password</span><input type={showPassword ? 'text' : 'password'} value={registration.password} onChange={(event) => setRegistration({ ...registration, password: event.target.value })} minLength='8' autoComplete='new-password' required /></label>
        <label><span>Confirm password</span><div className='password-input'><input type={showPassword ? 'text' : 'password'} value={registration.confirmPassword} onChange={(event) => setRegistration({ ...registration, confirmPassword: event.target.value })} minLength='8' autoComplete='new-password' required /><button type='button' onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide passwords' : 'Show passwords'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
        {error && <div className='error-message' role='alert'>{error}</div>}
        {message && <div className='success-message' role='status'><CheckCircle2 size={18} />{message}</div>}
        <button className='primary-action' disabled={busy || !departments.length}><UserPlus size={18} />{busy ? 'Submitting...' : 'Submit registration'}</button>
      </form>}
      <div className='demo-hint'><ShieldCheck size={18} /><span>New registrations must be verified by the department HOD or a Super Admin before sign-in.</span></div>
      <div className='secure-note'><Sparkles size={15} /><span>Modernized for MTU academic evaluation workflows. Designed by Dawit Mamo</span></div>
    </section>
  </main>;
}
