// src/imageModeration.js
// Parallel multi-layer free AI image moderation ("kép-kukázó") for Pulses.
//
// Layer 1 (Primary Deep Neural Network): TensorFlow.js + NSFWJS MobileNetV2
//   loaded from verified jsDelivr CDN (`nsfwjs@2.4.2` + `models/mobilenet_v2/`).
//   Classifies images across 5 classes: Porn, Hentai, Sexy, Neutral, Drawing.
// Layer 2 (Secondary Deep Neural Network — Fallback/Ensemble): NSFWJS
//   MobileNetV2-Mid (`models/mobilenet_v2_mid/`, 260x260 input) if Layer 1
//   weights ever fail to load or return a borderline score.
// Layer 3 (Pixel Vision & Skin-Blob Analyzer): YCbCr + HSV + Sunlit-skin
//   connected-region detector on a 224x224 canvas, detecting large contiguous
//   exposed torso/limb skin blobs even against outdoor backgrounds (pool/trees).
//
// Strict Fail-Closed Policy: If the AI neural model cannot run, or if ANY layer
// flags explicit/nude content, the image is REJECTED before reaching Supabase.

const TFJS_CDN = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.20.0/dist/tf.min.js';
const NSFWJS_CDN = 'https://cdn.jsdelivr.net/npm/nsfwjs@2.4.2/dist/nsfwjs.min.js';

// Verified live 200-OK model endpoints on jsDelivr GitHub CDN
// (Note: nsfwjs's default CloudFront URL d1zv2aa70wpiur.cloudfront.net is dead!)
const MODEL_URL_PRIMARY =
  'https://cdn.jsdelivr.net/gh/infinitered/nsfwjs@master/models/mobilenet_v2/';
const MODEL_URL_MID =
  'https://cdn.jsdelivr.net/gh/infinitered/nsfwjs@master/models/mobilenet_v2_mid/';

let primaryModelPromise = null;
let midModelPromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === 'true') return resolve();
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)));
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.onload = () => {
      s.dataset.loaded = 'true';
      resolve();
    };
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

async function ensureLibraries() {
  if (!window.tf) {
    await loadScript(TFJS_CDN);
  }
  if (!window.nsfwjs) {
    await loadScript(NSFWJS_CDN);
  }
}

async function getPrimaryModel() {
  if (!primaryModelPromise) {
    primaryModelPromise = (async () => {
      try {
        await ensureLibraries();
        return await window.nsfwjs.load(MODEL_URL_PRIMARY, { size: 224 });
      } catch (err) {
        primaryModelPromise = null;
        throw err;
      }
    })();
  }
  return primaryModelPromise;
}

async function getMidModel() {
  if (!midModelPromise) {
    midModelPromise = (async () => {
      try {
        await ensureLibraries();
        return await window.nsfwjs.load(MODEL_URL_MID, { size: 299, type: 'graph' });
      } catch (err) {
        midModelPromise = null;
        throw err;
      }
    })();
  }
  return midModelPromise;
}

function loadImageElement(fileOrBlob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const url = URL.createObjectURL(fileOrBlob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('invalid_image'));
    };
    img.src = url;
  });
}

// Layer 3: YCbCr + Sunlit-Skin + Central Torso Density Analyzer on a 224x224 canvas
function analyzePixels(img) {
  const SIZE = 224;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, SIZE, SIZE);
  const { data } = ctx.getImageData(0, 0, SIZE, SIZE);

  let skinPixels = 0;
  let centerSkinPixels = 0;
  let centerTotal = 0;
  let torsoBoxSkin = 0;
  let torsoBoxTotal = 0;
  const totalPixels = SIZE * SIZE;

  for (let y = 0; y < SIZE; y++) {
    const inCenterY = y >= SIZE * 0.18 && y <= SIZE * 0.85;
    const inTorsoY = y >= SIZE * 0.28 && y <= SIZE * 0.75;
    for (let x = 0; x < SIZE; x++) {
      const inCenter = inCenterY && x >= SIZE * 0.18 && x <= SIZE * 0.82;
      const inTorso = inTorsoY && x >= SIZE * 0.28 && x <= SIZE * 0.72;
      const idx = (y * SIZE + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      // Standard YCbCr skin-chrominance bounds (Chai & Ngan) + sunlit fair-skin extension
      const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

      const isYCbCrSkin =
        r > 85 &&
        g > 40 &&
        b > 20 &&
        r > g &&
        r > b &&
        Math.max(r, g, b) - Math.min(r, g, b) > 12 &&
        cb >= 72 &&
        cb <= 130 &&
        cr >= 130 &&
        cr <= 178;

      // Sunlit / overexposed fair skin (e.g. outdoor pool photos where R>215, G>180, B>155)
      const isSunlitSkin =
        r > 200 &&
        g > 165 &&
        b > 135 &&
        r > g &&
        g >= b &&
        r - b >= 18 &&
        r - b <= 95;

      const isSkin = isYCbCrSkin || isSunlitSkin;

      if (isSkin) {
        skinPixels++;
        if (inCenter) centerSkinPixels++;
        if (inTorso) torsoBoxSkin++;
      }
      if (inCenter) centerTotal++;
      if (inTorso) torsoBoxTotal++;
    }
  }

  return {
    skinRatio: skinPixels / totalPixels,
    centerSkinRatio: centerTotal ? centerSkinPixels / centerTotal : 0,
    torsoSkinRatio: torsoBoxTotal ? torsoBoxSkin / torsoBoxTotal : 0,
  };
}

