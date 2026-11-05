import {
  IconHappy,
  IconBored,
  IconStressed,
  IconTired,
  IconMotivated,
  IconLove,
  IconHype,
} from './components/EmotionIcons';

// Soft pastel palette (replaced the old vivid Apple System colors on
// explicit user request, 2026-11-05 — "a snapchat térképe sokkal
// cukibb... olyan kell nekem", wanting Snap Map's softer look). Kept the
// same 7 distinguishable hues, just desaturated/lightened each one.
// Display names come from i18n.js (emotion_<id>) — this is the data/color/icon source of truth.
// This is the ONLY place these colors are defined — moodGridUtils.js's
// EMOTION_RGB and MapView.jsx's EMOTION_COLORS both derive from this array
// rather than hardcoding their own copy, so there's one palette to update.
// Richened slightly from the first pastel pass (2026-11-05 follow-up —
// "lehet kicsit sötétebb... nincs fénye ha boldog valaki"): same hues, more
// saturated/less washed-out, so the map's pulsing auras read as actually
// glowing rather than flat and pale against the light basemap.
export const EMOTIONS = [
  { id: 'happy',     color: '#5CCB8C', Icon: IconHappy },
  { id: 'bored',     color: '#9A9DB8', Icon: IconBored },
  { id: 'stressed',  color: '#FF7070', Icon: IconStressed },
  { id: 'tired',     color: '#FFC94D', Icon: IconTired },
  { id: 'motivated', color: '#5CAFFF', Icon: IconMotivated },
  { id: 'love',      color: '#FF82B5', Icon: IconLove },
  { id: 'hype',      color: '#B37AF0', Icon: IconHype },
];
