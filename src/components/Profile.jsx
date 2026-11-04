// src/components/Profile.jsx
// A real profile screen — avatar, username, membership stats, language,
// logout — split out of what used to be a cramped debug-info panel that
// mixed user settings with map/location debug info.
import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { LANGUAGES } from '../i18n';
import { IconUser } from './Icons';

const LOCALE_BY_LANG = { hu: 'hu-HU', de: 'de-DE', en: 'en-US' };

export default function Profile({ userId, lang, setLang, t, onClose, onLogout, onOpenFriends, onOpenDetails }) {
  const [profile, setProfile] = useState(null);
  const [voteCount, setVoteCount] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [{ data: profileData }, { count }] = await Promise.all([
        supabase.from('profiles').select('username, avatar_url, created_at').eq('id', userId).single(),
        supabase.from('emotions').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      ]);
      if (cancelled) return;
      setProfile(profileData);
      setVoteCount(count ?? 0);
    }
    if (userId) load();
    return () => { cancelled = true; };
  }, [userId]);

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;

    setUploading(true);
    setError(null);
    try {
      const ext = file.name.split('.').pop();
      const path = `${userId}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
      // Cache-bust so the new image shows immediately instead of the old cached one.
      const bustedUrl = `${publicUrl}?v=${Date.now()}`;

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: bustedUrl })
        .eq('id', userId);
      if (updateError) throw updateError;

      setProfile((p) => ({ ...p, avatar_url: bustedUrl }));
    } catch (err) {
      console.error('Avatar upload failed:', err);
      setError(err.message || t('profile_avatar_error'));
    } finally {
      setUploading(false);
      e.target.value = null;
    }
  };

  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString(LOCALE_BY_LANG[lang] || 'en-US', { year: 'numeric', month: 'long' })
    : null;

  return (
    <div className="profile-overlay" onClick={onClose}>
      <div className="profile-panel" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="profile-close" onClick={onClose}>×</button>

        <label className="profile-avatar" title={t('profile_avatar_change')}>
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="profile-avatar-img" />
          ) : (
            <IconUser className="profile-avatar-fallback" width={40} height={40} aria-hidden />
          )}
          <span className="profile-avatar-edit">{uploading ? '…' : '✎'}</span>
          <input type="file" accept="image/*" onChange={handleAvatarChange} disabled={uploading} />
        </label>

        <h2 className="profile-username">{profile?.username || '—'}</h2>
        {memberSince && <p className="profile-meta">{t('profile_member_since', { date: memberSince })}</p>}
        {error && <div className="profile-error">{error}</div>}

        <div className="profile-stat">
          <span className="profile-stat-value">{voteCount ?? '…'}</span>
          <span className="profile-stat-label">{t('profile_total_votes')}</span>
        </div>

        <div className="profile-lang-row">
          {LANGUAGES.map((code) => (
            <button
              key={code}
              type="button"
              className={`info-lang-btn${lang === code ? ' is-active' : ''}`}
              onClick={() => setLang(code)}
            >
              {code.toUpperCase()}
            </button>
          ))}
        </div>

        <button type="button" className="profile-friends-btn" onClick={onOpenFriends}>
          {t('friends_open')}
        </button>
        <button type="button" className="profile-friends-btn" onClick={onOpenDetails}>
          {t('details_open')}
        </button>
        <button type="button" className="profile-logout" onClick={onLogout}>{t('logout')}</button>
      </div>
    </div>
  );
}
