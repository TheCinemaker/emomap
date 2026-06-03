// src/App.jsx
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { EMOTIONS } from './emotions';
import { supabase } from './supabaseClient';
import { MapView } from './MapView';
import { useEmotionsPolling } from './useEmotionsPolling';
import { useEmotionsStats } from './useEmotionsStats';
import { usePersonalMood } from './usePersonalMood';
import { useAreaMood } from './useAreaMood';
import { useGeolocation } from './useGeolocation';
import { useMoodGrid } from './useMoodGrid';
import LoadingScreen from './components/LoadingScreen';
import Auth from './components/Auth';
import ReelsViewer from './components/ReelsViewer';
import RandomMatch from './components/RandomMatch';

const SESSION_ID = 'global';
const RATE_LIMIT_MS = 2 * 60 * 1000; // 2 minutes

// Deprecated: We use Supabase Auth now
// function getOrCreateUserId() {
// ...
// }

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState(null);
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
  const [showRandomMatch, setShowRandomMatch] = useState(false);

  const [lastVotedEmotion, setLastVotedEmotion] = useState(null);
  const [lastVoteLocation, setLastVoteLocation] = useState(null); // Track where the user last voted
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
  // Use lastVoteLocation for personal mood if available, otherwise fallback to coords (but only if voted)
  const personalMood = usePersonalMood(lastVoteLocation || coords, SESSION_ID);
  const areaMood = useAreaMood(mapBounds, SESSION_ID);

  // DEMO MODE LOGIC
  const DEMO_MODE = true;
  const [demoData, setDemoData] = useState([]);

  useEffect(() => {
    if (!DEMO_MODE || isLoading) return; // Wait for loading to finish

    // Define some "hotspots" for demo data to cluster around (London, NY, Tokyo, etc.)
    const hotspots = [
      { lat: 51.5074, lng: -0.1278 }, // London
      { lat: 40.7128, lng: -74.0060 }, // New York
      { lat: 35.6762, lng: 139.6503 }, // Tokyo
      { lat: 48.8566, lng: 2.3522 }, // Paris
      { lat: -33.8688, lng: 151.2093 }, // Sydney
      { lat: 47.4979, lng: 19.0402 }, // Budapest
    ];

    const interval = setInterval(() => {
      // Generate a BATCH of random events
      const batchSize = 50; // 50 events per tick
      const newEvents = [];

      for (let i = 0; i < batchSize; i++) {
        let lat, lng;

        // 50% chance to pick a hotspot, 50% random global
        if (Math.random() > 0.5) {
          const spot = hotspots[Math.floor(Math.random() * hotspots.length)];
          // Scatter around hotspot (gaussian-ish)
          lat = spot.lat + (Math.random() - 0.5) * 0.5;
          lng = spot.lng + (Math.random() - 0.5) * 0.5;
        } else {
          // Random global
          lat = (Math.random() * 160) - 80;
          lng = (Math.random() * 360) - 180;
        }

        const emotions = EMOTIONS.map(e => e.id);
        const randomEmotion = emotions[Math.floor(Math.random() * emotions.length)];

        newEvents.push({
          id: `demo_${Date.now()}_${Math.random()}`,
          emotion: randomEmotion,
          lat,
          lng,
          inserted_at: new Date().toISOString()
        });
      }

      // Add to pulse batch for animation (limit to avoid lag)
      setPulseBatch(prev => {
        const next = [...prev, ...newEvents];
        return next.slice(-200); // Keep last 200 pulses (increased from 100)
      });

      // Add to demo data for heatmap (larger buffer)
      setDemoData(prev => {
        const next = [...prev, ...newEvents];
        // Keep last 5000 demo points for a dense map
        return next.slice(-5000);
      });

    }, 100); // 10 ticks per second * 50 events = 500 events/sec

    return () => clearInterval(interval);
  }, [isLoading]); // Re-run when loading finishes

  // Átadjuk a zoom szintet a rács-aggregációnak a dinamikus méretezéshez
  // Pass demoData to useMoodGrid
  const moodGrid = useMoodGrid(mapBounds, SESSION_ID, mapZoom, demoData);

  useEmotionsPolling(mapBounds, SESSION_ID, (batch) => {
    setPulseBatch((prev) => {
      const merged = [...prev, ...batch];
      return merged.slice(-200);
    });
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) setUserId(session.user.id);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        setUserId(session.user.id);
      } else {
        setUserId(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const msSinceLastVote = useMemo(() => {
    if (!lastVoteAt) return Infinity;
    return now - lastVoteAt;
  }, [lastVoteAt, now]);

  const canVote = gpsAllowed === true && msSinceLastVote >= RATE_LIMIT_MS;

  async function handleVote(emotionId) {
    if (!canVote) return;
    if (!coords || !userId) return;

    // Generate a temporary ID immediately so we can show the pulse
    const tempId = `user_${userId}_${Date.now()}`;

    const event = {
      user_id: userId,
      session_id: SESSION_ID,
      emotion: emotionId,
      lat: coords.lat,
      lng: coords.lng
    };

    // Optimistic update: Show pulse immediately
    const optimisticEvent = { ...event, id: tempId, inserted_at: new Date().toISOString() };

    setPulseBatch(prev => [...prev, optimisticEvent]);
    setLastVoteLocation({ lat: coords.lat, lng: coords.lng }); // Store location of vote immediately
    setLastVoteAt(Date.now());
    setLastVotedEmotion(emotionId);
    setTimeout(() => setLastVotedEmotion(null), 1000);

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
      // We don't need to add to pulseBatch again, the optimistic one is fine.
      // If we wanted to be strict, we could replace the temp ID, but for a visual pulse it doesn't matter.
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

  const handleLoadingComplete = useCallback(() => {
    setIsLoading(false);
  }, []);

  if (!session) {
    return <Auth />;
  }

  return (
    <div className="app-root">
      {isLoading && <LoadingScreen onComplete={handleLoadingComplete} />}
      <header className="app-header">
        <div className="app-title">EmoMap</div>
        <div className="header-actions" style={{ display: 'flex', gap: '10px', alignItems: 'center', pointerEvents: 'auto' }}>
          <button 
            className="match-trigger-btn" 
            onClick={() => setShowRandomMatch(true)}
            style={{
              background: 'linear-gradient(45deg, var(--primary-neon), var(--secondary-neon))',
              border: 'none',
              borderRadius: '20px',
              padding: '8px 15px',
              color: '#000',
              fontWeight: 'bold',
              cursor: 'pointer',
              boxShadow: '0 0 10px var(--primary-neon)'
            }}
          >
            Mit csinál más?
          </button>
          <div className="app-session" style={{ pointerEvents: 'none' }}>session: {SESSION_ID}</div>
        </div>
      </header>
      
      <ReelsViewer session={session} />
      {showRandomMatch && <RandomMatch session={session} onClose={() => setShowRandomMatch(false)} />}

      <main className="app-main">
        <div className="map-wrapper">
          <MapView
            coords={coords}
            viewCenter={viewCenter}
            onBoundsChange={setMapBounds}
            onZoomChange={setMapZoom} // Frissíti a mapZoom state-et
            pulses={pulseBatch}
            personalMood={personalMood}
            personalAuraLocation={lastVoteLocation} // Pass the fixed location
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
                  `emotion-button ${!canVote || !coords || !userId ? 'disabled' : ''
                  } ${lastVotedEmotion === e.id ? 'voted' : ''
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
