// src/components/VenueCRM.jsx
// Partner admin panel — only reachable if profiles.is_partner = true
// (Phase 1: manually flipped in the Supabase SQL editor, see
// VENUE_CRM_PLAN.md). One venue per partner account for now. The pin
// placement uses the "fixed center pin, drag the map underneath it" pattern
// (Uber-style) instead of a draggable marker — much less to get wrong than
// marker drag-handling, and just as precise.
import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { supabase } from '../supabaseClient';
import { compressImage } from '../imageCompress';
import { fetchVenueMood } from '../venueMood';
import { IconPin } from './Icons';

const CATEGORIES = ['club', 'bar', 'restaurant', 'cafe', 'event'];

export default function VenueCRM({ userId, coords, t, onClose }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);

  const [venue, setVenue] = useState(null);
  const [center, setCenter] = useState(null);
  const [form, setForm] = useState({ name: '', category: 'club', headline: '', description: '', cta_label: '', cta_url: '' });
  const [logoUrl, setLogoUrl] = useState(null);
  const [flyerUrl, setFlyerUrl] = useState(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingFlyer, setUploadingFlyer] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  const [mood, setMood] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await supabase.from('venues').select('*').eq('owner_id', userId).maybeSingle();
      if (cancelled) return;
      if (data) {
        setVenue(data);
        setForm({
          name: data.name || '', category: data.category || 'club',
          headline: data.headline || '', description: data.description || '',
          cta_label: data.cta_label || '', cta_url: data.cta_url || '',
        });
        setLogoUrl(data.logo_url);
        setFlyerUrl(data.flyer_url);
        setCenter({ lat: data.lat, lng: data.lng });
        fetchVenueMood(data.lat, data.lng).then((m) => { if (!cancelled) setMood(m); });
      } else if (coords) {
        setCenter({ lat: coords.lat, lng: coords.lng });
      } else {
        setCenter({ lat: 47.4979, lng: 19.0402 }); // fallback: Budapest, if no GPS yet
      }
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [userId, coords]);

  // Init the mini map exactly once, as soon as we know a starting center.
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current || !center) return;
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [center.lng, center.lat],
      zoom: 17,
      attributionControl: false,
    });
    map.on('move', () => {
      const c = map.getCenter();
      setCenter({ lat: c.lat, lng: c.lng });
    });
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center !== null]);

  const handleLogoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    setError(null);
    try {
      const compressed = await compressImage(file, { maxDim: 256, quality: 0.85 });
      const path = `${userId}/logo.jpg`;
      const { error: upErr } = await supabase.storage.from('venues').upload(path, compressed, { upsert: true, contentType: 'image/jpeg' });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from('venues').getPublicUrl(path);
      setLogoUrl(`${publicUrl}?v=${Date.now()}`);
    } catch (err) {
      console.error('Logo upload failed:', err);
      setError(err.message);
    } finally {
      setUploadingLogo(false);
      e.target.value = null;
    }
  };

  const handleFlyerChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFlyer(true);
    setError(null);
    try {
      const compressed = await compressImage(file, { maxDim: 1200, quality: 0.82 });
      const path = `${userId}/flyer.jpg`;
      const { error: upErr } = await supabase.storage.from('venues').upload(path, compressed, { upsert: true, contentType: 'image/jpeg' });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from('venues').getPublicUrl(path);
      setFlyerUrl(`${publicUrl}?v=${Date.now()}`);
    } catch (err) {
      console.error('Flyer upload failed:', err);
      setError(err.message);
    } finally {
      setUploadingFlyer(false);
      e.target.value = null;
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!center || !form.name.trim()) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const payload = {
        owner_id: userId,
        name: form.name.trim(),
        category: form.category,
        headline: form.headline.trim() || null,
        description: form.description.trim() || null,
        cta_label: form.cta_label.trim() || null,
        cta_url: form.cta_url.trim() || null,
        logo_url: logoUrl,
        flyer_url: flyerUrl,
        lat: center.lat,
        lng: center.lng,
        updated_at: new Date().toISOString(),
      };
      const query = venue?.id
        ? supabase.from('venues').update(payload).eq('id', venue.id).select().single()
        : supabase.from('venues').insert(payload).select().single();
      const { data, error: saveError } = await query;
      if (saveError) throw saveError;
      setVenue(data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      console.error('Venue save failed:', err);
      setError(err.message || t('venue_crm_save_error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="venue-crm-overlay" onClick={onClose}>
      <div className="venue-crm-panel" onClick={(e) => e.stopPropagation()}>
        <div className="venue-crm-header">
          <h2 className="venue-crm-title">{t('venue_crm_title')}</h2>
          <button type="button" className="venue-crm-close" onClick={onClose}>×</button>
        </div>

        {loading ? (
          <p className="venue-crm-loading">…</p>
        ) : (
          <>
            <p className="venue-crm-hint">{t('venue_crm_pin_hint')}</p>
            <div className="venue-crm-map-wrap">
              <div ref={mapContainerRef} className="venue-crm-map" />
              <div className="venue-crm-pin" aria-hidden><IconPin width={30} height={30} /></div>
            </div>

            {venue && (
              <div className="venue-crm-stats">
                <div className="venue-crm-stat"><span>{venue.views_count ?? 0}</span>{t('venue_crm_views')}</div>
                <div className="venue-crm-stat"><span>{venue.clicks_count ?? 0}</span>{t('venue_crm_clicks')}</div>
                {mood && <div className="venue-crm-stat"><span>{mood.percent}%</span>{t(`emotion_${mood.dominant}`)}</div>}
              </div>
            )}

            <form onSubmit={handleSave} className="venue-crm-form">
              <input
                type="text" placeholder={t('venue_crm_name')} value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} maxLength={60} required
              />

              <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{t(`venue_category_${c}`)}</option>)}
              </select>

              <label className="venue-crm-upload-row">
                <span className="venue-crm-upload-label">{t('venue_crm_logo')}</span>
                {logoUrl && <img src={logoUrl} alt="" className="venue-crm-logo-preview" />}
                <input type="file" accept="image/*" onChange={handleLogoChange} disabled={uploadingLogo} />
                <span className="venue-crm-upload-btn">{uploadingLogo ? '…' : t('venue_crm_upload')}</span>
              </label>

              <input
                type="text" placeholder={t('venue_crm_headline')} value={form.headline}
                onChange={(e) => setForm((f) => ({ ...f, headline: e.target.value }))} maxLength={80}
              />
              <textarea
                placeholder={t('venue_crm_description')} value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} maxLength={500} rows={3}
              />

              <label className="venue-crm-upload-row">
                <span className="venue-crm-upload-label">{t('venue_crm_flyer')}</span>
                {flyerUrl && <img src={flyerUrl} alt="" className="venue-crm-flyer-preview" />}
                <input type="file" accept="image/*" onChange={handleFlyerChange} disabled={uploadingFlyer} />
                <span className="venue-crm-upload-btn">{uploadingFlyer ? '…' : t('venue_crm_upload')}</span>
              </label>

              <input
                type="text" placeholder={t('venue_crm_cta_label')} value={form.cta_label}
                onChange={(e) => setForm((f) => ({ ...f, cta_label: e.target.value }))} maxLength={30}
              />
              <input
                type="url" placeholder={t('venue_crm_cta_url')} value={form.cta_url}
                onChange={(e) => setForm((f) => ({ ...f, cta_url: e.target.value }))}
              />

              {error && <div className="venue-crm-error">{error}</div>}
              <button type="submit" className="venue-crm-save" disabled={saving || !form.name.trim()}>
                {saving ? '…' : saved ? t('details_saved') : t('venue_crm_save')}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
