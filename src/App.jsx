// src/App.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { EMOTIONS } from './emotions';

const SESSION_ID = 'global';
const RATE_LIMIT_MS = 2 * 60 * 1000; // 2 minutes

function getOrCreateUserId() {
  if (typeof window === 'undefined') return null;
  const key = 'emotionglobe_user_id';
  let id = window.localStorage.getItem(key);
  if (!id) {
    id =
      crypto.randomUUID?.() ??
      `user_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(key, id);
  }
  return id;
}

export default function App() {
  const [userId, setUserId] = useState(null);
  const [gpsAllowed, setGpsAllowed] = useState(null); // null = unknown, true/false
  const [coords, setCoords] = useState(null); // { lat, lng }
  const [lastVoteAt, setLastVoteAt] = useState(null);
  const [events, setEvents] = useState([]); // local debug only

  // init userId
  useEffect(() => {
    const id = getOrCreateUserId();
    setUserId(id);
  }, []);

  // ask for GPS on load
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setGpsAllowed(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        const lat = Math.round(pos.coords.latitude * 1000) / 1000;
        const lng = Math.round(pos.coords.longitude * 1000) / 1000;
        setCoords({ lat, lng });
        setGpsAllowed(true);
      },
      err => {
        console.error('GPS error:', err);
        setGpsAllowed(false);
      },
      {
        enableHighAccuracy: false,
        timeout: 8000
      }
    );
  }, []);

  // how much time since last vote
  const msSinceLastVote = useMemo(() => {
    if (!lastVoteAt) return Infinity;
    return Date.now() - lastVoteAt;
  }, [lastVoteAt]);

  const canVote = gpsAllowed === true && msSinceLastVote >= RATE_LIMIT_MS;

  async function handleVote(emotionId) {
    if (!canVote) return;
    if (!coords || !userId) return;

    const event = {
      userId,
      sessionId: SESSION_ID,
      emotion: emotionId,
      lat: coords.lat,
      lng: coords.lng,
      timestamp: new Date().toISOString()
    };

    // Later: send this to Supabase / backend
    console.log('EVENT SENT:', event);

    // local debug
    setEvents(prev => [...prev, event]);
    setLastVoteAt(Date.now());
  }

  const remainingMs = Math.max(0, RATE_LIMIT_MS - msSinceLastVote);
  const remainingSec = Math.ceil(remainingMs / 1000);

  return (
    <div className="app-root">
      <header className="app-header">
        <div className="app-title">Heatmap of Emotions</div>
        <div className="app-session">session: {SESSION_ID}</div>
      </header>

      <main className="app-main">
        <div className="status-box">
          <div>
            <strong>User ID:</strong> {userId || 'loading...'}
          </div>
          <div>
            <strong>Location:</strong>{' '}
            {gpsAllowed === null
              ? 'requesting permission...'
              : gpsAllowed
              ? `OK (${coords?.lat}, ${coords?.lng})`
              : 'Permission denied – you cannot vote'}
          </div>
          <div>
            <strong>Vote limit:</strong>{' '}
            {gpsAllowed !== true
              ? 'enable location to vote'
              : canVote
              ? 'you can vote now'
              : `wait ${remainingSec} seconds`}
          </div>
          <div>
            <strong>Local events:</strong> {events.length}
          </div>
        </div>

        <div>
          <p style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>
            Select how you feel. You can send one pulse every 2 minutes from
            your current location.
          </p>
          <div className="emotion-buttons">
            {EMOTIONS.map(e => (
              <button
                key={e.id}
                className={
                  'emotion-button' +
                  (!canVote || !coords || !userId ? ' disabled' : '')
                }
                onClick={() => handleVote(e.id)}
              >
                <span className="emoji">{e.label}</span>
                <span className="label">{e.name}</span>
              </button>
            ))}
          </div>
        </div>
      </main>

      <footer className="app-footer">
        <div style={{ fontSize: 10, opacity: 0.6 }}>
          💡 Right now events only go to the console (EVENT SENT). Next step:
          connect a real-time backend and the map.
        </div>
      </footer>
    </div>
  );
}
