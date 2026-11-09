// src/components/AvatarCropper.jsx
// Drag-to-position + zoom avatar cropper — user's explicit ask (2026-11-09):
// "a profilképet ugy kell tudni feltölteni, hogy bele tudjam huzni pont a
// körbe" (upload the photo so I can drag it to sit exactly in the circle).
// No crop library added on purpose — this project deliberately keeps
// dependencies minimal (just supabase-js + maplibre-gl + react), and the
// actual math here (pan clamped to always cover a circular viewport, plus
// a zoom slider) is simple enough not to need one.
import { useRef, useState, useCallback, useEffect } from 'react';
import { IconClose, IconCheck } from './Icons';

const VIEWPORT_SIZE = 240; // on-screen circle diameter, px
const OUTPUT_SIZE = 480;   // exported square image, px

export default function AvatarCropper({ file, t, onCancel, onConfirm }) {
  const [imgEl, setImgEl] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const dragRef = useRef(null); // { startX, startY, startOffsetX, startOffsetY } | null

  // Load the picked file into an <img> once, to read its natural size.
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setImgEl(img);
      // Start centered: the image's shorter side exactly covers the circle.
      const baseScale = VIEWPORT_SIZE / Math.min(img.naturalWidth, img.naturalHeight);
      const dispW = img.naturalWidth * baseScale;
      const dispH = img.naturalHeight * baseScale;
      setOffset({ x: (VIEWPORT_SIZE - dispW) / 2, y: (VIEWPORT_SIZE - dispH) / 2 });
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const getScale = useCallback(() => {
    if (!imgEl) return 1;
    return (VIEWPORT_SIZE / Math.min(imgEl.naturalWidth, imgEl.naturalHeight)) * zoom;
  }, [imgEl, zoom]);

  // Keeps the image always fully covering the circular viewport — you can
  // pan within the overflow, never past the edge into empty space.
  const clampOffset = useCallback((next, scale) => {
    if (!imgEl) return next;
    const dispW = imgEl.naturalWidth * scale;
    const dispH = imgEl.naturalHeight * scale;
    const minX = Math.min(0, VIEWPORT_SIZE - dispW);
    const minY = Math.min(0, VIEWPORT_SIZE - dispH);
    return {
      x: Math.min(0, Math.max(minX, next.x)),
      y: Math.min(0, Math.max(minY, next.y)),
    };
  }, [imgEl]);

  const handlePointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, startOffset: offset };
  };
  const handlePointerMove = (e) => {
    if (!dragRef.current) return;
    const { startX, startY, startOffset } = dragRef.current;
    const next = { x: startOffset.x + (e.clientX - startX), y: startOffset.y + (e.clientY - startY) };
    setOffset(clampOffset(next, getScale()));
  };
  const handlePointerUp = () => { dragRef.current = null; };

  const handleZoomChange = (e) => {
    const nextZoom = Number(e.target.value);
    setZoom(nextZoom);
    if (!imgEl) return;
    const nextScale = (VIEWPORT_SIZE / Math.min(imgEl.naturalWidth, imgEl.naturalHeight)) * nextZoom;
    setOffset((prev) => clampOffset(prev, nextScale));
  };

  const handleConfirm = () => {
    if (!imgEl) return;
    setSaving(true);
    const scale = getScale();
    const outputScale = OUTPUT_SIZE / VIEWPORT_SIZE;
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext('2d');
    // Draws the whole image at the on-screen pan/zoom, scaled up to the
    // output resolution — reproduces exactly what the circle preview
    // showed; the canvas itself clips anything outside its own bounds.
    ctx.drawImage(
      imgEl,
      offset.x * outputScale,
      offset.y * outputScale,
      imgEl.naturalWidth * scale * outputScale,
      imgEl.naturalHeight * scale * outputScale
    );
    canvas.toBlob((blob) => {
      setSaving(false);
      if (blob) onConfirm(blob);
    }, 'image/jpeg', 0.88);
  };

  return (
    <div className="auth-screen" onClick={onCancel}>
      <div className="auth-card avatar-cropper-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="auth-close" onClick={onCancel} aria-label={t('close')}>
          <IconClose width={16} height={16} />
        </button>
        <h1 className="auth-brand-name" style={{ marginBottom: 4 }}>{t('profile_avatar_change')}</h1>
        <p className="auth-tagline" style={{ marginBottom: 18 }}>{t('avatar_cropper_hint')}</p>

        <div
          className="avatar-cropper-viewport"
          style={{ width: VIEWPORT_SIZE, height: VIEWPORT_SIZE }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {imgEl && (
            <img
              src={imgEl.src}
              alt=""
              draggable={false}
              style={{
                position: 'absolute',
                left: offset.x,
                top: offset.y,
                width: imgEl.naturalWidth * getScale(),
                height: imgEl.naturalHeight * getScale(),
                maxWidth: 'none',
                pointerEvents: 'none',
              }}
            />
          )}
        </div>

        <input
          type="range"
          className="avatar-cropper-zoom"
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          onChange={handleZoomChange}
        />

        <button type="button" className="auth-submit" onClick={handleConfirm} disabled={!imgEl || saving}>
          {saving ? t('auth_submit_loading') : <><IconCheck width={15} height={15} /> {t('details_save')}</>}
        </button>
      </div>
    </div>
  );
}
