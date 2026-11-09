// src/App.jsx
import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { EMOTIONS } from './emotions';
import { supabase } from './supabaseClient';
import { MapView } from './MapView';
import { useEmotionsPolling } from './useEmotionsPolling';
import { useEmotionsStats } from './useEmotionsStats';
import { useGeolocation } from './useGeolocation';
import { useMoodGrid } from './useMoodGrid';
import { useDebounce } from './useDebounce';
import { useLang } from './i18n';
import { useEmotionalMirror } from './useEmotionalMirror';
import { useReplay, REPLAY_HOURS } from './useReplay';
import { useVenues } from './useVenues';
import { useIncomingRequestCount } from './useFriends';
import { usePresence } from './usePresence';
import VenueCRM from './components/VenueCRM';
import VenueModal from './components/VenueModal';
import LoadingScreen from './components/LoadingScreen';
import Auth from './components/Auth';
import PulsesPage from './components/PulsesPage';
import FriendsPage from './components/FriendsPage';
import BottomNav from './components/BottomNav';
import ShareCard from './components/ShareCard';
import Profile from './components/Profile';
import { useUnreadMessageCount } from './useChat';
import ProfileDetails from './components/ProfileDetails';
import FriendDetails from './components/FriendDetails';
import PartnerRequestForm from './components/PartnerRequestForm';
import { IconGlobe, IconPlay, IconPause, IconBuilding } from './components/Icons';
// RandomMatch (anonymous stranger photo-swap) is intentionally not mounted —
// shelved per the product-risk call (moderation/legal exposure), kept in the
// codebase for a possible later, non-random, safety-first redesign.

const SESSION_ID = 'global';
const RATE_LIMIT_MS = 2 * 60 * 1000;
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';
// Lowered from 150m on user request: at 150m, a disco or a dense old-town
// street (Kőszeg: a venue every ~30m) all blur into one indistinguishable
// blob, defeating the actual point of the map — seeing where to go. 10m is
// close to a phone GPS fix's own native noise anyway, so it still adds a
// little protection without erasing which specific place someone's at.
const VOTE_JITTER_METERS = 10;

// Random offset within VOTE_JITTER_METERS so stored pins aren't pinned to
// the literal GPS coordinate.
function jitterCoords(lat, lng) {
  const earthRadius = 6371000;
  const angle = Math.random() * 2 * Math.PI;
  const dist = Math.random() * VOTE_JITTER_METERS;
  const dLat = (dist * Math.cos(angle)) / earthRadius * (180 / Math.PI);
  const dLng = (dist * Math.sin(angle)) / (earthRadius * Math.cos(lat * Math.PI / 180)) * (180 / Math.PI);
  return { lat: lat + dLat, lng: lng + dLng };
}

const EMOTION_COLOR_BY_ID = EMOTIONS.reduce((acc, e) => ({ ...acc, [e.id]: e.color }), {});

const LAST_VOTE_AT_KEY = 'emomap_last_vote_at';

