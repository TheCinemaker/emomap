import { useState } from 'react';
import { supabase } from '../supabaseClient';

export default function Auth() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);

    try {
      if (isSignUp) {
        if (!username.trim()) throw new Error('Add meg a felhasználóneved.');
        if (password.length < 6) throw new Error('A jelszónak legalább 6 karakter hosszúnak kell lennie.');

        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { username: username.trim() } },
        });
        if (error) throw error;
        setInfo('Sikeres regisztráció! Ellenőrizd az emailed.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      setError(err.message || 'Hiba történt.');
    } finally {
      setLoading(false);
    }
  };

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
          {isSignUp && (
            <label className="auth-field">
              <span>Felhasználónév</span>
              <input
                type="text"
                placeholder="pl. szilveszter"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
              />
            </label>
          )}
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
          <label className="auth-field">
            <span>Jelszó</span>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              minLength={6}
            />
          </label>

          <button className="auth-submit" type="submit" disabled={loading}>
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
          }}
        >
          {isSignUp ? 'Van már fiókod? Lépj be' : 'Még nincs fiókod? Regisztrálj'}
        </button>
      </div>

      <p className="auth-footer-note">
        Megosztod a helyzeted és a hangulatod, mások hangulatát látod.
      </p>
    </div>
  );
}
