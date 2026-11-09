// src/components/ShareCard.jsx
// The growth engine: a Story-format (1080x1920) weekly mood recap, rendered
// client-side on a canvas, downloadable or shareable via the Web Share API.
// This is what's supposed to make users market the app for us, per the
// product direction ("ők csinálják virálissá, ne nekem kelljen").
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { EMOTIONS } from '../emotions';
import { USER_PATH_D } from './Icons';

const CARD_W = 1080;
const CARD_H = 1920;
const WINDOW_DAYS = 7;
const AVATAR_CX = CARD_W / 2;
const AVATAR_CY = 470;
const AVATAR_R = 150;

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

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

async function drawAvatar(ctx, avatarUrl, dominantColor) {
  // Soft ring glow behind the avatar, tighter than the page-wide one — this
  // is the card's centerpiece, it should read as one first.
  const ringGlow = ctx.createRadialGradient(AVATAR_CX, AVATAR_CY, AVATAR_R * 0.6, AVATAR_CX, AVATAR_CY, AVATAR_R * 1.8);
  ringGlow.addColorStop(0, hexToColorAlpha(dominantColor, 0.55));
  ringGlow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = ringGlow;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  ctx.save();
  ctx.beginPath();
  ctx.arc(AVATAR_CX, AVATAR_CY, AVATAR_R, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  let drew = false;
  if (avatarUrl) {
    try {
      const img = await loadImage(avatarUrl);
      const scale = Math.max((AVATAR_R * 2) / img.width, (AVATAR_R * 2) / img.height);
      const dw = img.width * scale, dh = img.height * scale;
      ctx.drawImage(img, AVATAR_CX - dw / 2, AVATAR_CY - dh / 2, dw, dh);
      drew = true;
    } catch (err) {
      console.warn('[ShareCard] avatar image failed to load, using fallback:', err);
    }
  }
  if (!drew) {
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(AVATAR_CX - AVATAR_R, AVATAR_CY - AVATAR_R, AVATAR_R * 2, AVATAR_R * 2);
  }
  ctx.restore();

  if (!drew) {
    // Same user-silhouette glyph as the rest of the app's avatar fallbacks
    // (Profile/Friends), drawn as a vector path rather than an emoji glyph.
    ctx.save();
    ctx.translate(AVATAR_CX, AVATAR_CY);
    const scale = (AVATAR_R * 1.5) / 24;
    ctx.scale(scale, scale);
    ctx.translate(-12, -12);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fill(new Path2D(USER_PATH_D));
    ctx.restore();
  }

  ctx.beginPath();
  ctx.arc(AVATAR_CX, AVATAR_CY, AVATAR_R + 5, 0, Math.PI * 2);
  ctx.lineWidth = 9;
  ctx.strokeStyle = dominantColor;
  ctx.stroke();
}

function hexToColorAlpha(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

async function drawCard(canvas, stats, lang, t, avatarUrl) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  const dominantColor = EMOTION_COLOR[stats.dominant] || '#6366f1';
  const { r, g, b } = hexToRgb(dominantColor);

  // Background and overall tone always derive from the dominant mood —
  // this card is meant to look different every week, not be a fixed template.
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, `rgba(${r},${g},${b},0.55)`);
  bg.addColorStop(0.45, 'rgba(10,12,16,1)');
  bg.addColorStop(1, '#05060a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const sys = '-apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif';
  ctx.textAlign = 'center';

  // No emoji on the generated card either — draw a tiny vector globe glyph
  // (same shape as Icons.jsx's IconGlobe: outer circle + meridian ellipse +
  // equator line) to the left of the brand text instead of relying on the
  // system emoji font to render 🌍 consistently across devices.
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = `600 44px ${sys}`;
  const brandText = 'Pulse';
  const brandIconR = 20;
  const brandGap = 14;
  const brandTextWidth = ctx.measureText(brandText).width;
  const brandTotalWidth = brandIconR * 2 + brandGap + brandTextWidth;
  const brandStartX = W / 2 - brandTotalWidth / 2;
  const brandIconCx = brandStartX + brandIconR;
  const brandIconCy = 140 - 14;

  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(brandIconCx, brandIconCy, brandIconR, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(brandIconCx, brandIconCy, brandIconR * 0.45, brandIconR, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(brandIconCx - brandIconR, brandIconCy); ctx.lineTo(brandIconCx + brandIconR, brandIconCy); ctx.stroke();
  ctx.restore();

  ctx.textAlign = 'left';
  ctx.fillText(brandText, brandStartX + brandIconR * 2 + brandGap, 140);
  ctx.textAlign = 'center';

  const locale = LOCALE_BY_LANG[lang] || 'en-US';
  const now = new Date();
  const weekAgo = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const fmt = (d) => d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = `500 30px ${sys}`;
  ctx.fillText(`${fmt(weekAgo)} – ${fmt(now)}`, W / 2, 190);

  // Centerpiece: the user's own photo, ringed in their dominant mood's color.
  await drawAvatar(ctx, avatarUrl, dominantColor);

  const dominantPercent = Math.round((stats.counts[stats.dominant] / stats.total) * 100);
  ctx.textAlign = 'center';
  ctx.fillStyle = dominantColor;
  ctx.font = `800 130px ${sys}`;
  ctx.fillText(`${dominantPercent}%`, W / 2, 740);

  ctx.fillStyle = '#ffffff';
  ctx.font = `700 50px ${sys}`;
  ctx.fillText(t(`emotion_${stats.dominant}`).toUpperCase(), W / 2, 810);

  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = `500 30px ${sys}`;
  ctx.fillText(t('share_card_headline'), W / 2, 860);

  const rows = Object.entries(stats.counts).sort((x, y) => y[1] - x[1]);
  const barStartY = 950;
  const barGap = 105;
  const barMaxW = W - 200;

  rows.forEach(([emotionId, count], i) => {
    const y = barStartY + i * barGap;
    const pct = count / stats.total;
    const color = EMOTION_COLOR[emotionId] || '#999';

    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = `600 32px ${sys}`;
    ctx.fillText(t(`emotion_${emotionId}`), 100, y);

    ctx.textAlign = 'right';
    ctx.fillStyle = color;
    ctx.font = `700 32px ${sys}`;
    ctx.fillText(`${Math.round(pct * 100)}%`, W - 100, y);

    const trackY = y + 16;
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
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloadUrl, setDownloadUrl] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const [{ data, error }, { data: profile }] = await Promise.all([
        supabase.from('emotions').select('emotion').eq('user_id', userId).gte('inserted_at', since).limit(2000),
        supabase.from('profiles').select('avatar_url').eq('id', userId).single(),
      ]);

      if (cancelled) return;
      setAvatarUrl(profile?.avatar_url || null);

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
    let cancelled = false;
    drawCard(canvasRef.current, stats, lang, t, avatarUrl).then(() => {
      if (cancelled || !canvasRef.current) return;
      try {
        canvasRef.current.toBlob((blob) => {
          if (blob) setDownloadUrl(URL.createObjectURL(blob));
        }, 'image/png');
      } catch (err) {
        // A cross-origin avatar without CORS headers would "taint" the
        // canvas — the card still renders fine on screen, it just can't be
        // exported. Don't crash the whole card over that.
        console.warn('[ShareCard] could not export canvas (tainted?):', err);
      }
    });
    return () => { cancelled = true; };
  }, [stats, lang, t, avatarUrl]);

  const handleDownload = () => {
    if (!downloadUrl) return;
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = 'pulse-weekly.png';
    a.click();
  };

  const handleShare = () => {
    if (!canvasRef.current) return;
    try {
      canvasRef.current.toBlob(async (blob) => {
        if (!blob) return;
        const file = new File([blob], 'pulse-weekly.png', { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try { await navigator.share({ files: [file], title: 'Pulse' }); } catch { /* cancelled */ }
        } else {
          handleDownload();
        }
      }, 'image/png');
    } catch {
      handleDownload();
    }
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
