import { useEffect, useState } from 'react';
import { getProfilePhoto } from '../api/client.js';

export function ProfileAvatar({ user, className = '' }) {
  const [photoUrl, setPhotoUrl] = useState('');

  useEffect(() => {
    let active = true;
    let objectUrl = '';
    if (!user?.id || !user.hasProfilePhoto) {
      setPhotoUrl('');
      return () => { active = false; };
    }
    getProfilePhoto(user.id).then((blob) => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob);
      setPhotoUrl(objectUrl);
    }).catch(() => {
      if (active) setPhotoUrl('');
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [user?.id, user?.hasProfilePhoto, user?.profilePhotoUpdatedAt]);

  const initials = [user?.firstName?.[0], user?.lastName?.[0]].filter(Boolean).join('').toUpperCase() || '?';
  return <span className={`profile-avatar ${className}`.trim()} aria-label={`${user?.name || 'User'} profile photo`}>
    {photoUrl ? <img src={photoUrl} alt='' /> : <strong>{initials}</strong>}
  </span>;
}
