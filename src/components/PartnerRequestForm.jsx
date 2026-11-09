// src/components/PartnerRequestForm.jsx
// Lead-capture form for "I run a venue and want to advertise it" — the
// Partner CRM itself stays invite-only (profiles.is_partner flipped by
// hand), but until this existed there was no way for an interested
// business to even say so. Open to guests too: a prospective business
// contact shouldn't need a personal mood-tracking account just to ask.
import { useState } from 'react';
import { supabase } from '../supabaseClient';
import { IconBuilding, IconClose, IconCheck } from './Icons';

export default function PartnerRequestForm({ userId, t, onClose }) {
  const [businessName, setBusinessName] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: err } = await supabase.from('partner_requests').insert({
      user_id: userId || null,
      business_name: businessName.trim(),
      contact_name: contactName.trim(),
      contact_email: email.trim(),
      contact_phone: phone.trim() || null,
      city: city.trim() || null,
      message: message.trim() || null,
    });
    setSubmitting(false);
    if (err) {
      setError(t('partner_request_error'));
      return;
    }
    setDone(true);
  };

  return (
    <div className="auth-screen" onClick={onClose}>
      <div className="auth-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="auth-close" onClick={onClose} aria-label={t('close')}>
          <IconClose width={16} height={16} />
        </button>

        <div className="auth-brand">
          <IconBuilding className="auth-logo" aria-hidden width={26} height={26} />
          <h1 className="auth-brand-name">{t('partner_request_title')}</h1>
        </div>

        {done ? (
          <>
            <div className="auth-alert auth-alert-info">
              <IconCheck width={14} height={14} /> {t('partner_request_sent')}
            </div>
            <button type="button" className="auth-submit" onClick={onClose}>{t('close')}</button>
          </>
        ) : (
          <>
            <p className="auth-tagline">{t('partner_request_tagline')}</p>
            {error && <div className="auth-alert auth-alert-error">{error}</div>}
            <form onSubmit={handleSubmit} className="auth-form">
              <label className="auth-field">
                <span>{t('partner_request_business_name')}</span>
                <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} required maxLength={200} />
              </label>
              <label className="auth-field">
                <span>{t('partner_request_contact_name')}</span>
                <input value={contactName} onChange={(e) => setContactName(e.target.value)} required maxLength={120} />
              </label>
              <label className="auth-field">
                <span>{t('auth_email')}</span>
                <input type="email" placeholder="you@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={200} autoComplete="email" />
              </label>
              <label className="auth-field">
                <span>{t('partner_request_phone')}</span>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} autoComplete="tel" />
              </label>
              <label className="auth-field">
                <span>{t('partner_request_city')}</span>
                <input value={city} onChange={(e) => setCity(e.target.value)} maxLength={120} />
              </label>
              <label className="auth-field">
                <span>{t('partner_request_message')}</span>
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1000} rows={3} />
              </label>
              <button type="submit" className="auth-submit" disabled={submitting || !businessName.trim() || !contactName.trim() || !email.trim()}>
                {submitting ? t('auth_submit_loading') : t('partner_request_submit')}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
