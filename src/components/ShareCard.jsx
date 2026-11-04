// src/components/ShareCard.jsx
// The growth engine: a Story-format (1080x1920) weekly mood recap, rendered
// client-side on a canvas, downloadable or shareable via the Web Share API.
// This is what's supposed to make users market the app for us, per the
// product direction ("ők csinálják virálissá, ne nekem kelljen").
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { EMOTIONS } from '../emotions';

const CARD_W = 1080;
const CARD_H = 1920;
const WINDOW_DAYS = 7;

const EMOTION_COLOR = EMOTIONS.reduce((acc, e) => ({ ...acc, [e.id]: e.color }), {});
const LOCALE_BY_LANG = { hu: 'hu-HU', de: 'de-DE', en: 'en-US' };

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCard(canvas, stats, lang, t) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  const dominantColor = EMOTION_COLOR[stats.dominant] || '#6366f1';
  const { r, g, b } = hexToRgb(dominantColor);

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, `rgba(${r},${g},${b},0.55)`);
  bg.addColorStop(0.45, 'rgba(10,12,16,1)');
  bg.addColorStop(1, '#05060a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W / 2, 520, 40, W / 2, 520, 520);
  glow.addColorStop(0, `rgba(${r},${g},${b},0.45)`);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const sys = '-apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif';
  ctx.textAlign = 'center';

  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = `600 44px ${sys}`;
  ctx.fillText('🌍 EmoMap', W / 2, 140);

  const locale = LOCALE_BY_LANG[lang] || 'en-US';
  const now = new Date();
  const weekAgo = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const fmt = (d) => d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = `500 30px ${sys}`;
  ctx.fillText(`${fmt(weekAgo)} – ${fmt(now)}`, W / 2, 190);

  const dominantPercent = Math.round((stats.counts[stats.dominant] / stats.total) * 100);
  ctx.fillStyle = dominantColor;
  ctx.font = `800 160px ${sys}`;
  ctx.fillText(`${dominantPercent}%`, W / 2, 580);

  ctx.fillStyle = '#ffffff';
  ctx.font = `700 56px ${sys}`;
  ctx.fillText(t(`emotion_${stats.dominant}`).toUpperCase(), W / 2, 660);

  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = `500 32px ${sys}`;
  ctx.fillText(t('share_card_headline'), W / 2, 720);

  const rows = Object.entries(stats.counts).sort((x, y) => y[1] - x[1]);
  const barStartY = 860;
  const barGap = 110;
  const barMaxW = W - 200;

  rows.forEach(([emotionId, count], i) => {
    const y = barStartY + i * barGap;
    const pct = count / stats.total;
    const color = EMOTION_COLOR[emotionId] || '#999';

    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = `600 34px ${sys}`;
    ctx.fillText(t(`emotion_${emotionId}`), 100, y);

    ctx.textAlign = 'right';
    ctx.fillStyle = color;
    ctx.font = `700 34px ${sys}`;
    ctx.fillText(`${Math.round(pct * 100)}%`, W - 100, y);

    const trackY = y + 18;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    roundRect(ctx, 100, trackY, barMaxW, 14, 7);
    ctx.fill();

    ctx.fillStyle = color;
    roundRect(ctx, 100, trackY, Math.max(14, barMaxW * pct), 14, 7);
    ctx.fill();
  });

  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = `500 28px ${sys}`;
  ctx.fillText(t('share_card_footer', { total: stats.total }), W / 2, H - 90);
}

export default function ShareCard({ userId, lang, t, onClose }) {
  const canvasRef = useRef(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloadUrl, setDownloadUrl] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('emotions')
        .select('emotion')
        .eq('user_id', userId)
        .gte('inserted_at', since)
        .limit(2000);

      if (cancelled) return;
      if (error || !data || data.length === 0) {
        setStats(null);
        setLoading(false);
        return;
      }

      const counts = {};
      data.forEach((row) => { counts[row.emotion] = (counts[row.emotion] || 0) + 1; });
      const total = data.length;
      const dominant = Object.entries(counts).sort((x, y) => y[1] - x[1])[0][0];
      setStats({ total, counts, dominant });
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => {
    if (!stats || !canvasRef.current) return;
    drawCard(canvasRef.current, stats, lang, t);
    canvasRef.current.toBlob((blob) => {
      if (blob) setDownloadUrl(URL.createObjectURL(blob));
    }, 'image/png');
  }, [stats, lang, t]);

  const handleDownload = () => {
    if (!downloadUrl) return;
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = 'emomap-weekly.png';
    a.click();
  };

  const handleShare = () => {
    if (!canvasRef.current) return;
    canvasRef.current.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], 'emomap-weekly.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: 'EmoMap' }); } catch { /* cancelled */ }
      } else {
        handleDownload();
      }
    }, 'image/png');
  };

  return (
    <div className="share-card-overlay" onClick={onClose}>
      <div className="share-card-panel" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="share-card-close" onClick={onClose}>×</button>

        {loading && <p className="share-card-status">{t('share_card_loading')}</p>}
        {!loading && !stats && <p className="share-card-status">{t('share_card_no_data')}</p>}

        {!loading && stats && (
          <>
            <canvas ref={canvasRef} width={CARD_W} height={CARD_H} className="share-card-canvas" />
            <div className="share-card-actions">
              <button type="button" className="share-card-btn primary" onClick={handleShare}>{t('share_card_share')}</button>
              <button type="button" className="share-card-btn" onClick={handleDownload}>{t('share_card_download')}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
