import { useEffect, useState } from 'react';
import { Camera, KeyRound, Save, Trash2, Upload } from 'lucide-react';
import { changePassword, deleteProfilePhoto, updateProfile, uploadProfilePhoto } from '../api/client.js';
import { ProfileAvatar } from '../components/ProfileAvatar.jsx';
import { useAuth } from '../context/AuthContext.jsx';

function requestMessage(error, fallback) {
  return error.response?.data?.message || fallback;
}

export function ProfilePage() {
  const { user, setCurrentUser } = useAuth();
  const [values, setValues] = useState({ firstName: '', lastName: '', phone: '', bio: '' });
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    setValues({ firstName: user.firstName || '', lastName: user.lastName || '', phone: user.phone || '', bio: user.bio || '' });
  }, [user]);

  const change = (field, value) => setValues((current) => ({ ...current, [field]: value }));
  const save = async (event) => {
    event.preventDefault(); setBusy('profile'); setError(''); setMessage('');
    try {
      const result = await updateProfile(values);
      setCurrentUser(result.user);
      setMessage(result.message);
    } catch (requestError) {
      setError(requestMessage(requestError, 'Your profile could not be updated.'));
    } finally {
      setBusy('');
    }
  };

  const upload = async () => {
    if (!photo) return;
    if (photo.size > 2 * 1024 * 1024) {
      setError('Profile photo must be 2 MB or smaller.');
      return;
    }
    setBusy('photo'); setError(''); setMessage('');
    try {
      const result = await uploadProfilePhoto(photo);
      setCurrentUser(result.user);
      setPhoto(null);
      setMessage(result.message);
    } catch (requestError) {
      setError(requestMessage(requestError, 'Your profile photo could not be uploaded.'));
    } finally {
      setBusy('');
    }
  };

  const remove = async () => {
    if (!window.confirm('Remove your current profile photo?')) return;
    setBusy('remove'); setError(''); setMessage('');
    try {
      const result = await deleteProfilePhoto();
      setCurrentUser(result.user);
      setPhoto(null);
      setMessage(result.message);
    } catch (requestError) {
      setError(requestMessage(requestError, 'Your profile photo could not be removed.'));
    } finally {
      setBusy('');
    }
  };

  const savePassword = async (event) => {
    event.preventDefault(); setError(''); setMessage('');
    if (passwords.newPassword !== passwords.confirmPassword) {
      setError('The new passwords do not match.');
      return;
    }
    setBusy('password');
    try {
      const result = await changePassword(passwords.currentPassword, passwords.newPassword);
      setCurrentUser(result.user);
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setMessage(result.message);
    } catch (requestError) {
      setError(requestMessage(requestError, 'Your password could not be changed.'));
    } finally {
      setBusy('');
    }
  };
  const roleLabel = [user.role, ...(user.committeeRoles || [])].map((role) => role.replaceAll('_', ' ')).join(' / ');
  return <div className='profile-page'>
    {(error || message) && <div className='profile-feedback'>
      {error && <div className='error-message'>{error}</div>}
      {message && <div className='success-message'>{message}</div>}
    </div>}
    <section className='panel profile-photo-panel'>
      <div className='panel-title'><div><h2>Profile photo</h2><p>Upload a clear photo shown with your account.</p></div><Camera size={23} /></div>
      <ProfileAvatar user={user} className='profile-avatar-large' />
      <div className='profile-photo-controls'>
        <label className='profile-photo-file'><span>Select JPEG, PNG, or WebP</span><input type='file' accept='.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp' onChange={(event) => { setPhoto(event.target.files?.[0] || null); setError(''); }} /></label>
        <small>{photo ? `${photo.name} · ${(photo.size / 1024).toFixed(0)} KB` : 'Maximum file size: 2 MB'}</small>
        <div className='profile-photo-actions'>
          <button type='button' className='primary-action' onClick={upload} disabled={!photo || busy}><Upload size={17} />{busy === 'photo' ? 'Uploading...' : user.hasProfilePhoto ? 'Replace photo' : 'Upload photo'}</button>
          {user.hasProfilePhoto && <button type='button' className='secondary-action danger-action' onClick={remove} disabled={busy}><Trash2 size={17} />{busy === 'remove' ? 'Removing...' : 'Remove'}</button>}
        </div>
      </div>
    </section>

    <section className='panel profile-editor-panel'>
      <div className='panel-title'><div><h2>Edit your profile</h2><p>Update personal information visible in your account.</p></div><Save size={23} /></div>
      <form className='profile-editor-form' onSubmit={save}>
        <label><span>First name</span><input value={values.firstName} onChange={(event) => change('firstName', event.target.value)} minLength='2' maxLength='50' required /></label>
        <label><span>Last name</span><input value={values.lastName} onChange={(event) => change('lastName', event.target.value)} minLength='2' maxLength='50' required /></label>
        <label className='profile-phone'><span>Phone number</span><input type='tel' value={values.phone} onChange={(event) => change('phone', event.target.value)} maxLength='30' placeholder='+251...' /></label>
        <label className='profile-bio'><span>Bio</span><textarea value={values.bio} onChange={(event) => change('bio', event.target.value)} maxLength='500' placeholder='Add a short professional or academic bio.' /><small>{values.bio.length}/500 characters</small></label>
        <button className='primary-action' disabled={busy}><Save size={17} />{busy === 'profile' ? 'Saving...' : 'Save profile'}</button>
      </form>

      <div className='profile-controlled-fields'>
        <h3>Institution-controlled information</h3>
        <p>Contact an authorized administrator to change these academic identity fields.</p>
        <div className='profile-identity-grid'>
          <div><small>Login email</small><strong>{user.email}</strong></div>
          <div><small>Role</small><strong>{roleLabel}</strong></div>
          {(user.studentNumber || user.employeeNumber) && <div><small>Institutional ID</small><strong>{user.studentNumber || user.employeeNumber}</strong></div>}
          {user.yearLevel && <div><small>Year level</small><strong>Year {user.yearLevel}</strong></div>}
          {user.academicStream && <div><small>Academic stream</small><strong>{user.academicStream.replaceAll('_', ' ')}</strong></div>}
        </div>
      </div>
    </section>
    <section className='panel profile-password-panel'>
      <div className='panel-title'><div><h2>Password security</h2><p>Change your password without ending your current session.</p></div><KeyRound size={23} /></div>
      <form className='password-change-form' onSubmit={savePassword}>
        <label><span>Current password</span><input type='password' value={passwords.currentPassword} onChange={(event) => setPasswords((current) => ({ ...current, currentPassword: event.target.value }))} autoComplete='current-password' required /></label>
        <label><span>New password</span><input type='password' value={passwords.newPassword} onChange={(event) => setPasswords((current) => ({ ...current, newPassword: event.target.value }))} minLength='8' autoComplete='new-password' required /></label>
        <label><span>Confirm new password</span><input type='password' value={passwords.confirmPassword} onChange={(event) => setPasswords((current) => ({ ...current, confirmPassword: event.target.value }))} minLength='8' autoComplete='new-password' required /></label>
        <button className='primary-action' disabled={busy}><KeyRound size={17} />{busy === 'password' ? 'Changing...' : 'Change password'}</button>
      </form>
    </section>
  </div>;
}
