// src/App.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { EMOTIONS } from './emotions';
import { supabase } from './supabaseClient';
import { MapView } from './MapView';
import { useEmotionsPolling } from './useEmotionsPolling';
import { useEmotionsStats } from './useEmotionsStats';
import { usePersonalMood } from './usePersonalMood';
import { useAreaMood } from './useAreaMood';
import { useGeolocation } from './useGeolocation';
import { useMoodGrid } from './useMoodGrid'; 

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
  const [lastVoteAt, setLastVoteAt] = useState(null);
  const [events, setEvents] = useState([]);

  const [mapBounds, setMapBounds] = useState(null);
  const [mapZoom, setMapZoom] = useState(4); // Zoom szint state a térképről
  const [pulseBatch, setPulseBatch] = useState([]);
  const [viewCenter, setViewCenter] = useState(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);

  const [lastVotedEmotion, setLastVotedEmotion] = useState(null);
  const [now, setNow] = useState(Date.now());

  // Folyamatos GPS koordináták lekérése a useGeolocation hookkal
  const { coords, error: geoError } = useGeolocation();
  const gpsAllowed = coords !== null && geoError === null;

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  const stats = useEmotionsStats(mapBounds, SESSION_ID);
  const personalMood = usePersonalMood(coords, SESSION_ID);
  const areaMood = useAreaMood(mapBounds, SESSION_ID);
  
  // Átadjuk a zoom szintet a rács-aggregációnak a dinamikus méretezéshez
  const moodGrid = useMoodGrid(mapBounds, SESSION_ID, mapZoom); 

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

  const msSinceLastVote = useMemo(() => {
    if (!lastVoteAt) return Infinity;
    return now - lastVoteAt;
  }, [lastVoteAt, now]);

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
      
      setLastVotedEmotion(emotionId);
      setTimeout(() => setLastVotedEmotion(null), 1000);

      // Új pulzus hozzáadása a térképen lévő animációhoz
      setPulseBatch([inserted || { ...event, lat: coords.lat, lng: coords.lng }]);
    } catch (err) {
      console.error('Unexpected insert error:', err);
    }
  }

  async function handleCitySearch(e) {
    e.preventDefault();
    const q = searchTerm.trim();
    if (!q) return;

    setSearchLoading(true);
    setSearchError(null);

    try {
      // Nominatim keresés API hívás
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

      // Térkép központjának beállítása a keresett helyre
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
        <div className="app-session">session: {SESSION_ID}</div>
      </header>

      <main className="app-main">
        <div className="map-wrapper">
          <MapView
            coords={coords}
            viewCenter={viewCenter}
            onBoundsChange={setMapBounds}
            onZoomChange={setMapZoom} // Frissíti a mapZoom state-et
            pulses={pulseBatch}
            personalMood={personalMood}
            moodGridCells={moodGrid.cells} // Átadja a rács adatokat
          />

          {/* Area Mood Aura (Globális/Viewport Aura) */}
          {areaMood && areaMood.color && (
            <div className="mood-aura">
              <div
                className="mood-aura-inner"
                style={{
                  '--mood-color': areaMood.color,
                  opacity: 0.25 + 0.5 * areaMood.intensity
                }}
              />
            </div>
          )}

          <div className="status-overlay">
            <div>
              <strong>User:</strong> {userId || 'loading...'}
            </div>
            <div>
              <strong>Location:</strong>{' '}
              {coords
                ? `${coords.lat}, ${coords.lng}`
                : geoError
                ? `GPS Error: ${geoError}`
                : 'requesting...'}
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
              {moodGrid.warning && <span style={{ color: '#f97316' }}> ({moodGrid.warning})</span>}
            </div>
            
            {/* Mood Debug Info */}
            <div style={{ marginTop: 2, fontSize: 10, opacity: 0.9 }}>
              <strong>Area Mood:</strong>{' '}
              {areaMood && areaMood.color
                ? `${areaMood.color} · total ${areaMood.total}`
                : 'no mood data'}
            </div>
            <div style={{ marginTop: 2, fontSize: 10, opacity: 0.9 }}>
              <strong>My Mood:</strong>{' '}
              {personalMood && personalMood.color
                ? `${personalMood.color} · total ${personalMood.total}`
                : 'no data yet'}
            </div>
            <div style={{ marginTop: 2, fontSize: 10, opacity: 0.9 }}>
              <strong>Grid Cells:</strong>{' '}
              {moodGrid.loading
                ? 'loading...'
                : `${moodGrid.cells.length} cells (${moodGrid.totalPoints} points)`}
              {' '}
              <span style={{ opacity: 0.6 }}>Zoom: {mapZoom.toFixed(1)}</span>
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
                  outline: 'none',
                  color: '#000'
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
            Select how you feel. You can send one pulse every 2 minutes from your
            current location.
          </p>
          <div className="emotion-buttons">
            {EMOTIONS.map((e) => (
              <button
                key={e.id}
                className={
                  `emotion-button ${
                    !canVote || !coords || !userId ? 'disabled' : ''
                  } ${
                    lastVotedEmotion === e.id ? 'voted' : ''
                  }`
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
