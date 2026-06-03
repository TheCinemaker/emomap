// src/App.jsx
import { useEffect, useMemo, useState, useCallback } from 'react';
import { EMOTIONS } from './emotions';
import { supabase } from './supabaseClient';
import { MapView } from './MapView';
import { useEmotionsPolling } from './useEmotionsPolling';
import { useEmotionsStats } from './useEmotionsStats';
import { usePersonalMood } from './usePersonalMood';
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
  const [showInfo, setShowInfo] = useState(false);

  const [lastVotedEmotion, setLastVotedEmotion] = useState(null);
  const [lastVoteLocation, setLastVoteLocation] = useState(null);
  const [now, setNow] = useState(Date.now());

  const { coords, error: geoError } = useGeolocation();
  const gpsAllowed = coords !== null && geoError === null;

  const debouncedBounds = useDebounce(mapBounds, 400);
  const debouncedZoom = useDebounce(mapZoom, 400);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const stats = useEmotionsStats(debouncedBounds, SESSION_ID);
  const personalMood = usePersonalMood(lastVoteLocation || coords, SESSION_ID);

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
      const newEvents = [];
      for (let i = 0; i < 50; i++) {
        let lat, lng;
        if (Math.random() > 0.5) {
          const spot = hotspots[Math.floor(Math.random() * hotspots.length)];
          lat = spot.lat + (Math.random() - 0.5) * 0.5;
          lng = spot.lng + (Math.random() - 0.5) * 0.5;
        } else {
          lat = (Math.random() * 160) - 80;
          lng = (Math.random() * 360) - 180;
        }
        const ids = EMOTIONS.map(e => e.id);
        newEvents.push({
          id: `demo_${Date.now()}_${Math.random()}`,
          emotion: ids[Math.floor(Math.random() * ids.length)],
          lat, lng,
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
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
      const { error } = await supabase.from('emotions').insert(event);
      if (error) {
        console.error('Supabase insert error:', error);
        setLastVoteAt(null);
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
      const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q);
      const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
      if (!res.ok) throw new Error('Search failed: ' + res.status);
      const data = await res.json();
      if (!data || !data.length) { setSearchError('Nincs találat'); return; }
      const place = data[0];
      const lat = parseFloat(place.lat);
      const lng = parseFloat(place.lon);
      if (Number.isNaN(lat) || Number.isNaN(lng)) { setSearchError('Hibás koordináta'); return; }
      setViewCenter({ lat, lng, zoom: 11 });
      setShowInfo(false);
    } catch (err) {
      console.error('City search error:', err);
      setSearchError('Keresési hiba');
    } finally {
      setSearchLoading(false);
    }
  }, [searchTerm]);

  const remainingSec = Math.ceil(Math.max(0, RATE_LIMIT_MS - msSinceLastVote) / 1000);
  const handleLoadingComplete = useCallback(() => setIsLoading(false), []);
  const handleBoundsChange = useCallback((b) => setMapBounds(b), []);
  const handleZoomChange = useCallback((z) => setMapZoom(z), []);
  const handleLogout = useCallback(async () => { await supabase.auth.signOut(); }, []);

  if (!session) return <Auth />;

  const promptText =
    !gpsAllowed ? 'Engedélyezd a helymeghatározást a szavazáshoz'
    : canVote ? 'Hogy érzed magad most?'
    : `Új szavazat: ${remainingSec}s múlva`;

  return (
    <div className="app-shell">
      {isLoading && <LoadingScreen onComplete={handleLoadingComplete} />}

      <header className="app-top">
        <div className="app-top-row">
          <div className="app-brand">
            <span className="app-brand-icon" aria-hidden>🌍</span>
            <h1 className="app-brand-name">EmoMap</h1>
          </div>
          <button
            type="button"
            className="app-icon-btn"
            onClick={() => setShowInfo(s => !s)}
            aria-label="Info & search"
            title="Info"
          >ⓘ</button>
          <button
            type="button"
            className="app-pill-btn"
            onClick={() => setShowRandomMatch(true)}
          >
            <span aria-hidden>✨</span>
            <span>Match</span>
          </button>
        </div>
        <ReelsViewer session={session} />
      </header>

      {showRandomMatch && <RandomMatch session={session} onClose={() => setShowRandomMatch(false)} />}

      <main className="app-map-area">
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

        {showInfo && (
          <div className="info-panel" role="dialog" aria-label="Info">
            <div className="info-panel-row">
              <strong>User</strong>
              <span className="info-panel-mono">{userId ? userId.slice(0, 8) + '…' : '—'}</span>
              <button type="button" className="info-panel-link" onClick={handleLogout}>Kilépés</button>
            </div>
            <div className="info-panel-row">
              <strong>Helyzet</strong>
              <span className="info-panel-mono">
                {coords ? `${coords.lat.toFixed(3)}, ${coords.lng.toFixed(3)}` :
                  geoError ? 'GPS hiba' : '—'}
              </span>
            </div>
            <div className="info-panel-row">
              <strong>Aktivitás</strong>
              <span>
                {stats.loading ? '…' : `24h: ${stats.last24h} · 7d: ${stats.last7d} · ∞: ${stats.all}`}
              </span>
            </div>
            <div className="info-panel-row">
              <strong>Cellák</strong>
              <span>
                {moodGrid.loading ? '…' : `${moodGrid.cells.length} (${moodGrid.totalPoints} pt)`}
                {moodGrid.warning && <span className="info-warn"> {moodGrid.warning}</span>}
              </span>
            </div>

            <form onSubmit={handleCitySearch} className="info-search">
              <input
                type="text"
                placeholder="Város keresése…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <button type="submit" disabled={searchLoading}>
                {searchLoading ? '…' : 'Ugrás'}
              </button>
            </form>
            {searchError && <div className="info-warn">{searchError}</div>}
            <button type="button" className="info-panel-close" onClick={() => setShowInfo(false)}>Bezárás</button>
          </div>
        )}
      </main>

      <footer className="app-bottom">
        <div className="vote-prompt">{promptText}</div>
        <div className="emotion-grid">
          {EMOTIONS.map((e) => {
            const disabled = !canVote || !coords || !userId;
            return (
              <button
                key={e.id}
                type="button"
                className={`emotion-chip${lastVotedEmotion === e.id ? ' is-voted' : ''}`}
                onClick={() => handleVote(e.id)}
                disabled={disabled}
                style={{ '--chip-color': e.color }}
              >
                <span className="emotion-chip-emoji">{e.label}</span>
                <span className="emotion-chip-label">{e.name}</span>
              </button>
            );
          })}
        </div>
      </footer>
    </div>
  );
}
