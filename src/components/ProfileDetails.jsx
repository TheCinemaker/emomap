// src/components/ProfileDetails.jsx
// Extended, opt-in profile fields with per-field visibility toggles.
// Nothing here is shown to anyone by default — the owner must explicitly
// flip each field's eye toggle on, and even then only accepted friends
// ever see it (enforced server-side, see supabase_profile_details_schema.sql).
import { useEffect, useState } from 'react';
import { useOwnProfileDetails } from '../useProfileDetails';

const FIELD_CONFIG = [
  { key: 'full_name', type: 'text', labelKey: 'details_full_name' },
  { key: 'phone', type: 'tel', labelKey: 'details_phone' },
  { key: 'address', type: 'text', labelKey: 'details_address' },
  { key: 'birth_date', type: 'date', labelKey: 'details_birth_date' },
  { key: 'contact_note', type: 'text', labelKey: 'details_contact_note' },
  { key: 'facebook_url', type: 'text', labelKey: 'details_facebook' },
  { key: 'instagram_url', type: 'text', labelKey: 'details_instagram' },
  { key: 'tiktok_url', type: 'text', labelKey: 'details_tiktok' },
  { key: 'website_url', type: 'text', labelKey: 'details_website' },
];

export default function ProfileDetails({ userId, t, onClose }) {
  const { details, loading, save } = useOwnProfileDetails(userId);
  const [values, setValues] = useState({});
  const [visible, setVisible] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!details) return;
    setValues(Object.fromEntries(FIELD_CONFIG.map((f) => [f.key, details[f.key] || ''])));
    setVisible(new Set(details.visible_fields || []));
  }, [details]);

  const toggleVisible = (key) => {
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      const patch = Object.fromEntries(FIELD_CONFIG.map((f) => [f.key, values[f.key]?.trim() ? values[f.key].trim() : null]));
      patch.visible_fields = Array.from(visible);
      await save(patch);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      console.error('[ProfileDetails] save failed:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="details-overlay" onClick={onClose}>
      <div className="details-panel" onClick={(e) => e.stopPropagation()}>
        <div className="details-header">
          <h2 className="details-title">{t('details_title')}</h2>
          <button type="button" className="details-close" onClick={onClose}>×</button>
        </div>
        <p className="details-hint">{t('details_hint')}</p>

        {loading ? (
          <p className="details-loading">…</p>
        ) : (
          <form onSubmit={handleSubmit} className="details-form">
            {FIELD_CONFIG.map((f) => (
              <div key={f.key} className="details-row">
                <label className="details-label">{t(f.labelKey)}</label>
                <div className="details-input-wrap">
                  <input
                    type={f.type}
                    value={values[f.key] || ''}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  />
                  <button
                    type="button"
                    className={`details-eye${visible.has(f.key) ? ' is-visible' : ''}`}
                    onClick={() => toggleVisible(f.key)}
                    title={visible.has(f.key) ? t('details_visible') : t('details_hidden')}
                  >
                    {visible.has(f.key) ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                        <path d="M12 5c-5.5 0-9.3 4.3-10.5 7 1.2 2.7 5 7 10.5 7s9.3-4.3 10.5-7C21.3 9.3 17.5 5 12 5Zm0 11.5a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9Z"/>
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                        <path d="M3.5 2.5 21.5 20.5 20 22l-3-3c-1.5.6-3.2 1-5 1-5.5 0-9.3-4.3-10.5-7 .6-1.3 1.7-3 3.4-4.5L2 5l1.5-1.5ZM12 7.5c.4 0 .8 0 1.2.1l1.6 1.6a4.5 4.5 0 0 0-5.6 5.6L7.6 13.2c-.2-.5-.3-1.1-.3-1.7A4.5 4.5 0 0 1 12 7.5Zm0 9a4.48 4.48 0 0 0 3.4-1.6l1.5 1.5c-1.3.9-2.9 1.6-4.9 1.6-5.5 0-9.3-4.3-10.5-7 .5-1.1 1.4-2.4 2.6-3.6l1.5 1.5A10.6 10.6 0 0 0 3.9 12c1.1 2.1 4 5.5 8.1 5.5Z"/>
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            ))}

            <button type="submit" className="details-save" disabled={saving}>
              {saving ? '…' : saved ? t('details_saved') : t('details_save')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
