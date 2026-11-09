// src/components/FriendsPage.jsx
// Full-screen Messenger/Snapchat-style friends + chat page (replaced the
// old Friends.jsx modal — explicit user feedback: "ha ez modalban van,
// rohadt béna!"). One search bar finds both existing friends (tap → chat
// instantly) and new people (tap → send a request). The conversation list
// sorts whoever you're actively chatting with or just became friends with
// to the top, like a real messenger inbox — not an alphabetical directory.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFriends } from '../useFriends';
import { useChat, useConversationPreviews } from '../useChat';
import { EMOTIONS } from '../emotions';
import { IconUser, IconArrowLeft, IconSearch, IconCheck, IconClose } from './Icons';

const EMOTION_COLOR_BY_ID = EMOTIONS.reduce((acc, e) => ({ ...acc, [e.id]: e.color }), {});

function minutesAgo(iso) {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
}

function timeShort(iso) {
  const mins = minutesAgo(iso);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function Avatar({ profile, online, moodColor, size = 48 }) {
  return (
    <div className="fp-avatar-wrap" style={{ width: size, height: size }}>
      <div
        className="fp-avatar"
        style={{
          backgroundImage: profile?.avatar_url ? `url(${profile.avatar_url})` : undefined,
          boxShadow: moodColor ? `0 0 0 3px ${moodColor}` : undefined,
        }}
      >
        {!profile?.avatar_url && <IconUser width={size * 0.45} height={size * 0.45} />}
      </div>
      {online && <span className="fp-online-dot" aria-hidden />}
    </div>
  );
}

// ── Inline chat view (replaces the list, not an overlay) ────────────────────
function InlineChat({ userId, friend, t, onBack, online, moodLabel }) {
  const { messages, loading, sending, send } = useChat(userId, friend.otherId);
  const [draft, setDraft] = useState('');
  const listRef = useRef(null);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const text = draft;
    setDraft('');
    await send(text);
  };

  return (
    <section className="friends-page fp-chat-view" aria-label="Chat">
      <div className="fp-chat-header">
        <button type="button" className="fp-icon-btn" onClick={onBack} aria-label={t('chat_back')}>
          <IconArrowLeft width={20} height={20} />
        </button>
        <Avatar profile={friend.profile} online={online} size={36} />
        <div className="fp-chat-header-info">
          <span className="fp-chat-header-name">{friend.profile?.username || '—'}</span>
          {moodLabel && <span className="fp-chat-header-mood">{moodLabel}</span>}
        </div>
      </div>

      <div className="chat-messages" ref={listRef}>
        {loading && <p className="chat-empty">…</p>}
        {!loading && messages.length === 0 && <p className="chat-empty">{t('chat_empty')}</p>}
        {messages.map((m) => (
          <div key={m.id} className={`chat-bubble${m.sender_id === userId ? ' mine' : ''}`}>
            {m.body}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="chat-input-row">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t('chat_placeholder')}
          maxLength={2000}
          autoFocus
        />
        <button type="submit" disabled={sending || !draft.trim()}>{t('chat_send')}</button>
      </form>
    </section>
  );
}

export default function FriendsPage({ userId, t, onlineIds, onOpenDetails }) {
  const { friends, incoming, outgoing, loading, searchUsers, sendRequestTo, respond, removeFriend, cancelRequest } = useFriends(userId);
  const friendIds = useMemo(() => friends.map((f) => f.otherId), [friends]);
  const previews = useConversationPreviews(userId, friendIds);

  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [sendingId, setSendingId] = useState(null);
  const [error, setError] = useState(null);
  const [activeChat, setActiveChat] = useState(null); // friend entry | null
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
      setResults(found);
      setSearching(false);
    }, 350);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Most-recently-chatted (or most-recently-became-friends, for a friend
  // with no messages yet) bubbles to the top — a real inbox order, not
  // alphabetical. This directly implements the "új barátok is az első
  // helyre kerülnek... akivel beszélek az felugrik az első helyre" ask.
  const sortedFriends = useMemo(() => {
    return [...friends].sort((a, b) => {
      const aAt = previews[a.otherId]?.lastAt || a.sinceAt;
      const bAt = previews[b.otherId]?.lastAt || b.sinceAt;
      return new Date(bAt) - new Date(aAt);
    });
  }, [friends, previews]);

  const handleSend = async (targetId) => {
    setError(null);
    setSendingId(targetId);
    try {
      await sendRequestTo(targetId);
    } catch (err) {
      setError(
        err.message === 'already_requested' ? t('friends_add_error_already')
        : err.message === 'rate_limited' ? t('friends_add_error_rate_limited')
        : t('friends_add_error_generic')
      );
    } finally {
      setSendingId(null);
    }
  };

  if (activeChat) {
    const mood = activeChat.mood;
    const moodLabel = mood
      ? `${t(`emotion_${mood.emotion}`)} · ${t('friends_mood_ago', { m: minutesAgo(mood.inserted_at) })}`
      : onlineIds.has(activeChat.otherId) ? t('friends_online') : null;
    return (
      <InlineChat
        userId={userId}
        friend={activeChat}
        t={t}
        onBack={() => setActiveChat(null)}
        online={onlineIds.has(activeChat.otherId)}
        moodLabel={moodLabel}
      />
    );
  }

  const isSearching = search.trim().length >= 2;

  return (
    <section className="friends-page" aria-label="Friends">
      <div className="fp-topbar">
        <h2 className="fp-title">{t('friends_title')}</h2>
        <div className="fp-search-wrap">
          <IconSearch width={16} height={16} className="fp-search-icon" />
          <input
            type="text"
            className="fp-search-input"
            placeholder={t('friends_search_placeholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {error && <div className="friends-msg friends-msg-error">{error}</div>}

      {isSearching ? (
        <div className="fp-list">
          {searching && <p className="friends-empty">…</p>}
          {!searching && results.length === 0 && <p className="friends-empty">{t('friends_add_error_not_found')}</p>}
          {results.map((p) => {
            const friendEntry = friends.find((f) => f.otherId === p.id);
            const pending = knownIds.has(p.id) && !friendEntry;
            return (
              <div
                key={p.id}
                className="fp-row"
                onClick={() => friendEntry && setActiveChat(friendEntry)}
                role={friendEntry ? 'button' : undefined}
              >
                <Avatar profile={p} online={onlineIds.has(p.id)} moodColor={null} />
                <div className="fp-row-main">
                  <span className="fp-row-name">{p.username}</span>
                </div>
                {friendEntry ? (
                  <span className="fp-row-chat-hint">{t('chat_open')}</span>
                ) : pending ? (
                  <span className="friends-row-pending">{t('friends_outgoing_pending')}</span>
                ) : (
                  <button
                    type="button"
                    className="friends-btn primary"
                    disabled={sendingId === p.id}
                    onClick={(e) => { e.stopPropagation(); handleSend(p.id); }}
                  >
                    {sendingId === p.id ? '…' : t('friends_add_submit')}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="fp-list">
          {incoming.length > 0 && (
            <div className="fp-requests-row">
              {incoming.map((req) => (
                <div key={req.friendshipId} className="fp-request-chip">
                  <Avatar profile={req.profile} online={false} size={40} />
                  <span className="fp-request-name">{req.profile?.username || '—'}</span>
                  <div className="fp-request-actions">
                    <button type="button" className="fp-icon-btn accept" onClick={() => respond(req.friendshipId, true)} aria-label={t('friends_accept')}>
                      <IconCheck width={15} height={15} />
                    </button>
                    <button type="button" className="fp-icon-btn decline" onClick={() => respond(req.friendshipId, false)} aria-label={t('friends_decline')}>
                      <IconClose width={15} height={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && sortedFriends.length === 0 && <p className="friends-empty">{t('friends_empty')}</p>}

          {sortedFriends.map((f) => {
            const preview = previews[f.otherId];
            const moodColor = f.mood ? EMOTION_COLOR_BY_ID[f.mood.emotion] : null;
            const online = onlineIds.has(f.otherId);
            return (
              <div key={f.friendshipId} className="fp-row" onClick={() => setActiveChat(f)} role="button">
                <Avatar profile={f.profile} online={online} moodColor={moodColor} />
                <div className="fp-row-main">
                  <div className="fp-row-top">
                    <span className="fp-row-name">{f.profile?.username || '—'}</span>
                    {preview?.lastAt && <span className="fp-row-time">{timeShort(preview.lastAt)}</span>}
                  </div>
                  <span className={`fp-row-preview${preview?.unreadCount ? ' is-unread' : ''}`}>
                    {preview?.lastMessage
                      ? preview.lastMessage
                      : f.mood
                      ? `${t(`emotion_${f.mood.emotion}`)} · ${t('friends_mood_ago', { m: minutesAgo(f.mood.inserted_at) })}`
                      : t('friends_say_hi')}
                  </span>
                </div>
                {preview?.unreadCount > 0 && <span className="fp-unread-badge">{preview.unreadCount}</span>}
                <button
                  type="button"
                  className="fp-icon-btn fp-info-btn"
                  onClick={(e) => { e.stopPropagation(); onOpenDetails?.(f.otherId, f.profile?.username); }}
                  title={t('details_open')}
                  aria-label={t('details_open')}
                >
                  <IconUser width={14} height={14} />
                </button>
              </div>
            );
          })}

          {outgoing.length > 0 && (
            <div className="fp-section">
              <h3 className="friends-section-title">{t('friends_outgoing_title')}</h3>
              {outgoing.map((req) => (
                <div key={req.friendshipId} className="fp-row">
                  <Avatar profile={req.profile} online={false} />
                  <div className="fp-row-main">
                    <span className="fp-row-name">{req.profile?.username || '—'}</span>
                  </div>
                  <span className="friends-row-pending">{t('friends_outgoing_pending')}</span>
                  <button type="button" className="fp-icon-btn decline" onClick={() => cancelRequest(req.friendshipId)} aria-label={t('friends_cancel')}>
                    <IconClose width={14} height={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
