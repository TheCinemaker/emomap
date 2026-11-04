// src/components/VenueClaim.jsx
// Free venue registration — the "bar/café/club shows up on the map" growth
// mechanic. No payment here; this just gets the venue onto the map so its
// owner has something to later pay to Boost (see STRIPE_BOOST_SETUP.md).
import { useState } from 'react';
import { supabase } from '../supabaseClient';

export default function VenueClaim({ coords, userId, t, onClose, onClaimed }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || !coords || !userId) return;

    setSaving(true);
    setError(null);
    try {
      const { error: insertError } = await supabase
        .from('venues')
        .insert({ owner_id: userId, name: trimmed, lat: coords.lat, lng: coords.lng });
      if (insertError) throw insertError;
      onClaimed?.();
      onClose();
    } catch (err) {
      console.error('Venue claim failed:', err);
      setError(err.message || t('venue_claim_error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="venue-claim-overlay" onClick={onClose}>
      <div className="venue-claim-panel" onClick={(e) => e.stopPropagation()}>
        <h2 className="venue-claim-title">{t('venue_claim_title')}</h2>
        <p className="venue-claim-hint">{t('venue_claim_hint')}</p>

        <form onSubmit={handleSubmit} className="venue-claim-form">
          <input
            type="text"
            placeholder={t('venue_claim_name_placeholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            required
            autoFocus
          />
          {error && <div className="venue-claim-error">{error}</div>}
          <div className="venue-claim-actions">
            <button type="button" className="venue-claim-btn" onClick={onClose}>{t('close')}</button>
            <button type="submit" className="venue-claim-btn primary" disabled={saving || !name.trim()}>
              {saving ? '…' : t('venue_claim_submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
