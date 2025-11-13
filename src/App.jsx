// src/App.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { EMOTIONS } from './emotions';

const SESSION_ID = 'global';
const RATE_LIMIT_MS = 2 * 60 * 1000; // 2 perc

function getOrCreateUserId() {
  if (typeof window === 'undefined') return null;
  const key = 'emotionglobe_user_id';
  let id = window.localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID?.() ?? `user_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(key, id);
  }
  return id;
}

export default function App() {
  const [userId, setUserId] = useState(null);
  const [gpsAllowed, setGpsAllowed] = useState(null); // null = még nem tudjuk, true/false
  const [coords, setCoords] = useState(null); // { lat, lng }
  const [lastVoteAt, setLastVoteAt] = useState(null);
  const [events, setEvents] = useState([]); // csak lokális debughoz

  // userId init
  useEffect(() => {
    const id = getOrCreateUserId();
    setUserId(id);
  }, []);

  // GPS bekérés induláskor
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
        console.error('GPS hiba:', err);
        setGpsAllowed(false);
      },
      {
        enableHighAccuracy: false,
        timeout: 8000
      }
    );
  }, []);

  // hány ms telt el az utolsó szavazás óta
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

    // Itt később: elküldjük Supabase-nek / backendnek
    console.log('EVENT SENT:', event);

    // lokális state-be is betesszük debug/összesítés miatt
    setEvents(prev => [...prev, event]);
    setLastVoteAt(Date.now());
  }

  // visszaszámláló szöveg (2 perc korlát)
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
            <strong>User ID:</strong> {userId || 'betöltés...'}
          </div>
          <div>
            <strong>GPS:</strong>{' '}
            {gpsAllowed === null
              ? 'engedély kérve...'
              : gpsAllowed
              ? `OK (${coords?.lat}, ${coords?.lng})`
              : 'Nincs engedély – szavazni nem tudsz'}
          </div>
          <div>
            <strong>Szavazási limit:</strong>{' '}
            {gpsAllowed !== true
              ? 'előbb engedélyezd a helyhozzáférést'
              : canVote
              ? 'szavazhatsz most'
              : `várj még ${remainingSec} mp-et`}
          </div>
          <div>
            <strong>Lokális eventek száma:</strong> {events.length}
          </div>
        </div>

        <div>
          <p style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>
            Válassz egy érzést, és 2 percenként egyszer “rezeghetsz” a saját
            pozíciódról.
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
          💡 Jelenleg az események csak a konzolra mennek (EVENT SENT). Következő
          lépés: bekötjük a real-time backendet és a térképet.
        </div>
      </footer>
    </div>
  );
}
