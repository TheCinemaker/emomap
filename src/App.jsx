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
import { useLang } from './i18n';
import { useEmotionalMirror } from './useEmotionalMirror';
import { useReplay, REPLAY_HOURS } from './useReplay';
import { useVenues } from './useVenues';
import VenueClaim from './components/VenueClaim';
import LoadingScreen from './components/LoadingScreen';
import Auth from './components/Auth';
import ReelsViewer from './components/ReelsViewer';
import ShareCard from './components/ShareCard';
import Profile from './components/Profile';
// RandomMatch (anonymous stranger photo-swap) is intentionally not mounted —
// shelved per the product-risk call (moderation/legal exposure), kept in the
// codebase for a possible later, non-random, safety-first redesign.

const SESSION_ID = 'global';
const RATE_LIMIT_MS = 2 * 60 * 1000;
const PERSONAL_AURA_LIFETIME_MS = 3 * 60 * 1000; // 180s — own pulse stays this long after voting
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';
const VOTE_JITTER_METERS = 150; // privacy: never store the user's exact GPS point

// Random offset within VOTE_JITTER_METERS so stored pins can't be used to pinpoint
// a real address (e.g. "always stressed outside this one clinic").
function jitterCoords(lat, lng) {
  const earthRadius = 6371000;
  const angle = Math.random() * 2 * Math.PI;
  const dist = Math.random() * VOTE_JITTER_METERS;
  const dLat = (dist * Math.cos(angle)) / earthRadius * (180 / Math.PI);
  const dLng = (dist * Math.sin(angle)) / (earthRadius * Math.cos(lat * Math.PI / 180)) * (180 / Math.PI);
  return { lat: lat + dLat, lng: lng + dLng };
}