// Without this, the cooldown timer reset on every refresh (plain useState),
// so the vote buttons looked re-enabled seconds after voting even though
// the server-side rate limit would still reject the insert — confusing,
// not actually a security hole (Postgres enforces the real limit), but a
// real "this looks broken" bug.
function loadLastVoteAt() {
  try {
    const raw = localStorage.getItem(LAST_VOTE_AT_KEY);
    return raw ? Number(raw) : null;
  } catch {
    return null;
  }
}

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [userId, setUserId] = useState(null);
  const [lastVoteAt, setLastVoteAtState] = useState(loadLastVoteAt);
  const setLastVoteAt = useCallback((value) => {
    setLastVoteAtState(value);
    try {
      if (value) localStorage.setItem(LAST_VOTE_AT_KEY, String(value));
      else localStorage.removeItem(LAST_VOTE_AT_KEY);
    } catch {
      // ignore storage failures (private mode, etc.) — in-memory state still works
    }
  }, []);

  const [mapBounds, setMapBounds] = useState(null);
  const [mapZoom, setMapZoom] = useState(4);
  const [pulseBatch, setPulseBatch] = useState([]);
  const [viewCenter, setViewCenter] = useState(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [showInfo, setShowInfo] = useState(false);
  const [showShareCard, setShowShareCard] = useState(false);
  const [showVenueCRM, setShowVenueCRM] = useState(false);
  const [viewVenueId, setViewVenueId] = useState(null);
  const [activeTab, setActiveTab] = useState('map'); // 'map' | 'pulses' | 'friends' | 'profile'
  // Guest mode (2026-11-09, Gemini review caught a real launch-blocker): the
  // Map and Moments feed must be viewable WITHOUT an account — a Reddit/
  // social-media visitor clicking the link to an immediate login form
  // bounces instantly. Auth now renders as a dismissible overlay, only
  // triggered on demand (voting, posting, Friends/Profile, the nav's own
  // "Sign in" button) instead of blocking the entire app up front.
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  // Lead-capture for "I run a venue, I want to advertise" — the Partner CRM
  // itself stays invite-only, but until a visible entry point existed,
  // a business owner landing from the Reddit/X launch posts had literally
  // no way to express interest. 2026-11-09.
  const [showPartnerRequest, setShowPartnerRequest] = useState(false);
  // PulsesPage registers its composer-open function here so the bottom nav's
  // Pulses-only center button can trigger it without lifting all of that
  // page's upload/composer state up into App.
  const pulsesApiRef = useRef(null);
  const [showOwnDetails, setShowOwnDetails] = useState(false);
  const [viewDetailsFor, setViewDetailsFor] = useState(null); // { friendId, friendName } | null

  const { lang, setLang, t } = useLang();
  const { mirror, trigger: triggerMirror } = useEmotionalMirror();
  const unreadCount = useUnreadMessageCount(userId);
  const incomingRequestCount = useIncomingRequestCount(userId);
  const profileBadgeCount = unreadCount + incomingRequestCount;
  // Mounted here (not inside FriendsPage) so you stay visible as "online"
  // to friends for the whole session, not just while that tab is open.
  const onlineIds = usePresence(userId);
  const { hourlyGrids, loading: replayLoading, load: loadReplay, reset: resetReplay } = useReplay();
  const [showReplay, setShowReplay] = useState(false);
  const [replayHour, setReplayHour] = useState(REPLAY_HOURS - 1);
  const [replayPlaying, setReplayPlaying] = useState(true);

  const [lastVotedEmotion, setLastVotedEmotion] = useState(null);
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
  const { venues } = useVenues(debouncedBounds);

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
      // Logging out while on an account-only tab would otherwise leave a
      // guest stranded on a now-empty Friends/Profile page.
      if (!session) setActiveTab((tab) => (tab === 'friends' || tab === 'profile' ? 'map' : tab));
    });

    return () => subscription.unsubscribe();
  }, []);

  // Auto-dismiss the sign-in overlay the moment it actually succeeds,
  // instead of leaving a guest staring at their own freshly-loaded map
  // behind a login form they already got past.
  useEffect(() => {
    if (userId) setShowAuthPrompt(false);
  }, [userId]);

  const msSinceLastVote = useMemo(() => {
    if (!lastVoteAt) return Infinity;
    return now - lastVoteAt;
  }, [lastVoteAt, now]);

  const canVote = gpsAllowed === true && msSinceLastVote >= RATE_LIMIT_MS;

  const handleVote = useCallback(async (emotionId) => {
    // Guests can watch the live map, but voting needs an account — prompt
    // sign-in right at the moment of intent instead of silently no-oping.
    if (!userId) { setShowAuthPrompt(true); return; }
    if (!canVote || !coords) return;

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
    setLastVoteAt(Date.now());
    setLastVotedEmotion(emotionId);
    setTimeout(() => setLastVotedEmotion(null), 1000);

    try {
      // cast_vote (not a raw insert): atomically deactivates whatever vote
      // this user had showing and inserts the new one, so only ever one of
      // their pins is live on the map at a time — see
      // supabase_single_active_vote.sql. Falls back to a plain insert if
      // that migration hasn't been run on this Supabase project yet (error
      // 42883 = function does not exist), so a deploy never breaks voting
      // entirely just because the SQL side landed a moment later.
      let { error } = await supabase.rpc('cast_vote', {
        p_emotion: emotionId,
        p_lat: lat,
        p_lng: lng,
        p_session_id: SESSION_ID,
      });
      if (error?.code === '42883' || error?.code === 'PGRST202') {
        ({ error } = await supabase.from('emotions').insert(event));
      }
      if (error) {
        console.error('Supabase cast_vote error:', error);
        setLastVoteAt(null);
      } else {
        triggerMirror(coords, emotionId);
        // Don't make the voter wait up to 15s for the next scheduled poll
        // to see their own vote on the grid — the mood-grid cell IS now
        // the single source of truth for "is my vote visible" (no more
        // separate personal-aura layer), so it needs to reflect this
        // instantly.
        moodGrid.refetch();
      }
    } catch (err) {
      console.error('Unexpected insert error:', err);
      setLastVoteAt(null);
    }
  }, [canVote, coords, userId, triggerMirror, moodGrid.refetch]);

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

  const handleNavChange = useCallback((tab) => {
    // Friends/Profile DO switch tabs even for a guest now — they land on a
    // small "sign in required" placeholder (rendered below) instead of the
    // real page, with the bottom nav still fully visible underneath. A
    // full-screen Auth modal here was a dead end: it covers the whole
    // viewport INCLUDING the bottom nav, so there was no way back to Map
    // except the tiny close button — exactly the "trapped" bug reported.
    setActiveTab(tab);
  }, []);

  const promptText =
    !gpsAllowed ? t('vote_prompt_need_location')
    : canVote ? t('vote_prompt_ready')
    : t('vote_prompt_cooldown', { s: remainingSec });

  return (
    <div className="app-shell">
      {isLoading && <LoadingScreen onComplete={handleLoadingComplete} />}

      {activeTab === 'map' && (
        <header className="app-top">
          <div className="app-top-row">
            <div className="app-brand">
              <IconGlobe className="app-brand-icon" aria-hidden width={22} height={22} />
              <h1 className="app-brand-name">Pulse</h1>
            </div>
            {userId ? (
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
            ) : (
              // Guest browsing the live map with no account yet — the one
              // always-visible, proactive way in, instead of only ever
              // reacting to a blocked action.
              <button
                type="button"
                className="app-pill-btn"
                onClick={() => setShowAuthPrompt(true)}
              >
                <span>{t('auth_submit_signin')}</span>
              </button>
            )}
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
              onClick={() => setShowPartnerRequest(true)}
              aria-label={t('partner_request_open')}
              title={t('partner_request_open')}
            >
              <IconBuilding width={18} height={18} />
            </button>
          </div>
        </header>
      )}

      {showShareCard && (
        <ShareCard userId={userId} lang={lang} t={t} onClose={() => setShowShareCard(false)} />
      )}

      {showAuthPrompt && (
        <Auth onClose={() => setShowAuthPrompt(false)} />
      )}

      {showPartnerRequest && (
        <PartnerRequestForm userId={userId} t={t} onClose={() => setShowPartnerRequest(false)} />
      )}

      {activeTab === 'profile' && (
        userId ? (
          <Profile
            userId={userId}
            lang={lang}
            setLang={setLang}
            t={t}
            onLogout={handleLogout}
            onOpenFriends={() => setActiveTab('friends')}
            onOpenDetails={() => setShowOwnDetails(true)}
            onOpenVenueCRM={() => setShowVenueCRM(true)}
            onPartnerRequest={() => setShowPartnerRequest(true)}
          />
        ) : (
          <GuestGate t={t} onSignIn={() => setShowAuthPrompt(true)} onPartnerRequest={() => setShowPartnerRequest(true)} />
        )
      )}

      {showOwnDetails && (
        <ProfileDetails userId={userId} t={t} onClose={() => setShowOwnDetails(false)} />
      )}

      {viewDetailsFor && (
        <FriendDetails
          friendId={viewDetailsFor.friendId}
          friendName={viewDetailsFor.friendName}
          t={t}
          onClose={() => setViewDetailsFor(null)}
        />
      )}

      {activeTab === 'pulses' && (
        <PulsesPage
          session={session}
          t={t}
          onReady={(api) => { pulsesApiRef.current = api; }}
          onRequireAuth={() => setShowAuthPrompt(true)}
        />
      )}

      {activeTab === 'friends' && (
        userId ? (
          <FriendsPage
            userId={userId}
            t={t}
            onlineIds={onlineIds}
            onOpenDetails={(friendId, friendName) => setViewDetailsFor({ friendId, friendName })}
          />
        ) : (
          <GuestGate t={t} onSignIn={() => setShowAuthPrompt(true)} onPartnerRequest={() => setShowPartnerRequest(true)} />
        )
      )}

      <main className="app-map-area" style={{ display: activeTab === 'map' ? undefined : 'none' }}>
        <MapView
          coords={coords}
          viewCenter={viewCenter}
          onBoundsChange={handleBoundsChange}
          onZoomChange={handleZoomChange}
          pulses={pulseBatch}
          moodGridCells={showReplay && hourlyGrids ? hourlyGrids[replayHour] : moodGrid.cells}
          venues={venues}
          onVenueClick={setViewVenueId}
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

            <button type="button" className="info-panel-close" onClick={() => setShowInfo(false)}>{t('close')}</button>
          </div>
        )}

        {showVenueCRM && (
          <VenueCRM
            userId={userId}
            coords={coords}
            t={t}
            onClose={() => setShowVenueCRM(false)}
            onSaved={({ lat, lng }) => setViewCenter({ lat, lng, zoom: 16 })}
          />
        )}

        {viewVenueId && (
          <VenueModal
            venueId={viewVenueId}
            t={t}
            onClose={() => setViewVenueId(null)}
          />
        )}

        {showReplay && (
          <div className="replay-bar" role="group" aria-label={t('replay_open')}>
            <button type="button" className="replay-icon-btn" onClick={() => setReplayPlaying((p) => !p)}>
              {replayPlaying ? <IconPause width={14} height={14} /> : <IconPlay width={14} height={14} />}
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

      {activeTab === 'map' && (
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
      )}

      <BottomNav
        activeTab={activeTab}
        onChangeTab={handleNavChange}
        friendsBadgeCount={profileBadgeCount}
        t={t}
        onCreatePulse={() => pulsesApiRef.current?.openComposer()}
      />
    </div>
  );
}

// Shown in place of Friends/Profile for a guest — the bottom nav stays
// fully visible and usable above it (unlike the Auth overlay, which
// covers the whole screen), so tapping back to Map always just works.
function GuestGate({ t, onSignIn, onPartnerRequest }) {
  return (
    <section className="guest-gate" aria-label="Sign in required">
      <IconGlobe className="guest-gate-icon" aria-hidden width={36} height={36} />
      <p className="guest-gate-text">{t('auth_tagline_signin')}</p>
      <button type="button" className="guest-gate-btn" onClick={onSignIn}>
        {t('auth_submit_signin')}
      </button>
      {onPartnerRequest && (
        <button type="button" className="guest-gate-link" onClick={onPartnerRequest}>
          <IconBuilding width={14} height={14} /> {t('partner_request_open')}
        </button>
      )}
    </section>
  );
}
