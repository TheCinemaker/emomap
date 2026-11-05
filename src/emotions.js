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
export const EMOTIONS = [
  { id: 'happy',     color: '#7ED9A0', Icon: IconHappy },
  { id: 'bored',     color: '#B0B3C6', Icon: IconBored },
  { id: 'stressed',  color: '#FF9B9B', Icon: IconStressed },
  { id: 'tired',     color: '#FFD97D', Icon: IconTired },
  { id: 'motivated', color: '#8EC9FF', Icon: IconMotivated },
  { id: 'love',      color: '#FFA8C9', Icon: IconLove },
  { id: 'hype',      color: '#C9A3F5', Icon: IconHype },
];