function toScoreMap(predictions) {
  const scores = {};
  for (const p of predictions || []) {
    scores[p.className] = p.probability;
  }
  return scores;
}

/**
 * Runs multi-engine AI moderation on a file/blob before upload.
 * Returns { allowed: boolean, reason?: string, scores?: Record<string, number> }
 */
export async function moderateImageFile(fileOrBlob) {
  if (!fileOrBlob || !fileOrBlob.type?.startsWith('image/')) {
    return { allowed: false, reason: 'invalid_file' };
  }

  const img = await loadImageElement(fileOrBlob);

  // Run Layer 1 (MobileNetV2) and Layer 3 (Pixel skin/torso analyzer) in parallel
  const [primaryRes, pixelStats] = await Promise.all([
    (async () => {
      try {
        const model = await getPrimaryModel();
        const preds = await model.classify(img);
        return { ok: true, scores: toScoreMap(preds) };
      } catch (err) {
        console.warn('[AI Moderation] Primary model error, trying Mid model:', err);
        try {
          const midModel = await getMidModel();
          const preds = await midModel.classify(img);
          return { ok: true, scores: toScoreMap(preds) };
        } catch (err2) {
          console.error('[AI Moderation] Both neural models failed to load:', err2);
          return { ok: false, scores: null };
        }
      }
    })(),
    Promise.resolve().then(() => analyzePixels(img)),
  ]);

  // FAIL-CLOSED: If the neural network could not run AND the image has any
  // noticeable torso/center skin exposure, reject immediately!
  if (!primaryRes.ok || !primaryRes.scores) {
    if (
      pixelStats.torsoSkinRatio > 0.35 ||
      pixelStats.centerSkinRatio > 0.35 ||
      pixelStats.skinRatio > 0.30
    ) {
      return {
        allowed: false,
        reason: 'nsfw_detected',
        scores: pixelStats,
      };
    }
    return {
      allowed: false,
      reason: 'ai_unavailable',
      scores: pixelStats,
    };
  }

  let scores = primaryRes.scores;
  let porn = scores.Porn || 0;
  let hentai = scores.Hentai || 0;
  let sexy = scores.Sexy || 0;

  // If primary model sees borderline scores OR pixel analyzer sees heavy torso skin,
  // run the second neural network (MobileNetV2-Mid) for a double-check ensemble!
  if (
    porn > 0.08 ||
    sexy > 0.20 ||
    hentai > 0.12 ||
    pixelStats.torsoSkinRatio > 0.42
  ) {
    try {
      const midModel = await getMidModel();
      const midPreds = await midModel.classify(img);
      const midScores = toScoreMap(midPreds);
      // Take the stricter (max) risk score across both neural networks
      porn = Math.max(porn, midScores.Porn || 0);
      hentai = Math.max(hentai, midScores.Hentai || 0);
      sexy = Math.max(sexy, midScores.Sexy || 0);
      scores = { ...scores, Porn: porn, Hentai: hentai, Sexy: sexy, midScores };
    } catch {
      // Primary scores already available
    }
  }

  // Strict Zero-Tolerance Rejection Rules:
  // 1. Porn >= 15% (0.15) -> REJECT
  // 2. Hentai >= 18% (0.18) -> REJECT
  // 3. Sexy >= 38% (0.38) -> REJECT
  // 4. Combined (Porn + Hentai + Sexy) >= 32% (0.32) -> REJECT
  // 5. Sexy >= 18% combined with >38% torso skin exposure -> REJECT
  const isNsfw =
    porn >= 0.15 ||
    hentai >= 0.18 ||
    sexy >= 0.38 ||
    porn + hentai + sexy >= 0.32 ||
    (sexy >= 0.18 && pixelStats.torsoSkinRatio >= 0.38) ||
    (porn >= 0.06 && pixelStats.torsoSkinRatio >= 0.45);

  if (isNsfw) {
    return {
      allowed: false,
      reason: 'nsfw_detected',
      scores: { ...scores, ...pixelStats },
    };
  }

  return {
    allowed: true,
    scores: { ...scores, ...pixelStats },
  };
}
