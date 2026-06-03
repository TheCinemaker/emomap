// src/App.jsx
import { useEffect, useMemo, useState, useCallback } from 'react';
import { EMOTIONS } from './emotions';
import { supabase } from './supabaseClient';
import { MapView } from './MapView';
import { useEmotionsPolling } from './useEmotionsPolling';
import { useEmotionsStats } from './useEmotionsStats';
import { usePersonalMood } from './usePersonalMood';
import { useAreaMood } from './useAreaMood';
import { useGeolocation } from './useGeolocation';
import { useMoodGrid } from './useMoodGrid';
import { useDebounce } from './useDebounce';
import LoadingScreen from './components/LoadingScreen';
import Auth from './components/Auth';
import ReelsViewer from './components/ReelsViewer';
import RandomMatch from './components/RandomMatch';

const SESSION_ID = 'global';
const RATE_LIMIT_MS = 2 * 60 * 1000;
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [userId, setUserId] = useState(null);
  const [lastVoteAt, setLastVoteAt] = useState(null);

  const [mapBounds, setMapBounds] = useState(null);
  const [mapZoom, setMapZoom] = useState(4);
  const [pulseBatch, setPulseBatch] = useState([]);
  const [viewCenter, setViewCenter] = useState(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [showRandomMatch, setShowRandomMatch] = useState(false);

  const [lastVotedEmotion, setLastVotedEmotion] = useState(null);
  const [lastVoteLocation, setLastVoteLocation] = useState(null);
  const [now, setNow] = useState(Date.now());

  const { coords, error: geoError } = useGeolocation();
  const gpsAllowed = coords !== null && geoError === null;

  // Debounce bounds & zoom so quick pan/zoom doesn't thrash the polling hooks
  const debouncedBounds = useDebounce(mapBounds, 400);
  const debouncedZoom = useDebounce(mapZoom, 400);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const stats = useEmotionsStats(debouncedBounds, SESSION_ID);
  const personalMood = usePersonalMood(lastVoteLocation || coords, SESSION_ID);
  const areaMood = useAreaMood(debouncedBounds, SESSION_ID);

  const [demoData, setDemoData] = useState([]);

  useEffect(() => {
    if (!DEMO_MODE || isLoading) return;

    const hotspots = [
      { lat: 51.5074, lng: -0.1278 },
      { lat: 40.7128, lng: -74.0060 },
      { lat: 35.6762, lng: 139.6503 },
      { lat: 48.8566, lng: 2.3522 },
      { lat: -33.8688, lng: 151.2093 },
      { lat: 47.4979, lng: 19.0402 },
    ];

    const interval = setInterval(() => {
      const batchSize = 50;
      const newEvents = [];

      for (let i = 0; i < batchSize; i++) {
        let lat, lng;
        if (Math.random() > 0.5) {
          const spot = hotspots[Math.floor(Math.random() * hotspots.length)];
          lat = spot.lat + (Math.random() - 0.5) * 0.5;
          lng = spot.lng + (Math.random() - 0.5) * 0.5;
        } else {
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

      setPulseBatch(prev => [...prev, ...newEvents].slice(-200));
      setDemoData(prev => [...prev, ...newEvents].slice(-5000));
    }, 100);

    return () => clearInterval(interval);
  }, [isLoading]);

  const moodGrid = useMoodGrid(debouncedBounds, SESSION_ID, debouncedZoom, demoData);

  const handleNewBatch = useCallback((batch) => {
    setPulseBatch((prev) => [...prev, ...batch].slice(-200));
  }, []);
  useEmotionsPolling(debouncedBounds, SESSION_ID, handleNewBatch);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) setUserId(session.user.id);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUserId(session ? session.user.id : null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const msSinceLastVote = useMemo(() => {
    if (!lastVoteAt) return Infinity;
    return now - lastVoteAt;
  }, [lastVoteAt, now]);

  const canVote = gpsAllowed === true && msSinceLastVote >= RATE_LIMIT_MS;

  const handleVote = useCallback(async (emotionId) => {
    if (!canVote || !coords || !userId) return;

    const tempId = `user_${userId}_${Date.now()}`;
    const event = {
      user_id: userId,
      session_id: SESSION_ID,
      emotion: emotionId,
      lat: coords.lat,
      lng: coords.lng
    };

    const optimisticEvent = { ...event, id: tempId, inserted_at: new Date().toISOString() };
    setPulseBatch(prev => [...prev, optimisticEvent].slice(-200));
    setLastVoteLocation({ lat: coords.lat, lng: coords.lng });
    setLastVoteAt(Date.now());
    setLastVotedEmotion(emotionId);
    setTimeout(() => setLastVotedEmotion(null), 1000);

    try {
      const { error } = await supabase
        .from('emotions')
        .insert(event);

      if (error) {
        // Server-side rate limit kicked in → rollback the visual & client timer
        console.error('Supabase insert error:', error);
        setLastVoteAt(null);
        return;
      }

    } catch (err) {
      console.error('Unexpected insert error:', err);
      setLastVoteAt(null);
    }
  }, [canVote, coords, userId]);

  const handleCitySearch = useCallback(async (e) => {
    e.preventDefault();
    const q = searchTerm.trim();
    if (!q) return;

    setSearchLoading(true);
    setSearchError(null);

    try {
      const url =
        'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' +
        encodeURIComponent(q);
      const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
      if (!res.ok) throw new Error('Search failed: ' + res.status);
      const data = await res.json();

      if (!data || !data.length) {
        setSearchError('No results');
        return;
      }
      const place = data[0];
      const lat = parseFloat(place.lat);
      const lng = parseFloat(place.lon);

      if (Number.isNaN(lat) || Number.isNaN(lng)) {
        setSearchError('Invalid coordinates');
        return;
      }

      setViewCenter({ lat, lng, zoom: 11 });
    } catch (err) {
      console.error('City search error:', err);
      setSearchError('Search error');
    } finally {
      setSearchLoading(false);
    }
  }, [searchTerm]);

  const remainingMs = Math.max(0, RATE_LIMIT_MS - msSinceLastVote);
  const remainingSec = Math.ceil(remainingMs / 1000);

  const handleLoadingComplete = useCallback(() => setIsLoading(false), []);
  const handleBoundsChange = useCallback((b) => setMapBounds(b), []);
  const handleZoomChange = useCallback((z) => setMapZoom(z), []);

  if (!session) {
    return <Auth />;
  }

  return (
    <div className="app-root">
      {isLoading && <LoadingScreen onComplete={handleLoadingComplete} />}
      <header className="app-header">
        <div className="app-title">EmoMap</div>
        <div className="header-actions">
          <button
            className="match-trigger-btn"
            onClick={() => setShowRandomMatch(true)}
          >
            Mit csinál más?
          </button>
          <div className="app-session">session: {SESSION_ID}</div>
        </div>
      </header>

      <ReelsViewer session={session} />
      {showRandomMatch && <RandomMatch session={session} onClose={() => setShowRandomMatch(false)} />}

      <main className="app-main">
        <div className="map-wrapper">
          <MapView
            coords={coords}
            viewCenter={viewCenter}
            onBoundsChange={handleBoundsChange}
            onZoomChange={handleZoomChange}
            pulses={pulseBatch}
            personalMood={personalMood}
            personalAuraLocation={lastVoteLocation}
            moodGridCells={moodGrid.cells}
          />

          {/* Area mood is shown via moodGrid cells on the map — no viewport overlay needed */}

          <div className="status-overlay">
            <div>
              <strong>User:</strong> {userId || 'loading...'}
            </div>
            <div>
              <strong>Location:</strong>{' '}
              {coords
                ? `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`
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
