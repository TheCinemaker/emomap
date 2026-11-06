// src/components/BottomNav.jsx
// Fixed bottom navigation bar (Map | Pulses | Friends & Chat | Profile).
import { IconCamera } from './Icons';

export default function BottomNav({ activeTab, onChangeTab, friendsBadgeCount = 0, t, onCreatePulse }) {
  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      {/* Only shown on the Pulses tab itself — raised, centered, bigger than
          the regular nav icons. Replaces the old floating button that used
          to hover above this bar. */}
      {activeTab === 'pulses' && onCreatePulse && (
        <button
          type="button"
          className="bottom-nav-fab"
          onClick={onCreatePulse}
          aria-label={t('pulses_new_btn')}
        >
          <IconCamera width={24} height={24} />
        </button>
      )}
      <button
        type="button"
        className={`bottom-nav-item${activeTab === 'map' ? ' is-active' : ''}`}
        onClick={() => onChangeTab('map')}
      >
        <span className="bottom-nav-icon" aria-hidden>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M15 4.5 9 2 3 4.5v16l6-2.5 6 2.5 6-2.5v-16L15 4.5Zm-1 13.3-4-1.67V4.7l4 1.67v11.43Zm2-11.43 3-1.25v11.88l-3 1.25V6.37ZM5 5.82l3-1.25v11.88l-3 1.25V5.82Z" />
          </svg>
        </span>
        <span className="bottom-nav-label">{t('nav_map')}</span>
      </button>

      <button
        type="button"
        className={`bottom-nav-item bottom-nav-item--pulses${activeTab === 'pulses' ? ' is-active' : ''}`}
        onClick={() => onChangeTab('pulses')}
      >
        <span className="bottom-nav-icon" aria-hidden>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M13.5 2 4 13.5h6.5L9.5 22 20 10.5h-6.5L13.5 2Z" />
          </svg>
        </span>
        <span className="bottom-nav-label">Pulses</span>
      </button>

      <button
        type="button"
        className={`bottom-nav-item${activeTab === 'friends' ? ' is-active' : ''}`}
        onClick={() => onChangeTab('friends')}
      >
        <span className="bottom-nav-icon" aria-hidden>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H8l-4.4 3.3A.5.5 0 0 1 3 20V5a1 1 0 0 1 1-1Z" />
          </svg>
          {friendsBadgeCount > 0 && (
            <span className="bottom-nav-badge">
              {friendsBadgeCount > 9 ? '9+' : friendsBadgeCount}
            </span>
          )}
        </span>
        <span className="bottom-nav-label">{t('nav_friends')}</span>
      </button>

      <button
        type="button"
        className={`bottom-nav-item${activeTab === 'profile' ? ' is-active' : ''}`}
        onClick={() => onChangeTab('profile')}
      >
        <span className="bottom-nav-icon" aria-hidden>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.42 0-8 2.24-8 5v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2c0-2.76-3.58-5-8-5Z" />
          </svg>
        </span>
        <span className="bottom-nav-label">{t('nav_profile')}</span>
      </button>
    </nav>
  );
}

