import {
  IconHappy,
  IconBored,
  IconStressed,
  IconTired,
  IconMotivated,
  IconLove,
  IconHype,
} from './components/EmotionIcons';

// Apple System palette (iOS dark-mode variants)
// Display names come from i18n.js (emotion_<id>) — this is the data/color/icon source of truth.
export const EMOTIONS = [
  { id: 'happy',     color: '#34c759', Icon: IconHappy },
  { id: 'bored',     color: '#8e8e93', Icon: IconBored },
  { id: 'stressed',  color: '#ff3b30', Icon: IconStressed },
  { id: 'tired',     color: '#ffcc00', Icon: IconTired },
  { id: 'motivated', color: '#0a84ff', Icon: IconMotivated },
  { id: 'love',      color: '#ff2d55', Icon: IconLove },
  { id: 'hype',      color: '#bf5af2', Icon: IconHype },
];
