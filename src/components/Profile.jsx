// src/components/Profile.jsx
// A real profile screen — avatar, username, membership stats, language,
// logout — split out of what used to be a cramped debug-info panel that
// mixed user settings with map/location debug info.
import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { LANGUAGES } from '../i18n';
import { IconUser } from './Icons';
import { compressImage } from '../imageCompress';

const LOCALE_BY_LANG = { hu: 'hu-HU', de: 'de-DE', en: 'en-US' };
const DAY_MS = 24 * 60 * 60 * 1000;
const STREAK_SAMPLE_LIMIT = 400; // plenty for any realistic streak length

// dates: unique 'YYYY-MM-DD' strings, sorted descending (today-first).
// Counts consecutive days ending today — or ending yesterday if today's
// vote hasn't happened yet, so the streak doesn't look "broken" at 00:01.
function computeStreak(dates) {
  if (!dates.length) return 0;
  const todayStr = new Date().toISOString().slice(0, 10);
  let cursor = new Date(`${todayStr}T00:00:00Z`);
  if (dates[0] !== todayStr) cursor = new Date(cursor.getTime() - DAY_MS);

  let streak = 0;
  for (const d of dates) {
    const cursorStr = cursor.toISOString().slice(0, 10);
    if (d === cursorStr) {
      streak += 1;
      cursor = new Date(cursor.getTime() - DAY_MS);
    } else if (d < cursorStr) {
      break;
    }
  }
  return streak;
}

export default function Profile({ userId, lang, setLang, t, onClose, onLogout, onOpenFriends, onOpenDetails }) {
  const [profile, setProfile] = useState(null);
  const [voteCount, setVoteCount] = useState(null);
  const [streak, setStreak] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [{ data: profileData }, { count }, { data: recentVotes }] = await Promise.all([
        supabase.from('profiles').select('username, avatar_url, created_at').eq('id', userId).single(),
        supabase.from('emotions').select('id', { count: 'exact', head: true }).eq('user_id', userId),
        supabase.from('emotions').select('inserted_at').eq('user_id', userId)
          .order('inserted_at', { ascending: false }).limit(STREAK_SAMPLE_LIMIT),
      ]);
      if (cancelled) return;
      setProfile(profileData);
      setVoteCount(count ?? 0);
      const dates = [...new Set((recentVotes || []).map((r) => r.inserted_at.slice(0, 10)))];
      setStreak(computeStreak(dates));
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
      const compressed = await compressImage(file, { maxDim: 600, quality: 0.85 });
      const path = `${userId}/avatar.jpg`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, compressed, { upsert: true, contentType: 'image/jpeg' });
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

        <div className="profile-stats-row">
          <div className="profile-stat">
            <span className="profile-stat-value">{voteCount ?? '…'}</span>
            <span className="profile-stat-label">{t('profile_total_votes')}</span>
          </div>
          {streak > 0 && (
            <div className="profile-stat">
              <span className="profile-stat-value">🔥 {streak}</span>
              <span className="profile-stat-label">{t('profile_streak')}</span>
            </div>
          )}
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
