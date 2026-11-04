import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useLang, LANGUAGES } from '../i18n';

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

export default function Auth() {
  const { lang, setLang, t } = useLang();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);

  // Live username availability (sign-up only): 'idle' | 'checking' | 'available' | 'taken' | 'invalid'
  const [usernameStatus, setUsernameStatus] = useState('idle');

  useEffect(() => {
    if (!isSignUp) { setUsernameStatus('idle'); return; }
    const u = username.trim();
    if (!u) { setUsernameStatus('idle'); return; }
    if (!USERNAME_RE.test(u)) { setUsernameStatus('invalid'); return; }

    setUsernameStatus('checking');
    let cancelled = false;
    const timer = setTimeout(async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .ilike('username', u)
        .limit(1);
      if (cancelled) return;
      if (error) {
        console.error('Username check failed:', error);
        setUsernameStatus('idle');
        return;
      }
      setUsernameStatus(data && data.length > 0 ? 'taken' : 'available');
    }, 400);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [username, isSignUp]);

  const friendlyError = (err) => {
    const msg = String(err?.message || err || '');
    if (/already registered|already exists|duplicate.*email/i.test(msg)) {
      return t('auth_err_email_taken');
    }
    if (/Invalid login credentials/i.test(msg)) {
      return t('auth_err_bad_credentials');
    }
    if (/Password should be at least/i.test(msg)) {
      return t('auth_err_password_short');
    }
    if (/profiles_username|unique.*username/i.test(msg)) {
      return t('auth_err_username_taken');
    }
    return msg || t('auth_err_bad_credentials');
  };

  const handleSignUp = async () => {
    const u = username.trim();
    if (!USERNAME_RE.test(u)) {
      throw new Error(t('auth_err_username_format'));
    }
    if (usernameStatus === 'taken') {
      throw new Error(t('auth_err_username_taken'));
    }
    if (password.length < 6) {
      throw new Error(t('auth_err_password_short'));
    }

    // Race-safe re-check just before submit
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .ilike('username', u)
      .limit(1);
    if (existing && existing.length > 0) {
      setUsernameStatus('taken');
      throw new Error(t('auth_err_username_taken'));
    }

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username: u } },
    });
    if (signUpError) throw signUpError;

    setInfo(t('auth_success_signup'));
  };

  const handleSignIn = async () => {
    const u = username.trim();
    if (!u) throw new Error(t('auth_err_username_required'));

    // Look up the email tied to this username (server-side RPC)
    const { data: foundEmail, error: lookupErr } = await supabase
      .rpc('email_for_username', { p_username: u });
    if (lookupErr) throw lookupErr;
    if (!foundEmail) throw new Error('Invalid login credentials'); // → friendlyError translates this

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: foundEmail,
      password,
    });
    if (signInError) throw signInError;
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);

    try {
      if (isSignUp) await handleSignUp();
      else await handleSignIn();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = !loading && (
    isSignUp
      ? email && password.length >= 6 && usernameStatus === 'available'
      : username.trim() && password
  );

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-lang-row">
          {LANGUAGES.map((code) => (
            <button
              key={code}
              type="button"
              className={`info-lang-btn${lang === code ? ' is-active' : ''}`}
              onClick={() => setLang(code)}
            >
              {code.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="auth-brand">
          <span className="auth-logo" aria-hidden>🌍</span>
          <h1 className="auth-brand-name">EmoMap</h1>
        </div>
        <p className="auth-tagline">
          {isSignUp ? t('auth_tagline_signup') : t('auth_tagline_signin')}
        </p>

        {error && <div className="auth-alert auth-alert-error">{error}</div>}
        {info && <div className="auth-alert auth-alert-info">{info}</div>}

        <form onSubmit={handleAuth} className="auth-form">
          {/* Email — only on signup */}
          {isSignUp && (
            <label className="auth-field">
              <span>{t('auth_email')}</span>
              <input
                type="email"
                placeholder="you@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </label>
          )}

          {/* Username — both sign-up and sign-in */}
          <label className="auth-field">
            <span>{t('auth_username')}</span>
            {isSignUp ? (
              <>
                <div className={`auth-input-wrap status-${usernameStatus}`}>
                  <input
                    type="text"
                    placeholder={t('auth_username_placeholder_signup')}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    minLength={3}
                    maxLength={20}
                    required
                  />
                  <span className="auth-input-status" aria-hidden>
                    {usernameStatus === 'checking' && '…'}
                    {usernameStatus === 'available' && '✓'}
                    {usernameStatus === 'taken' && '✕'}
                    {usernameStatus === 'invalid' && '!'}
                  </span>
                </div>
                <small className="auth-field-hint">
                  {usernameStatus === 'taken' && t('auth_username_taken')}
                  {usernameStatus === 'invalid' && t('auth_username_invalid')}
                  {usernameStatus === 'available' && t('auth_username_available')}
                  {usernameStatus === 'checking' && t('auth_username_checking')}
                  {usernameStatus === 'idle' && t('auth_username_invalid')}
                </small>
              </>
            ) : (
              <input
                type="text"
                placeholder={t('auth_username_placeholder_signin')}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            )}
          </label>

          <label className="auth-field">
            <span>{t('auth_password')}</span>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              minLength={isSignUp ? 6 : undefined}
            />
          </label>

          <button className="auth-submit" type="submit" disabled={!canSubmit}>
            {loading ? t('auth_submit_loading') : (isSignUp ? t('auth_submit_signup') : t('auth_submit_signin'))}
          </button>
        </form>

        <div className="auth-divider"><span>{t('auth_or')}</span></div>

        <button
          type="button"
          className="auth-switch-link"
          onClick={() => {
            setIsSignUp(!isSignUp);
            setError(null);
            setInfo(null);
            setUsernameStatus('idle');
          }}
        >
          {isSignUp ? t('auth_switch_to_signin') : t('auth_switch_to_signup')}
        </button>
      </div>

      <p className="auth-footer-note">
        {t('auth_footer_note')}
      </p>
    </div>
  );
}
