// SF Symbols-inspired filled glyphs. Use currentColor → adopt parent text color.
// 24×24 viewBox. Pass any svg props (className, width, height, etc).

const base = { viewBox: '0 0 24 24', fill: 'currentColor', xmlns: 'http://www.w3.org/2000/svg' };

export function IconHappy(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-3.75 8a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm7.5 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM12 18a5 5 0 0 1-4.58-3h9.16A5 5 0 0 1 12 18Z"/>
    </svg>
  );
}

export function IconBored(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-3.75 8a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm7.5 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM9 15.5h6a1 1 0 1 1 0 2H9a1 1 0 1 1 0-2Z"/>
    </svg>
  );
}

export function IconStressed(props) {
  // Cloud with lightning bolt — "storm"
  return (
    <svg {...base} {...props}>
      <path d="M17.5 12.5a4.5 4.5 0 0 0-1.06-8.87A6.5 6.5 0 0 0 4 6.5 4 4 0 0 0 5 12.5h12.5Z"/>
      <path d="m11 14-3 5h2.5l-1 3 4.5-5h-2.5l1-3H11Z"/>
    </svg>
  );
}

export function IconTired(props) {
  // Crescent moon
  return (
    <svg {...base} {...props}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"/>
    </svg>
  );
}

export function IconMotivated(props) {
  // Bullseye / target
  return (
    <svg {...base} {...props}>
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12Zm0 4a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z"/>
    </svg>
  );
}

export function IconLove(props) {
  // Solid heart
  return (
    <svg {...base} {...props}>
      <path d="M12 21s-7.5-4.7-9.5-9.3A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 5.7C19.5 16.3 12 21 12 21Z"/>
    </svg>
  );
}

export function IconHype(props) {
  // Lightning bolt
  return (
    <svg {...base} {...props}>
      <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>
    </svg>
  );
}
