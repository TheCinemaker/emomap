import React, { useEffect, useMemo, useState } from 'react';
import { EMOTIONS } from './emotions';
import { supabase } from './supabaseClient';
import { MapView } from './MapView';
import { useEmotionsPolling } from './useEmotionsPolling';
import { useEmotionsStats } from './useEmotionsStats';

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
  const [gpsAllowed, setGpsAllowed] = useState(null);
  const [coords, setCoords] = useState(null);
  const [lastVoteAt, setLastVoteAt] = useState(null);
  const [events, setEvents] = useState([]);

  const [mapBounds, setMapBounds] = useState(null);
  const [pulseBatch, setPulseBatch] = useState([]);

  // ÚJ RÉSZ: A MŰKÖDŐ VISSZASZÁMLÁLÓHOZ
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, []);
  // ÚJ RÉSZ VÉGE

  const stats = useEmotionsStats(mapBounds, SESSION_ID);

  useEmotionsPolling(mapBounds, SESSION_ID, (batch) => {
    setPulseBatch((prev) => {
      const merged = [...prev, ...batch];
      return merged.slice(-100);
    });
  });

  useEffect(() => {
    const id = getOrCreateUserId();
    setUserId(id);
  }, []);

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setGpsAllowed(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Math.round(pos.coords.latitude * 1000) / 1000;
        const lng = Math.round(pos.coords.longitude * 1000) / 1000;
        setCoords({ lat, lng });
        setGpsAllowed(true);
      },
      (err) => {
        console.error('GPS error:', err);
        setGpsAllowed(false);
      },
      {
        enableHighAccuracy: false,
        timeout: 8000
      }
    );
  }, []);

  // MÓDOSÍTOTT RÉSZ: A 'now'-t használja a számításhoz
  const msSinceLastVote = useMemo(() => {
    if (!lastVoteAt) return Infinity;
    return now - lastVoteAt;
  }, [lastVoteAt, now]);
  // MÓDOSÍTOTT RÉSZ VÉGE

  const canVote = gpsAllowed === true && msSinceLastVote >= RATE_LIMIT_MS;

  async function handleVote(emotionId) {
    if (!canVote) return;
    if (!coords || !userId) return;

    const event = {
      user_id: userId,
      session_id: SESSION_ID,
      emotion: emotionId,
      lat: coords.lat,
      lng: coords.lng
    };

    try {
      const { data, error } = await supabase
        .from('emotions')
        .insert(event)
        .select();

      if (error) {
        console.error('Supabase insert error:', error);
        return;
      }

      const inserted = data?.[0];
      console.log('EVENT STORED:', inserted || event);

      setEvents((prev) => [...prev, inserted || event]);
      setLastVoteAt(Date.now());

      setPulseBatch([inserted || { ...event, lat: coords.lat, lng: coords.lng }]);
    } catch (err) {
      console.error('Unexpected insert error:', err);
    }
  }

  const remainingMs = Math.max(0, RATE_LIMIT_MS - msSinceLastVote);
  const remainingSec = Math.ceil(remainingMs / 1000);

  return (
    <div className="app-root">
      <header className="app-header">
        <div className="app-title">EmoMap – Heatmap of Emotions</div>
        <div className="app-session">session: {SESSION_ID}</div>
      </header>

      <main className="app-main">
        <div className="map-wrapper">
          <MapView
            coords={coords}
            onBoundsChange={setMapBounds}
            pulses={pulseBatch}
          />
          <div className="status-overlay">
            <div>
              <strong>User:</strong> {userId || 'loading...'}
            </div>
            <div>
              <strong>Location:</strong>{' '}
              {gpsAllowed === null
                ? 'requesting...'
                : gpsAllowed
                ? `${coords?.lat}, ${coords?.lng}`
                : 'denied'}
            </div>
            <div>
              <strong>Vote:</strong>{' '}
              {gpsAllowed !== true
                ? 'enable location'
                : canVote
                ? 'you can vote now'
                : `wait ${remainingSec}s`}
            </div>
            <div style={{ marginTop: 4, fontSize: 10, opacity: 0.9 }}>
              <strong>Area:</strong>{' '}
              {stats.loading
                ? 'loading...'
                : `24h: ${stats.last24h} · 7d: ${stats.last7d} · all: ${stats.all}`}
            </div>
          </div>
        </div>

        <div className="app-footer">
          <p style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>
            Select how you feel. You can send one pulse every 2 minutes from your
            current location.
          </p>
          <div className="emotion-buttons">
            {EMOTIONS.map((e) => (
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
    </div>
  );
}
