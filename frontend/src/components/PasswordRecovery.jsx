import { useState } from 'react';
import { KeyRound, Mail, RotateCcw } from 'lucide-react';
import { requestPasswordReset, resetPassword } from '../api/client.js';

function responseMessage(error, fallback) {
  return error.response?.data?.message || fallback;
}

export function PasswordRecovery({ defaultEmail = '' }) {
  const initialToken = new URLSearchParams(window.location.search).get('resetToken') || '';
  const [open, setOpen] = useState(Boolean(initialToken));
  const [step, setStep] = useState(initialToken ? 'reset' : 'request');
  const [email, setEmail] = useState(defaultEmail);
  const [token, setToken] = useState(initialToken);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const requestReset = async (event) => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const result = await requestPasswordReset(email);
      setMessage(result.developmentMessage || result.message);
      if (result.resetToken) {
        setToken(result.resetToken);
        setStep('reset');
      }
    } catch (requestError) {
      setError(responseMessage(requestError, 'The password reset request could not be completed.'));
    } finally {
      setBusy(false);
    }
  };

  const completeReset = async (event) => {
    event.preventDefault(); setError(''); setMessage('');
    if (newPassword !== confirmPassword) {
      setError('The new passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const result = await resetPassword(token, newPassword);
      setMessage(result.message);
      setNewPassword(''); setConfirmPassword(''); setToken('');
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch (requestError) {
      setError(responseMessage(requestError, 'The password could not be reset.'));
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return <button type='button' className='text-action password-recovery-toggle' onClick={() => { setOpen(true); setEmail(defaultEmail); }}><KeyRound size={16} />Forgot your password?</button>;
  }

  return <section className='password-recovery' aria-label='Password recovery'>
    <div className='password-recovery-heading'>
      <div><strong>{step === 'request' ? 'Reset your password' : 'Set a new password'}</strong><small>{step === 'request' ? 'Request a secure, time-limited reset token.' : 'Use the token you received to choose a new password.'}</small></div>
      <button type='button' className='text-action' onClick={() => { setOpen(false); setError(''); setMessage(''); }}>Back to sign in</button>
    </div>
    {step === 'request' ? <form className='password-recovery-form' onSubmit={requestReset}>
      <label><span>MTU email address</span><input type='email' value={email} onChange={(event) => setEmail(event.target.value)} pattern='.+@mtu[.]edu[.]et' title='Use an @mtu.edu.et email address' required /></label>
      <button className='secondary-action' disabled={busy}><Mail size={17} />{busy ? 'Preparing...' : 'Request reset'}</button>
    </form> : <form className='password-recovery-form' onSubmit={completeReset}>
      <label><span>Reset token</span><input value={token} onChange={(event) => setToken(event.target.value.trim())} minLength='32' autoComplete='one-time-code' required /></label>
      <label><span>New password</span><input type='password' value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength='8' autoComplete='new-password' required /></label>
      <label><span>Confirm new password</span><input type='password' value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength='8' autoComplete='new-password' required /></label>
      <button className='secondary-action' disabled={busy}><RotateCcw size={17} />{busy ? 'Resetting...' : 'Reset password'}</button>
      <button type='button' className='text-action' onClick={() => { setStep('request'); setToken(''); setError(''); setMessage(''); }}>Request another token</button>
    </form>}
    {error && <div className='error-message' role='alert'>{error}</div>}
    {message && <div className='success-message' role='status'>{message}</div>}
  </section>;
}
