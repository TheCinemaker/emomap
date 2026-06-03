import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

export default function Auth() {
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
      return 'Ez az email cím már regisztrálva van.';
    }
    if (/Invalid login credentials/i.test(msg)) {
      return 'Hibás felhasználónév vagy jelszó.';
    }
    if (/Password should be at least/i.test(msg)) {
      return 'A jelszónak legalább 6 karakter hosszúnak kell lennie.';
    }
    if (/profiles_username|unique.*username/i.test(msg)) {
      return 'Ez a felhasználónév már foglalt.';
    }
    return msg || 'Hiba történt.';
  };

  const handleSignUp = async () => {
    const u = username.trim();
    if (!USERNAME_RE.test(u)) {
      throw new Error('A felhasználónév 3–20 karakter, csak betű/szám/_ lehet.');
    }
    if (usernameStatus === 'taken') {
      throw new Error('Ez a felhasználónév már foglalt.');
    }
    if (password.length < 6) {
      throw new Error('A jelszónak legalább 6 karakter hosszúnak kell lennie.');
    }

    // Race-safe re-check just before submit
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .ilike('username', u)
      .limit(1);
    if (existing && existing.length > 0) {
      setUsernameStatus('taken');
      throw new Error('Ez a felhasználónév már foglalt.');
    }

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username: u } },
    });
    if (signUpError) throw signUpError;

    setInfo('Sikeres regisztráció! Erősítsd meg az emailedet a beérkezett levélben, aztán lépj be.');
  };

  const handleSignIn = async () => {
    const u = username.trim();
    if (!u) throw new Error('Add meg a felhasználóneved.');

    // Look up the email tied to this username (server-side RPC)
    const { data: foundEmail, error: lookupErr } = await supabase
      .rpc('email_for_username', { p_username: u });
    if (lookupErr) throw lookupErr;
    if (!foundEmail) throw new Error('Invalid login credentials'); // friendlyError → "Hibás felhasználónév vagy jelszó."

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
        <div className="auth-brand">
          <span className="auth-logo" aria-hidden>🌍</span>
          <h1 className="auth-brand-name">EmoMap</h1>
        </div>
        <p className="auth-tagline">
          {isSignUp ? 'Hozz létre egy fiókot' : 'Üdv újra!'}
        </p>

        {error && <div className="auth-alert auth-alert-error">{error}</div>}
        {info && <div className="auth-alert auth-alert-info">{info}</div>}

        <form onSubmit={handleAuth} className="auth-form">
          {/* Email — only on signup */}
          {isSignUp && (
            <label className="auth-field">
              <span>Email</span>
              <input
                type="email"
                placeholder="te@email.hu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </label>
          )}

          {/* Username — both sign-up and sign-in */}
          <label className="auth-field">
            <span>Felhasználónév</span>
            {isSignUp ? (
              <>
                <div className={`auth-input-wrap status-${usernameStatus}`}>
                  <input
                    type="text"
                    placeholder="pl. szilveszter_42"
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
                  {usernameStatus === 'taken' && 'Ez a név már foglalt.'}
                  {usernameStatus === 'invalid' && '3–20 karakter, csak betű, szám, _.'}
                  {usernameStatus === 'available' && 'Szabad ✨'}
                  {usernameStatus === 'checking' && 'Ellenőrzés…'}
                  {usernameStatus === 'idle' && '3–20 karakter, csak betű, szám, _.'}
                </small>
              </>
            ) : (
              <input
                type="text"
                placeholder="felhasználónév"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            )}
          </label>

          <label className="auth-field">
            <span>Jelszó</span>
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
            {loading ? 'Egy pillanat…' : (isSignUp ? 'Regisztráció' : 'Belépés')}
          </button>
        </form>

        <div className="auth-divider"><span>vagy</span></div>

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
          {isSignUp ? 'Van már fiókod? Lépj be' : 'Még nincs fiókod? Regisztrálj'}
        </button>
      </div>

      <p className="auth-footer-note">
        Bejelentkezés felhasználónévvel. Regisztrációhoz email is kell — erre kapsz megerősítést.
      </p>
    </div>
  );
}
