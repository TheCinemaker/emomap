// src/components/Chat.jsx
import { useEffect, useRef, useState } from 'react';
import { useChat } from '../useChat';

export default function Chat({ userId, friendId, friendName, t, onClose }) {
  const { messages, loading, sending, send } = useChat(userId, friendId);
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
    <div className="chat-overlay" onClick={onClose}>
      <div className="chat-panel" onClick={(e) => e.stopPropagation()}>
        <div className="chat-header">
          <span className="chat-header-name">{friendName || '—'}</span>
          <button type="button" className="chat-close" onClick={onClose}>×</button>
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
      </div>
    </div>
  );
}
