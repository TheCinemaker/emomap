// src/components/VenueModal.jsx
// What anyone sees when they tap a venue pin on the map — the "flyer" a
// partner set up in VenueCRM.jsx, plus a live local mood read and a
// one-tap route there. Increments views/clicks server-side (atomic RPC,
// not a racy client-side +1) so the partner's CRM stats are real.
import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { fetchVenueMood } from '../venueMood';
import { IconUser } from './Icons';

export default function VenueModal({ venueId, t, onClose }) {
  const [venue, setVenue] = useState(null);
  const [mood, setMood] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from('venues')
        .select('id, name, category, lat, lng, logo_url, flyer_url, headline, description, cta_label, cta_url')
        .eq('id', venueId)
        .single();
      if (cancelled) return;
      if (error || !data) { setLoading(false); return; }
      setVenue(data);
      setLoading(false);
      supabase.rpc('increment_venue_counter', { p_venue_id: venueId, p_counter: 'views' });
      fetchVenueMood(data.lat, data.lng).then((m) => { if (!cancelled) setMood(m); });
    }
    load();
    return () => { cancelled = true; };
  }, [venueId]);

  const trackClick = () => {
    supabase.rpc('increment_venue_counter', { p_venue_id: venueId, p_counter: 'clicks' });
  };

  const handleCta = () => {
    trackClick();
    if (venue?.cta_url) window.open(venue.cta_url, '_blank', 'noopener');
  };

  const handleDirections = () => {
    trackClick();
    if (!venue) return;
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${venue.lat},${venue.lng}`, '_blank', 'noopener');
  };

  return (
    <div className="venue-modal-overlay" onClick={onClose}>
      <div className="venue-modal-panel" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="venue-modal-close" onClick={onClose}>×</button>

        {loading && <p className="venue-modal-status">…</p>}
        {!loading && !venue && <p className="venue-modal-status">{t('venue_modal_not_found')}</p>}

        {!loading && venue && (
          <>
            <div className="venue-modal-header">
              <div className="venue-modal-logo" style={{ backgroundImage: venue.logo_url ? `url(${venue.logo_url})` : undefined }}>
                {!venue.logo_url && <IconUser width={22} height={22} />}
              </div>
              <div className="venue-modal-header-text">
                <h2 className="venue-modal-name">{venue.name}</h2>
                {mood && <span className="venue-modal-mood">{mood.percent}% {t(`emotion_${mood.dominant}`)} {t('venue_modal_right_now')}</span>}
              </div>
            </div>

            {venue.flyer_url && <img src={venue.flyer_url} alt="" className="venue-modal-flyer" />}
            {venue.headline && <h3 className="venue-modal-headline">{venue.headline}</h3>}
            {venue.description && <p className="venue-modal-description">{venue.description}</p>}

            <div className="venue-modal-actions">
              {venue.cta_url && (
                <button type="button" className="venue-modal-btn primary" onClick={handleCta}>
                  {venue.cta_label || t('venue_modal_cta_default')}
                </button>
              )}
              <button type="button" className="venue-modal-btn" onClick={handleDirections}>
                {t('venue_modal_directions')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
