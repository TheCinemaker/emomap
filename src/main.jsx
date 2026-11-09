import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

// The PWA service worker (registerType: 'autoUpdate', skipWaiting +
// clientsClaim in vite.config.js) updates itself in the background on
// every deploy, but that alone never reloads an already-open/installed
// app — it just silently takes over, so a visitor can keep running an
// old precached index.html (and its matching old JS bundle) until they
// happen to fully relaunch. That's exactly what caused a real outage to
// resurface for returning visitors well after it had already been fixed
// (2026-11-09: a visitor hit a long-dead "supabaseUrl is required" build
// from before a wrangler.toml fix, even though the live deploy was fine).
// Force exactly one reload the moment a new worker actually takes control.
if ('serviceWorker' in navigator) {
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
