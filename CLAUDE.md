# EmoMap — project notes for Claude Code

## VERY IMPORTANT

**No emoji anywhere in this app. Ever. SVG icons only.**

This is an explicit, standing instruction from the project owner
(2026-11-05): "egy rohadt emojit sem akarok meglátni benne! CSAK SVG lehet."
(= "I don't want to see a single goddamn emoji in it! SVG ONLY.")

- Every icon in the UI — buttons, badges, toasts, banners, branding, map
  markers, generated share-card images, static legal pages — must be a
  hand-authored SVG, not a Unicode emoji character.
- Shared icons live in `src/components/Icons.jsx` (plain SVG components,
  `currentColor` fill/stroke so they adopt the surrounding text color) and
  `src/components/EmotionIcons.jsx` (the 7 mood glyphs). Add new icons
  there rather than reaching for an emoji as a quick placeholder.
- This also applies to canvas-drawn output (`ShareCard.jsx` draws a vector
  globe mark with `ctx.arc`/`ctx.ellipse` instead of rendering the 🌍
  character) and plain static HTML (the `public/legal/*.html` pages use an
  inline `<svg>` in the brand link, not an emoji).
- Before adding any new icon-like UI, check `Icons.jsx` first — a shape
  you need (globe, bolt, fire, flag, trash, camera, check, close, heart,
  repeat, pin, pencil, user, shield, link, play, pause, building) may
  already exist there.
- If you ever find an emoji character in a JSX string, i18n string
  (`src/i18n.js`), or static HTML file that's actually rendered to a user,
  replace it with an SVG icon (or, for a plain toast string with no good
  icon slot, just drop it and keep the text) — don't leave it or
  reintroduce one "just for now."
- Code **comments** using plain typographic symbols (→, ─, —) for
  readability are fine and not what this rule is about — it's about what
  actually renders in the running app.
