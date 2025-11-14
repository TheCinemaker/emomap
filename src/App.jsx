// src/App.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { EMOTIONS } from './emotions';
import { supabase } from './supabaseClient';
import { MapView } from './MapView';
import { useEmotionsPolling } from './useEmotionsPolling';
import { useEmotionsStats } from './useEmotionsStats';

const SESSION_ID = 'global';
const RATE_LIMIT_MS = 2 * 60 * 1000; // 2 minutes

// DEV mód: ?dev=1 az URL-ben
const DEV_MODE =
  typeof window !== 'undefined' &&
  window.location.search.includes('dev=1');

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

// kis helper a színmixhez
function hexToRgb(hex) {
  if (!hex) return null;
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return null;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if ([r, g, b].some((v) => Number.isNaN(v))) return null;
  return { r, g, b };
}

export default function App() {
  const [userId, setUserId] = useState(null);
  const [gpsAllowed, setGpsAllowed] = useState(null);
  const [coords, setCoords] = useState(null);
  const [lastVoteAt, setLastVoteAt] = useState(null);

  const [mapBounds, setMapBounds] = useState(null);
  const [pulseBatch, setPulseBatch] = useState([]);
  const [viewCenter, setViewCenter] = useState(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);

  const [lastVotedEmotion, setLastVotedEmotion] = useState(null);
  const [now, setNow] = useState(Date.now());

  // "óra" a rate limithez
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const stats = useEmotionsStats(mapBounds, SESSION_ID);

  // 🔁 folyamatos polling – mindig az aktuális bounds-ra
  useEmotionsPolling(mapBounds, SESSION_ID, (batch) => {
    setPulseBatch((prev) => {
      const merged = [...prev, ...batch];
      return merged.slice(-200); // max 200 pulse a memóriában
    });
  });

  // userId init
  useEffect(() => {
    const id = getOrCreateUserId();
    setUserId(id);
  }, []);

  // GPS kérés
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

  // mennyi idő telt el az utolsó szavazat óta
  const msSinceLastVote = useMemo(() => {
    if (!lastVoteAt) return Infinity;
    return now - lastVoteAt;
  }, [lastVoteAt, now]);

  // DEV módban GPS nélkül is szavazhatsz
  const canVote =
    (DEV_MODE || gpsAllowed === true) &&
    msSinceLastVote >= RATE_LIMIT_MS;

  // 🔮 AREA MOOD – teljesen a pulseBatch-ből
  const areaMood = useMemo(() => {
    if (!pulseBatch || pulseBatch.length === 0) return null;

    const counts = {};
    pulseBatch.forEach((p) => {
      if (!p.emotion) return;
      counts[p.emotion] = (counts[p.emotion] || 0) + 1;
    });

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (!total) return null;

    let r = 0;
    let g = 0;
    let b = 0;

    EMOTIONS.forEach((e) => {
      const c = hexToRgb(e.color);
      if (!c) return;
      const weight = (counts[e.id] || 0) / total;
      if (!weight) return;
      r += c.r * weight;
      g += c.g * weight;
      b += c.b * weight;
    });

    const color = `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
    // intenzitás: minél több kattintás az adott viewban, annál erősebb
    const intensity = Math.min(1, Math.log10(total + 1) / 2);

    return { color, intensity, total };
  }, [pulseBatch]);

  // ⬆⬇ VOTE – dev módban a viewCenter-re lövünk, egyébként GPS-re
  async function handleVote(emotionId) {
    if (!canVote) return;
    if (!userId) return;

    const votePoint =
      DEV_MODE && viewCenter
        ? { lat: viewCenter.lat, lng: viewCenter.lng }
        : coords;

    if (!votePoint) return;

    const event = {
      user_id: userId,
      session_id: SESSION_ID,
      emotion: emotionId,
      lat: votePoint.lat,
      lng: votePoint.lng
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

      const inserted = data?.[0] || event;

      setLastVoteAt(Date.now());
      setLastVotedEmotion(emotionId);
      setTimeout(() => setLastVotedEmotion(null), 1000);

      // azonnali pulse a mapnek
      setPulseBatch((prev) =>
        [...prev, inserted].slice(-200)
      );
    } catch (err) {
      console.error('Unexpected insert error:', err);
    }
  }

  // város kereső – viewCenter beállítása
  async function handleCitySearch(e) {
    e.preventDefault();
    const q = searchTerm.trim();
    if (!q) return;

    setSearchLoading(true);
    setSearchError(null);

    try {
      const url =
        'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' +
        encodeURIComponent(q);

      const res = await fetch(url, {
        headers: {
          'Accept-Language': 'en'
        }
      });

      if (!res.ok) throw new Error('Search failed: ' + res.status);
      const data = await res.json();

      if (!data || !data.length) {
        setSearchError('No results');
        setSearchLoading(false);
        return;
      }

      const place = data[0];
      const lat = parseFloat(place.lat);
      const lng = parseFloat(place.lon);

      if (Number.isNaN(lat) || Number.isNaN(lng)) {
        setSearchError('Invalid coordinates');
        setSearchLoading(false);
        return;
      }

      setViewCenter({ lat, lng, zoom: 11 });
      setSearchLoading(false);
    } catch (err) {
      console.error('City search error:', err);
      setSearchError('Search error');
      setSearchLoading(false);
    }
  }

  const remainingMs = Math.max(0, RATE_LIMIT_MS - msSinceLastVote);
  const remainingSec = Math.ceil(remainingMs / 1000);

  return (
    <div className="app-root">
      <header className="app-header">
        <div className="app-title">EmoMap – Heatmap of Emotions</div>
        <div className="app-session">
          session: {SESSION_ID}
          {DEV_MODE && ' · DEV'}
        </div>
      </header>

      <main className="app-main">
        <div className="map-wrapper">
          <MapView
            coords={coords}
            viewCenter={viewCenter}
            onBoundsChange={setMapBounds}
            pulses={pulseBatch}
          />

          {/* AURA az aktuális viewport hangulata alapján */}
          {areaMood && areaMood.color && (
            <div className="mood-aura">
              <div
                className="mood-aura-inner"
                style={{
                  '--mood-color': areaMood.color,
                  opacity: 0.2 + 0.5 * areaMood.intensity
                }}
              />
            </div>
          )}

          <div className="status-overlay">
            <div>
              <strong>User:</strong>{' '}
              {userId ? userId.substring(0, 10) + '…' : 'loading...'}
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
              {gpsAllowed !== true && !DEV_MODE
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

            <form
              onSubmit={handleCitySearch}
              style={{ marginTop: 6, display: 'flex', gap: 4 }}
            >
              <input
                type="text"
                placeholder="Search city..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  flex: 1,
                  fontSize: 11,
                  padding: '4px 6px',
                  borderRadius: 6,
                  border: 'none',
                  outline: 'none'
                }}
              />
              <button
                type="submit"
                disabled={searchLoading}
                style={{
                  fontSize: 11,
                  padding: '4px 8px',
                  borderRadius: 6,
                  background: searchLoading ? '#374151' : '#22c55e',
                  color: '#fff',
                  cursor: 'pointer'
                }}
              >
                Go
              </button>
            </form>
            {searchError && (
              <div style={{ marginTop: 2, fontSize: 9, color: '#f97316' }}>
                {searchError}
              </div>
            )}
          </div>
        </div>

        <div className="app-footer">
          <p style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>
            Select how you feel. You can send one pulse every 2 minutes from
            your current location
            {DEV_MODE ? ' (or from map center in DEV mode).' : '.'}
          </p>
          <div className="emotion-buttons">
            {EMOTIONS.map((e) => (
              <button
                key={e.id}
                className={
                  `emotion-button ` +
                  (!canVote || !userId ? 'disabled ' : '') +
                  (lastVotedEmotion === e.id ? 'voted' : '')
                }
                onClick={() => handleVote(e.id)}
                style={{ '--emotion-color': e.color }}
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
