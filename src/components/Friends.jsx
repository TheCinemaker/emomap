// src/components/Friends.jsx
// Mutual friends: live, partial-match search (findable like on Facebook,
// not a blind exact-username submit), send/accept requests, see each
// friend's most recent mood only after they accept. Chat is a deliberate
// next phase, not here — it needs its own schema + realtime wiring.
import { useEffect, useRef, useState } from 'react';
import { useFriends } from '../useFriends';
import { EMOTIONS } from '../emotions';

const EMOTION_COLOR_BY_ID = EMOTIONS.reduce((acc, e) => ({ ...acc, [e.id]: e.color }), {});

function minutesAgo(iso) {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
}

export default function Friends({ userId, t, onClose }) {
  const { friends, incoming, outgoing, loading, searchUsers, sendRequestTo, respond, removeFriend, cancelRequest } = useFriends(userId);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [sendingId, setSendingId] = useState(null);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const debounceRef = useRef(null);

  const knownIds = new Set([
    ...friends.map((f) => f.otherId),
    ...incoming.map((f) => f.otherId),
    ...outgoing.map((f) => f.otherId),
  ]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (search.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      const found = await searchUsers(search);
      setResults(found.filter((p) => !knownIds.has(p.id)));
      setSearching(false);
    }, 350);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const handleSend = async (targetId) => {
    setError(null);
    setInfo(null);
    setSendingId(targetId);
    try {
      await sendRequestTo(targetId);
      setInfo(t('friends_add_sent'));
      setResults((r) => r.filter((p) => p.id !== targetId));
    } catch (err) {
      setError(err.message === 'already_requested' ? t('friends_add_error_already') : t('friends_add_error_generic'));
    } finally {
      setSendingId(null);
    }
  };

  return (
    <div className="friends-overlay" onClick={onClose}>
      <div className="friends-panel" onClick={(e) => e.stopPropagation()}>
        <div className="friends-header">
          <h2 className="friends-title">{t('friends_title')}</h2>
          <button type="button" className="friends-close" onClick={onClose}>×</button>
        </div>

        <div className="friends-add-form">
          <input
            type="text"
            placeholder={t('friends_add_placeholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {search.trim().length >= 2 && (
          <div className="friends-section friends-search-results">
            {searching && <p className="friends-empty">…</p>}
            {!searching && results.length === 0 && <p className="friends-empty">{t('friends_add_error_not_found')}</p>}
            {results.map((p) => (
              <div key={p.id} className="friends-row">
                <div className="friends-row-avatar" style={{ backgroundImage: p.avatar_url ? `url(${p.avatar_url})` : undefined }}>
                  {!p.avatar_url && '🙂'}
                </div>
                <span className="friends-row-name">{p.username}</span>
                <button type="button" className="friends-btn primary" disabled={sendingId === p.id} onClick={() => handleSend(p.id)}>
                  {sendingId === p.id ? '…' : t('friends_add_submit')}
                </button>
              </div>
            ))}
          </div>
        )}
        {error && <div className="friends-msg friends-msg-error">{error}</div>}
        {info && <div className="friends-msg friends-msg-info">{info}</div>}

        {incoming.length > 0 && (
          <div className="friends-section">
            <h3 className="friends-section-title">{t('friends_incoming_title')}</h3>
            {incoming.map((req) => (
              <div key={req.friendshipId} className="friends-row">
                <span className="friends-row-name">{req.profile?.username || '—'}</span>
                <div className="friends-row-actions">
                  <button type="button" className="friends-btn primary" onClick={() => respond(req.friendshipId, true)}>
                    {t('friends_accept')}
                  </button>
                  <button type="button" className="friends-btn" onClick={() => respond(req.friendshipId, false)}>
                    {t('friends_decline')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="friends-section">
          <h3 className="friends-section-title">{t('friends_list_title')}</h3>
          {!loading && friends.length === 0 && <p className="friends-empty">{t('friends_empty')}</p>}
          {friends.map((f) => {
            const moodColor = f.mood ? EMOTION_COLOR_BY_ID[f.mood.emotion] : null;
            return (
              <div key={f.friendshipId} className="friends-row">
                <div className="friends-row-avatar" style={{ backgroundImage: f.profile?.avatar_url ? `url(${f.profile.avatar_url})` : undefined }}>
                  {!f.profile?.avatar_url && '🙂'}
                </div>
                <div className="friends-row-info">
                  <span className="friends-row-name">{f.profile?.username || '—'}</span>
                  <span className="friends-row-mood">
                    {f.mood ? (
                      <>
                        <span className="friends-mood-dot" style={{ background: moodColor }} />
                        {t(`emotion_${f.mood.emotion}`)} · {t('friends_mood_ago', { m: minutesAgo(f.mood.inserted_at) })}
                      </>
                    ) : t('friends_mood_none')}
                  </span>
                </div>
                <button type="button" className="friends-row-remove" onClick={() => removeFriend(f.friendshipId)} title={t('friends_remove')}>×</button>
              </div>
            );
          })}
        </div>

        {outgoing.length > 0 && (
          <div className="friends-section">
            <h3 className="friends-section-title">{t('friends_outgoing_title')}</h3>
            {outgoing.map((req) => (
              <div key={req.friendshipId} className="friends-row">
                <span className="friends-row-name">{req.profile?.username || '—'}</span>
                <span className="friends-row-pending">{t('friends_outgoing_pending')}</span>
                <button type="button" className="friends-row-remove" onClick={() => cancelRequest(req.friendshipId)} title={t('friends_cancel')}>×</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
