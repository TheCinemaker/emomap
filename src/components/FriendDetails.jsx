// src/components/FriendDetails.jsx
// Read-only view of a friend's details — only whatever fields they toggled
// visible actually come back from the server (get_visible_profile_details
// nulls out the rest), so there's no client-side filtering to get wrong.
import { useEffect, useState } from 'react';
import { fetchFriendDetails } from '../useProfileDetails';

const FIELD_LABEL_KEY = {
  full_name: 'details_full_name',
  birth_date: 'details_birth_date',
  phone: 'details_phone',
  address: 'details_address',
  contact_note: 'details_contact_note',
  facebook_url: 'details_facebook',
  instagram_url: 'details_instagram',
  tiktok_url: 'details_tiktok',
  website_url: 'details_website',
};
const FIELD_ORDER = Object.keys(FIELD_LABEL_KEY);

export default function FriendDetails({ friendId, friendName, t, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchFriendDetails(friendId).then((d) => {
      if (!cancelled) { setData(d); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [friendId]);

  const visibleEntries = data ? FIELD_ORDER.filter((k) => data[k]).map((k) => [k, data[k]]) : [];

  return (
    <div className="details-overlay" onClick={onClose}>
      <div className="details-panel" onClick={(e) => e.stopPropagation()}>
        <div className="details-header">
          <h2 className="details-title">{friendName || '—'}</h2>
          <button type="button" className="details-close" onClick={onClose}>×</button>
        </div>

        {loading && <p className="details-loading">…</p>}
        {!loading && visibleEntries.length === 0 && <p className="details-hint">{t('details_none_shared')}</p>}
        {!loading && visibleEntries.map(([key, value]) => (
          <div key={key} className="details-view-row">
            <span className="details-view-label">{t(FIELD_LABEL_KEY[key])}</span>
            <span className="details-view-value">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
