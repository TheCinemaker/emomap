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

// Below: the full "no emoji anywhere in the app" icon set — see CLAUDE.md.
// Stroke-based ones use basic primitives (rect/circle/line/polyline)
// deliberately instead of hand-authored curve paths, to stay simple and
// safe to eyeball-verify rather than risk a malformed bezier.
const strokeBase = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  xmlns: 'http://www.w3.org/2000/svg',
};

export const HEART_PATH_D = 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';
export const REPEAT_PATH_D = 'M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z';

export function IconHeart(props) {
  return (
    <svg {...base} {...props}>
      <path d={HEART_PATH_D} />
    </svg>
  );
}

export function IconRepeat(props) {
  return (
    <svg {...base} {...props}>
      <path d={REPEAT_PATH_D} />
    </svg>
  );
}

export function IconGlobe(props) {
  return (
    <svg {...strokeBase} {...props}>
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      <line x1="3" y1="12" x2="21" y2="12" />
    </svg>
  );
}

export function IconBolt(props) {
  return (
    <svg {...base} {...props}>
      <polygon points="13,2 4,14 11,14 10,22 20,10 13,10" />
    </svg>
  );
}

export function IconFire(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12.963 2.286a.75.75 0 0 0-1.071-.136 9.742 9.742 0 0 0-3.539 6.177A7.547 7.547 0 0 1 6.648 6.61a.75.75 0 0 0-1.152-.082A9 9 0 1 0 15.68 4.534a7.46 7.46 0 0 1-2.717-2.248ZM15.75 14.25a3.75 3.75 0 1 1-7.313-1.172c.628.465 1.35.81 2.133 1a5.99 5.99 0 0 1 1.925-3.546 3.75 3.75 0 0 1 3.255 3.718Z" />
    </svg>
  );
}

export function IconBuilding(props) {
  return (
    <svg {...strokeBase} {...props}>
      <rect x="4" y="3" width="10" height="18" />
      <rect x="14" y="9" width="6" height="12" />
      <line x1="7" y1="7" x2="7" y2="7" />
      <line x1="7" y1="11" x2="7" y2="11" />
      <line x1="7" y1="15" x2="7" y2="15" />
      <line x1="11" y1="7" x2="11" y2="7" />
      <line x1="11" y1="11" x2="11" y2="11" />
      <line x1="11" y1="15" x2="11" y2="15" />
    </svg>
  );
}

export function IconTrash(props) {
  return (
    <svg {...strokeBase} {...props}>
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M10 11v6M14 11v6" />
    </svg>
  );
}

export function IconFlag(props) {
  return (
    <svg {...strokeBase} {...props}>
      <path d="M5 21V4" />
      <path d="M5 4h13l-3 4 3 4H5" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconCamera(props) {
  return (
    <svg {...strokeBase} {...props}>
      <path d="M4 8h3l2-2h6l2 2h3v11H4z" />
      <circle cx="12" cy="13" r="3.2" />
    </svg>
  );
}

export function IconCheck(props) {
  return (
    <svg {...strokeBase} strokeWidth={2.2} {...props}>
      <polyline points="4,13 9,18 20,6" />
    </svg>
  );
}

export function IconClose(props) {
  return (
    <svg {...strokeBase} strokeWidth={2.2} {...props}>
      <line x1="5" y1="5" x2="19" y2="19" />
      <line x1="19" y1="5" x2="5" y2="19" />
    </svg>
  );
}

export function IconShield(props) {
  return (
    <svg {...strokeBase} {...props}>
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
    </svg>
  );
}

export function IconLink(props) {
  return (
    <svg {...strokeBase} {...props}>
      <path d="M9 15l6-6" />
      <path d="M10 7l1-1a3.5 3.5 0 0 1 5 5l-1 1" />
      <path d="M14 17l-1 1a3.5 3.5 0 0 1-5-5l1-1" />
    </svg>
  );
}

export function IconPlay(props) {
  return (
    <svg {...base} {...props}>
      <polygon points="6,4 20,12 6,20" />
    </svg>
  );
}

export function IconPause(props) {
  return (
    <svg {...base} {...props}>
      <rect x="5" y="4" width="5" height="16" />
      <rect x="14" y="4" width="5" height="16" />
    </svg>
  );
}

export function IconPencil(props) {
  return (
    <svg {...strokeBase} {...props}>
      <path d="M4 20l1-4L16 5l3 3L8 19l-4 1z" />
    </svg>
  );
}

// Raw path data (24x24 viewBox) for contexts that build DOM nodes directly
// (MapView.jsx's MapLibre markers) or draw on a <canvas> (ShareCard.jsx via
// Path2D), not through React.
export const PIN_PATH_D = 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z';
export const USER_PATH_D = 'M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.42 0-8 2.24-8 5v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2c0-2.76-3.58-5-8-5Z';
