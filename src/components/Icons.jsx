// src/components/Icons.jsx
// Small shared UI icons (not emotions — see EmotionIcons.jsx for those).
// Plain SVG, currentColor fill, so they adopt whatever color context they're
// dropped into — used in place of emoji for anything that's actually UI
// (avatar fallback, map pins), not decorative branding.
const base = { viewBox: '0 0 24 24', fill: 'currentColor', xmlns: 'http://www.w3.org/2000/svg' };

export function IconUser(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.42 0-8 2.24-8 5v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2c0-2.76-3.58-5-8-5Z"/>
    </svg>
  );
}

export function IconPin(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z"/>
    </svg>
  );
}

// Raw path data (24x24 viewBox) for contexts that build DOM nodes directly
// (MapView.jsx's MapLibre markers) or draw on a <canvas> (ShareCard.jsx via
// Path2D), not through React.
export const PIN_PATH_D = 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z';
export const USER_PATH_D = 'M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.42 0-8 2.24-8 5v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2c0-2.76-3.58-5-8-5Z';
