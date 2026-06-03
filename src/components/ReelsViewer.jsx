import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../supabaseClient';

const REELS_LIMIT = 15;
const EXPIRES_MINUTES = 20;

export default function ReelsViewer({ session }) {
  const [reels, setReels]           = useState([]);
  const [uploading, setUploading]   = useState(false);
  const [uploadError, setUploadError] = useState(null);

  // Viewer state
  const [viewerOpen, setViewerOpen]   = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [originRect, setOriginRect]   = useState(null); // DOMRect of clicked thumb
  const [zoomed, setZoomed]           = useState(false); // animation step

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchReels = useCallback(async () => {
    const { data, error } = await supabase
      .from('reels')
      .select('id, image_url, created_at, user_id')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(REELS_LIMIT);

    if (error) { console.error('Reels fetch error:', error); return; }
    if (!data?.length) { setReels([]); return; }

    // Fetch usernames
    const ids = [...new Set(data.map(r => r.user_id))];
    const { data: profiles } = await supabase
      .from('profiles').select('id, username').in('id', ids);
    const pm = (profiles || []).reduce((a, p) => ({ ...a, [p.id]: p }), {});

    setReels(data.map(r => ({
      ...r,
      username: pm[r.user_id]?.username || 'Ismeretlen'
    })));
  }, []);

  useEffect(() => {
    fetchReels();
    const ch = supabase.channel('reels_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reels' }, fetchReels)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [fetchReels]);

  // ── Upload ─────────────────────────────────────────────────────────────────
  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);

    try {
      const ext      = file.name.split('.').pop();
      const filePath = `${session.user.id}_${Date.now()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from('reels').upload(filePath, file);
      if (upErr) throw upErr;

      const { data: { publicUrl } } = supabase.storage
        .from('reels').getPublicUrl(filePath);

      // Explicit 20-min expiry
      const expiresAt = new Date(Date.now() + EXPIRES_MINUTES * 60 * 1000).toISOString();

      const { error: dbErr } = await supabase
        .from('reels')
        .insert({ user_id: session.user.id, image_url: publicUrl, expires_at: expiresAt });
      if (dbErr) throw dbErr;

      await fetchReels();
    } catch (err) {
      console.error('Upload failed:', err);
      setUploadError(err.message);
    } finally {
      setUploading(false);
      e.target.value = null;
    }
  };

  // ── Viewer open / close ────────────────────────────────────────────────────
  const openViewer = (index, el) => {
    const rect = el.getBoundingClientRect();
    setOriginRect(rect);
    setViewerIndex(index);
    setViewerOpen(true);
    // Small delay so the overlay renders before we trigger the zoom transition
    requestAnimationFrame(() => requestAnimationFrame(() => setZoomed(true)));
  };

  const closeViewer = () => {
    setZoomed(false);
    setTimeout(() => { setViewerOpen(false); setOriginRect(null); }, 350);
  };

  const goPrev = (e) => { e.stopPropagation(); setViewerIndex(i => Math.max(0, i - 1)); };
  const goNext = (e) => { e.stopPropagation(); setViewerIndex(i => Math.min(reels.length - 1, i + 1)); };

  // Keyboard nav
  useEffect(() => {
    if (!viewerOpen) return;
    const onKey = (e) => {
      if (e.key === 'ArrowLeft')  setViewerIndex(i => Math.max(0, i - 1));
      if (e.key === 'ArrowRight') setViewerIndex(i => Math.min(reels.length - 1, i + 1));
      if (e.key === 'Escape')     closeViewer();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewerOpen, reels.length]);

  // ── Compute viewer transform (zoom from origin rect) ───────────────────────
  const viewerStyle = (() => {
    if (!originRect || !viewerOpen) return {};
    const vw = window.innerWidth, vh = window.innerHeight;
    const fromX = originRect.left + originRect.width  / 2 - vw / 2;
    const fromY = originRect.top  + originRect.height / 2 - vh / 2;
    const scaleX = originRect.width  / vw;
    const scaleY = originRect.height / vh;

    if (!zoomed) {
      return {
        transform: `translate(${fromX}px, ${fromY}px) scale(${scaleX}, ${scaleY})`,
        borderRadius: '50%',
        opacity: 0.6,
      };
    }
    return {
      transform: 'translate(0,0) scale(1)',
      borderRadius: '0',
      opacity: 1,
    };
  })();

  const current = reels[viewerIndex];

  return (
    <>
      {/* ── Thumbnail strip ───────────────────────────────────────────── */}
      <div className="reels-container">
        <div className="reels-scroll">

          {/* Upload button */}
          <label className="reel-thumb reel-thumb--add" title="Story hozzáadása">
            <div className="reel-thumb-img reel-thumb-img--add">
              {uploading ? <span className="reel-spinner" /> : <span>+</span>}
            </div>
            <span className="reel-label">Te</span>
            <input
              type="file"
              accept="image/*"
              onChange={handleUpload}
              style={{ display: 'none' }}
              disabled={uploading}
            />
          </label>

          {/* Reel thumbnails */}
          {reels.map((reel, i) => (
            <button
              key={reel.id}
              className="reel-thumb"
              onClick={(e) => openViewer(i, e.currentTarget.querySelector('.reel-thumb-img'))}
            >
              <div
                className="reel-thumb-img"
                style={{ backgroundImage: `url(${reel.image_url})` }}
              />
              <span className="reel-label">{reel.username}</span>
            </button>
          ))}

        </div>
        {uploadError && <div className="reel-upload-error">{uploadError}</div>}
      </div>

      {/* ── Fullscreen viewer ─────────────────────────────────────────── */}
      {viewerOpen && current && (
        <div
          className="rv-backdrop"
          onClick={closeViewer}
        >
          <div
            className="rv-panel"
            style={{ ...viewerStyle, transition: 'transform 350ms cubic-bezier(0.4,0,0.2,1), border-radius 350ms, opacity 250ms' }}
            onClick={e => e.stopPropagation()}
          >
            <img
              src={current.image_url}
              alt="Story"
              className="rv-image"
            />

            {/* Header overlay */}
            <div className="rv-header">
              <span className="rv-username">{current.username}</span>
              <button className="rv-close" onClick={closeViewer}>×</button>
            </div>

            {/* Progress dots */}
            {reels.length > 1 && (
              <div className="rv-dots">
                {reels.map((_, i) => (
                  <span key={i} className={`rv-dot${i === viewerIndex ? ' rv-dot--active' : ''}`} />
                ))}
              </div>
            )}

            {/* Navigation arrows */}
            {viewerIndex > 0 && (
              <button className="rv-nav rv-nav--prev" onClick={goPrev}>‹</button>
            )}
            {viewerIndex < reels.length - 1 && (
              <button className="rv-nav rv-nav--next" onClick={goNext}>›</button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