const EMOTION_COLOR_BY_ID = EMOTIONS.reduce((acc, e) => ({ ...acc, [e.id]: e.color }), {});

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
  const [showInfo, setShowInfo] = useState(false);
  const [showShareCard, setShowShareCard] = useState(false);
  const [showVenueClaim, setShowVenueClaim] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  const { lang, setLang, t } = useLang();
  const { mirror, trigger: triggerMirror } = useEmotionalMirror();
  const { hourlyGrids, loading: replayLoading, load: loadReplay, reset: resetReplay } = useReplay();
  const [showReplay, setShowReplay] = useState(false);
  const [replayHour, setReplayHour] = useState(REPLAY_HOURS - 1);
  const [replayPlaying, setReplayPlaying] = useState(true);

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

  // Personal aura lifetime: 180s after a vote, then hide it
  useEffect(() => {
    if (!lastVoteAt) return;
    const timer = setTimeout(() => setLastVoteLocation(null), PERSONAL_AURA_LIFETIME_MS);
    return () => clearTimeout(timer);
  }, [lastVoteAt]);

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
  const { venues, refresh: refreshVenues } = useVenues(debouncedBounds);

  // Replay auto-advance: loop through the 24 pre-built hourly grids while playing
  useEffect(() => {
    if (!showReplay || !replayPlaying || !hourlyGrids) return;
    const id = setInterval(() => {
      setReplayHour((h) => (h + 1) % REPLAY_HOURS);
    }, 700);
    return () => clearInterval(id);
  }, [showReplay, replayPlaying, hourlyGrids]);

  const handleOpenReplay = useCallback(() => {
    setShowReplay(true);
    setReplayHour(REPLAY_HOURS - 1);
    setReplayPlaying(true);
    loadReplay(debouncedBounds, debouncedZoom);
  }, [loadReplay, debouncedBounds, debouncedZoom]);

  const handleCloseReplay = useCallback(() => {
    setShowReplay(false);
    resetReplay();
  }, [resetReplay]);

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
    const { lat, lng } = jitterCoords(coords.lat, coords.lng);
    const event = {
      user_id: userId,
      session_id: SESSION_ID,
      emotion: emotionId,
      lat,
      lng
    };

    const optimisticEvent = { ...event, id: tempId, inserted_at: new Date().toISOString() };
    setPulseBatch(prev => [...prev, optimisticEvent].slice(-200));
    setLastVoteLocation({ lat, lng });
    setLastVoteAt(Date.now());
    setLastVotedEmotion(emotionId);
    setTimeout(() => setLastVotedEmotion(null), 1000);

    try {
      const { error } = await supabase.from('emotions').insert(event);
      if (error) {
        console.error('Supabase insert error:', error);
        setLastVoteAt(null);
      } else {
        triggerMirror(coords, emotionId);
      }
    } catch (err) {
      console.error('Unexpected insert error:', err);
      setLastVoteAt(null);
    }
  }, [canVote, coords, userId, triggerMirror]);

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
      if (!data || !data.length) { setSearchError(t('search_no_result')); return; }
      const place = data[0];
      const lat = parseFloat(place.lat);
      const lng = parseFloat(place.lon);
      if (Number.isNaN(lat) || Number.isNaN(lng)) { setSearchError(t('search_bad_coords')); return; }
      setViewCenter({ lat, lng, zoom: 11 });
      setShowInfo(false);
    } catch (err) {
      console.error('City search error:', err);
      setSearchError(t('search_error'));
    } finally {
      setSearchLoading(false);
    }
  }, [searchTerm, t]);

  const remainingSec = Math.ceil(Math.max(0, RATE_LIMIT_MS - msSinceLastVote) / 1000);
  const handleLoadingComplete = useCallback(() => setIsLoading(false), []);
  const handleBoundsChange = useCallback((b) => setMapBounds(b), []);
  const handleZoomChange = useCallback((z) => setMapZoom(z), []);
  const handleLogout = useCallback(async () => { await supabase.auth.signOut(); }, []);

  if (!session) return <Auth />;

  const promptText =
    !gpsAllowed ? t('vote_prompt_need_location')
    : canVote ? t('vote_prompt_ready')
    : t('vote_prompt_cooldown', { s: remainingSec });

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
            className="app-pill-btn"
            onClick={() => setShowShareCard(true)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7a3 3 0 0 0 0-1.4l7.05-4.11a2.99 2.99 0 1 0-1.96-2.8c0 .3.05.58.14.85L7.1 9.35a2.99 2.99 0 1 0 0 5.3l7.04 4.1c-.09.28-.14.56-.14.85a2.99 2.99 0 1 0 2.99-3.52Z"/>
            </svg>
            <span>{t('share_card_open')}</span>
          </button>
          <button
            type="button"
            className={`app-icon-btn${showReplay ? ' is-active' : ''}`}
            onClick={() => (showReplay ? handleCloseReplay() : handleOpenReplay())}
            aria-label={t('replay_open')}
            title={t('replay_open')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm.75-12.5h-1.5v5.19l4.15 2.49.75-1.27-3.4-2.04V7.5Z"/>
            </svg>
          </button>
          <button
            type="button"
            className="app-icon-btn"
            onClick={() => setShowInfo(s => !s)}
            aria-label={t('info')}
            title={t('info')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 4.5a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8Zm1.2 11h-2.4a.8.8 0 0 1 0-1.6h.4v-4.4h-.4a.8.8 0 0 1 0-1.6h1.6c.44 0 .8.36.8.8v5.2h.4a.8.8 0 0 1 0 1.6Z"/>
            </svg>
          </button>
          <button
            type="button"
            className="app-icon-btn"
            onClick={() => setShowProfile(true)}
            aria-label={t('profile_open')}
            title={t('profile_open')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.42 0-8 2.24-8 5v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2c0-2.76-3.58-5-8-5Z"/>
            </svg>
          </button>
        </div>
        <ReelsViewer session={session} t={t} />
      </header>

      {showShareCard && (
        <ShareCard userId={userId} lang={lang} t={t} onClose={() => setShowShareCard(false)} />
      )}

      {showProfile && (
        <Profile
          userId={userId}
          lang={lang}
          setLang={setLang}
          t={t}
          onClose={() => setShowProfile(false)}
          onLogout={handleLogout}
        />
      )}

      <main className="app-map-area">
        <MapView
          coords={coords}
          viewCenter={viewCenter}
          onBoundsChange={handleBoundsChange}
          onZoomChange={handleZoomChange}
          pulses={pulseBatch}
          personalMood={personalMood}
          personalAuraLocation={lastVoteLocation}
          moodGridCells={showReplay && hourlyGrids ? hourlyGrids[replayHour] : moodGrid.cells}
          venues={venues}
        />

        {showInfo && (
          <div className="info-panel" role="dialog" aria-label={t('info')}>
            <div className="info-panel-row">
              <strong>{t('location')}</strong>
              <span className="info-panel-mono">
                {coords ? `${coords.lat.toFixed(3)}, ${coords.lng.toFixed(3)}` :
                  geoError ? t('gps_error') : '—'}
              </span>
            </div>
            <div className="info-panel-row">
              <strong>{t('activity')}</strong>
              <span>
                {stats.loading ? '…' : `24h: ${stats.last24h} · 7d: ${stats.last7d} · ∞: ${stats.all}`}
              </span>
            </div>
            <div className="info-panel-row">
              <strong>{t('cells')}</strong>
              <span>
                {moodGrid.loading ? '…' : `${moodGrid.cells.length} (${moodGrid.totalPoints} pt)`}
                {moodGrid.warning && <span className="info-warn"> {moodGrid.warning}</span>}
              </span>
            </div>

            <form onSubmit={handleCitySearch} className="info-search">
              <input
                type="text"
                placeholder={t('search_placeholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <button type="submit" disabled={searchLoading}>
                {searchLoading ? '…' : t('search_go')}
              </button>
            </form>
            {searchError && <div className="info-warn">{searchError}</div>}

            <button
              type="button"
              className="info-panel-close"
              onClick={() => { setShowInfo(false); setShowVenueClaim(true); }}
              disabled={!coords}
            >
              📍 {t('venue_claim_open')}
            </button>
            <button type="button" className="info-panel-close" onClick={() => setShowInfo(false)}>{t('close')}</button>
          </div>
        )}

        {showVenueClaim && (
          <VenueClaim
            coords={coords}
            userId={userId}
            t={t}
            onClose={() => setShowVenueClaim(false)}
            onClaimed={refreshVenues}
          />
        )}

        {showReplay && (
          <div className="replay-bar" role="group" aria-label={t('replay_open')}>
            <button type="button" className="replay-icon-btn" onClick={() => setReplayPlaying((p) => !p)}>
              {replayPlaying ? '❙❙' : '▶'}
            </button>
            <input
              type="range"
              className="replay-slider"
              min={0}
              max={REPLAY_HOURS - 1}
              value={replayHour}
              onChange={(e) => { setReplayPlaying(false); setReplayHour(Number(e.target.value)); }}
              disabled={!hourlyGrids}
            />
            <span className="replay-label">
              {replayLoading ? '…' : (replayHour === REPLAY_HOURS - 1 ? t('replay_now') : t('replay_hours_ago', { h: REPLAY_HOURS - 1 - replayHour }))}
            </span>
            <button type="button" className="replay-icon-btn" onClick={handleCloseReplay}>×</button>
          </div>
        )}

        {mirror && (
          <div
            className="mirror-toast"
            style={{ '--mirror-color': EMOTION_COLOR_BY_ID[mirror.emotion] || '#fff' }}
            role="status"
          >
            {t('mirror_not_alone', { percent: mirror.percent, emotion: t(`emotion_${mirror.emotion}`) })}
          </div>
        )}
      </main>

      <footer className="app-bottom">
        <div className="vote-prompt">{promptText}</div>
        <div className="emotion-grid">
          {EMOTIONS.map((e) => {
            const disabled = !canVote || !coords || !userId;
            const Icon = e.Icon;
            const label = t(`emotion_${e.id}`);
            return (
              <button
                key={e.id}
                type="button"
                className={`emotion-chip${lastVotedEmotion === e.id ? ' is-voted' : ''}`}
                onClick={() => handleVote(e.id)}
                disabled={disabled}
                style={{ '--chip-color': e.color }}
                aria-label={label}
              >
                <span className="emotion-chip-icon"><Icon width={22} height={22} /></span>
                <span className="emotion-chip-label">{label}</span>
              </button>
            );
          })}
        </div>
      </footer>
    </div>
  );
}
