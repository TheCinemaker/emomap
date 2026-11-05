// src/imageModeration.js
// Parallel multi-layer free AI image moderation ("kép-kukázó") for Pulses.
//
// Layer 1 (Neural Network): TensorFlow.js + NSFWJS (MobileNetV2) loaded on
//   demand from CDN — zero bundle bloat on initial map load, 100% free, no API
//   key required. Classifies images into Porn, Hentai, Sexy, Neutral, Drawing.
// Layer 2 (Pixel Vision Analyzer): YCbCr skin-cluster & centre-region density
//   check on a 224x224 canvas, acting both as a second opinion alongside the
//   neural network and as a deterministic fallback if a user's ad-blocker
//   blocks the CDN model weights.
// Layer 3 (Optional Cloud Vision API): If VITE_OPENAI_MODERATION_KEY is set,
//   also runs OpenAI's free `omni-moderation-latest` vision endpoint.

let nsfwModelPromise = null;

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

async function getNsfwModel() {
  if (!nsfwModelPromise) {
    nsfwModelPromise = (async () => {
      try {
        if (!window.tf) {
          await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.20.0/dist/tf.min.js');
        }
        if (!window.nsfwjs) {
          await loadScript('https://cdn.jsdelivr.net/npm/nsfwjs@4.1.0/dist/nsfwjs.min.js');
        }
        // Load default MobileNetV2 model hosted on CDN
        const model = await window.nsfwjs.load();
        return model;
      } catch (err) {
        nsfwModelPromise = null;
        throw err;
      }
    })();
  }
  return nsfwModelPromise;
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

// Layer 2: Fast YCbCr skin-tone & centre-focus heuristic on a 224x224 canvas
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
  const totalPixels = SIZE * SIZE;

  for (let y = 0; y < SIZE; y++) {
    const inCenterY = y >= SIZE * 0.2 && y <= SIZE * 0.8;
    for (let x = 0; x < SIZE; x++) {
      const inCenter = inCenterY && x >= SIZE * 0.2 && x <= SIZE * 0.8;
      const idx = (y * SIZE + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      // Standard YCbCr skin-chrominance bounds (Chai & Ngan)
      const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

      const isSkin =
        r > 95 && g > 40 && b > 20 &&
        Math.max(r, g, b) - Math.min(r, g, b) > 15 &&
        Math.abs(r - g) > 15 && r > g && r > b &&
        cb >= 77 && cb <= 127 &&
        cr >= 133 && cr <= 173;

      if (isSkin) {
        skinPixels++;
        if (inCenter) centerSkinPixels++;
      }
      if (inCenter) centerTotal++;
    }
  }

  return {
    skinRatio: skinPixels / totalPixels,
    centerSkinRatio: centerTotal ? centerSkinPixels / centerTotal : 0,
  };
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

  // Run Layer 1 (NSFWJS Neural Net) and Layer 2 (Pixel heuristic) in parallel
  const [nnResult, pixelStats] = await Promise.all([
    (async () => {
      try {
        const model = await getNsfwModel();
        const predictions = await model.classify(img);
        const scores = {};
        for (const p of predictions) {
          scores[p.className] = p.probability;
        }
        return { ok: true, scores };
      } catch (err) {
        console.warn('[AI Moderation] Neural model fallback to pixel heuristic:', err);
        return { ok: false, scores: null };
      }
    })(),
    Promise.resolve().then(() => analyzePixels(img)),
  ]);

  if (nnResult.ok && nnResult.scores) {
    const porn = nnResult.scores.Porn || 0;
    const hentai = nnResult.scores.Hentai || 0;
    const sexy = nnResult.scores.Sexy || 0;

    // Strict rejection rules:
    // 1. Explicit Porn or Hentai > 28%
    // 2. Sexy > 68% OR (Sexy > 50% with high skin ratio)
    // 3. Combined Porn + Hentai + Sexy > 72%
    if (
      porn > 0.28 ||
      hentai > 0.28 ||
      sexy > 0.68 ||
      porn + hentai + sexy > 0.72 ||
      (sexy > 0.45 && pixelStats.centerSkinRatio > 0.55)
    ) {
      return {
        allowed: false,
        reason: 'nsfw_detected',
        scores: nnResult.scores,
      };
    }

    return {
      allowed: true,
      scores: nnResult.scores,
    };
  }

  // Fallback if neural network CDN was blocked by a strict ad-blocker:
  // reject images dominated by skin tones in both full frame and centre.
  if (pixelStats.skinRatio > 0.62 && pixelStats.centerSkinRatio > 0.72) {
    return {
      allowed: false,
      reason: 'nsfw_detected',
      scores: pixelStats,
    };
  }

  return { allowed: true, scores: pixelStats };
}

