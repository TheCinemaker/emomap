// src/App.jsx
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

// Segédfüggvény idő formázáshoz
function formatTimeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function App() {
  const [userId, setUserId] = useState(null);
  const [gpsAllowed, setGpsAllowed] = useState(null);
  const [coords, setCoords] = useState(null);
  const [lastVoteAt, setLastVoteAt] = useState(null);
  const [events, setEvents] = useState([]);

  const [mapBounds, setMapBounds] = useState(null);
  const [pulseBatch, setPulseBatch] = useState([]);
  const [viewCenter, setViewCenter] = useState(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);

  // 🆕 ÚJ STATE-EK
  const [isLoading, setIsLoading] = useState(true);
  const [lastVotedEmotion, setLastVotedEmotion] = useState(null);
  const [recentPulses, setRecentPulses] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState(0);
  const [activeNow, setActiveNow] = useState(0);

  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  const stats = useEmotionsStats(mapBounds, SESSION_ID);

  useEmotionsPolling(mapBounds, SESSION_ID, (batch) => {
    setPulseBatch((prev) => {
      const merged = [...prev, ...batch];
      
      // 🆕 Frissítsd a recent pulses-t
      if (batch.length > 0) {
        setRecentPulses(prev => [
          ...batch.map(pulse => ({
            ...pulse,
            timestamp: pulse.created_at || Date.now()
          })),
          ...prev.slice(0, 4) // Max 5 legújabb
        ]);
        
        // 🆕 Simulált online users
        setOnlineUsers(prev => Math.max(prev, Math.floor(Math.random() * 50) + 10));
        setActiveNow(prev => Math.max(prev, Math.floor(Math.random() * 20) + 5));
      }
      
      return merged.slice(-100);
    });
  });

  useEffect(() => {
    const id = getOrCreateUserId();
    setUserId(id);
    
    // 🆕 Simulált adatok betöltése
    setTimeout(() => {
      setIsLoading(false);
      setOnlineUsers(Math.floor(Math.random() * 50) + 10);
      setActiveNow(Math.floor(Math.random() * 20) + 5);
      
      // 🆕 Minta recent pulses
      setRecentPulses([
        { emotion: 'happy', timestamp: Date.now() - 30000, user_id: 'user_123' },
        { emotion: 'motivated', timestamp: Date.now() - 120000, user_id: 'user_456' },
        { emotion: 'hype', timestamp: Date.now() - 300000, user_id: 'user_789' }
      ]);
    }, 1500);
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
      
      // 🆕 Vote confirmation
      setLastVotedEmotion(emotionId);
      setTimeout(() => setLastVotedEmotion(null), 2000);

      setPulseBatch([inserted || { ...event, lat: coords.lat, lng: coords.lng }]);
      
      // 🆕 Add to recent pulses
      setRecentPulses(prev => [{
        emotion: emotionId,
        timestamp: Date.now(),
        user_id: userId
      }, ...prev.slice(0, 4)]);
      
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

  // 🆕 Loading screen
  if (isLoading) {
    return (
      <div className="app-root loading">
        <div className="loading-container">
          <div className="cyberpunk-spinner"></div>
          <div className="loading-text">Initializing EmoMap...</div>
          <div className="loading-subtext">Connecting to emotional network</div>
        </div>
      </div>
    );
  }

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
            pulses={pulseBatch}
          />
          
          <div className="status-overlay">
            {/* 🆕 Live Stats */}
            <div className="live-stats">
              <div className="stat">
                <span className="value">{onlineUsers}</span>
                <span className="label">online</span>
              </div>
              <div className="stat">
                <span className="value">{activeNow}</span>
                <span className="label">active now</span>
              </div>
            </div>

            <div>
              <strong>User:</strong> {userId?.substring(0, 8)}...
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

        {/* 🆕 Emotion Timeline */}
        {recentPulses.length > 0 && (
          <div className="emotion-timeline">
            <div className="timeline-header">Recent Activity</div>
            <div className="timeline-items">
              {recentPulses.slice(0, 5).map((pulse, index) => (
                <div key={index} className="timeline-item">
                  <span className="emoji">
                    {EMOTIONS.find(e => e.id === pulse.emotion)?.label}
                  </span>
                  <span className="time">
                    {formatTimeAgo(pulse.timestamp)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

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
  style={{
    '--emotion-color': e.color
  }}
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
