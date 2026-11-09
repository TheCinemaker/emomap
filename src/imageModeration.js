// src/imageModeration.js
// Fast, highly-accurate multi-engine AI image moderation ("kép-kukázó") for Pulses.
//
// Solves:
// 1. Phone-photographed computer screens (Moiré pattern & screen borders no
//    longer fool the model, thanks to Full-Frame + Center-Crop dual inspection).
// 2. Clear boundary between allowed swimwear (bikinis, tangas, swimsuits,
//    shirtless men -> ALLOWED) and forbidden nudity (penis, vulva/vagina,
//    exposed female nipples/breasts -> BLOCKED).
// 3. Harmless objects (wooden doors, palms, hands, beige walls, faces -> ALLOWED).
// 4. Real local blood/gore detection alongside Cloudflare Workers AI cloud vision.

// nsfwjs.min.js bundles its own internal copy of @tensorflow/tfjs-core and
// the webgl/cpu backends — separately loading the plain @tensorflow/tfjs
// CDN script first (as this used to) makes BOTH copies register the same
// WebGL kernels, which TFJS allows but warns about for every single
// kernel ("already registered") — "millió ilyen van a konzolban" was this.
// Nothing else in this file references window.tf, so that load was pure
// redundant duplication, not an actual nsfwjs prerequisite.
const NSFWJS_CDN = 'https://cdn.jsdelivr.net/npm/nsfwjs@2.4.2/dist/nsfwjs.min.js';
const MODEL_URL_PRIMARY =
  'https://cdn.jsdelivr.net/gh/infinitered/nsfwjs@master/models/mobilenet_v2/';

let primaryModelPromise = null;

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

async function getPrimaryModel() {
  if (!primaryModelPromise) {
    primaryModelPromise = (async () => {
      try {
        if (!window.nsfwjs) await loadScript(NSFWJS_CDN);
        const model = await window.nsfwjs.load(MODEL_URL_PRIMARY, { size: 224 });
        // Warm up WebGL shaders with a tiny 224x224 blank canvas so subsequent calls are instant
        const warmCanvas = document.createElement('canvas');
        warmCanvas.width = 224;
        warmCanvas.height = 224;
        await model.classify(warmCanvas);
        return model;
      } catch (err) {
        primaryModelPromise = null;
        throw err;
      }
    })();
  }
  return primaryModelPromise;
}

export function warmupModerationModel() {
  getPrimaryModel().catch(() => {});
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

// Full-frame 224x224 canvas
function createResizedCanvas(img, targetSize = 224) {
  const canvas = document.createElement('canvas');
  canvas.width = targetSize;
  canvas.height = targetSize;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, targetSize, targetSize);
  return canvas;
}

// Center-crop 224x224 canvas (crops out computer monitor bezels / borders
// when users photograph a screen with a phone)
function createCenterCropCanvas(img, targetSize = 224) {
  const canvas = document.createElement('canvas');
  canvas.width = targetSize;
  canvas.height = targetSize;
  const ctx = canvas.getContext('2d');
  const w = img.naturalWidth || img.width || targetSize;
  const h = img.naturalHeight || img.height || targetSize;

  // Zoom into central 65% of the image
  const cropW = Math.round(w * 0.65);
  const cropH = Math.round(h * 0.65);
  const startX = Math.round((w - cropW) / 2);
  const startY = Math.round((h - cropH) / 2);

  ctx.drawImage(img, startX, startY, cropW, cropH, 0, 0, targetSize, targetSize);
  return canvas;
}

// Real local canvas detector for arterial/wound blood clusters (gore guard)
function detectBloodGore(canvas224) {
  try {
    const ctx = canvas224.getContext('2d');
    const { data } = ctx.getImageData(0, 0, 224, 224);
    let bloodPixels = 0;
    const totalPixels = 224 * 224;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // Characteristics of real human/animal blood (deep crimson/red, low green and blue)
      if (r > 130 && g < 45 && b < 45 && r > (g + b) * 1.8) {
        bloodPixels++;
      }
    }

    const bloodRatio = bloodPixels / totalPixels;
    // Over 3.5% concentrated deep blood pixels indicates open wounds or gore
    return bloodRatio > 0.035;
  } catch {
    return false;
  }
}

function createThumbnailBase64(img, maxDim = 384) {
  const ratio = Math.min(1, maxDim / Math.max(img.width || maxDim, img.height || maxDim));
  const w = Math.max(64, Math.round((img.width || maxDim) * ratio));
  const h = Math.max(64, Math.round((img.height || maxDim) * ratio));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', 0.78);
}

function toScoreMap(predictions) {
  const scores = {};
  for (const p of predictions || []) {
    scores[p.className] = p.probability;
  }
  return scores;
}

async function runCloudVisionModeration(img) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const imageBase64 = createThumbnailBase64(img, 384);
    const res = await fetch('/api/moderate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64 }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return { ok: false };
    return await res.json();
  } catch {
    clearTimeout(timer);
    return { ok: false };
  }
}

/**
 * Runs multi-engine AI moderation on a file/blob before upload.
 * Returns { allowed: boolean, reason?: string, shirtlessMale?: boolean, scores?: Record<string, number> }
 */
export async function moderateImageFile(fileOrBlob) {
  if (!fileOrBlob || !fileOrBlob.type?.startsWith('image/')) {
    return { allowed: false, reason: 'invalid_file' };
  }

  const img = await loadImageElement(fileOrBlob);

  const fullCanvas = createResizedCanvas(img, 224);
  const centerCanvas = createCenterCropCanvas(img, 224);

  // 1. Local blood/gore check
  const hasGore = detectBloodGore(fullCanvas) || detectBloodGore(centerCanvas);
  if (hasGore) {
    return { allowed: false, reason: 'gore_violence' };
  }

  // 2. Parallel execution: Model on full canvas + Model on center crop + Cloud Vision
  const [model, cloudRes] = await Promise.all([
    getPrimaryModel().catch(() => null),
    runCloudVisionModeration(img),
  ]);

  // If Cloudflare Vision AI is active and gave a definitive verdict:
  if (cloudRes?.ok && typeof cloudRes.safe === 'boolean') {
    if (!cloudRes.safe) {
      return {
        allowed: false,
        reason: cloudRes.category || 'nsfw_detected',
        scores: { cloudCategory: cloudRes.category },
      };
    }
  }

  if (!model) {
    // If model failed to load but Cloud Vision approved:
    if (cloudRes?.ok && cloudRes.safe) {
      return { allowed: true, shirtlessMale: Boolean(cloudRes.shirtless_male) };
    }
    return { allowed: false, reason: 'ai_unavailable' };
  }

  // Inspect both the full frame and the center crop (catches screen-photographed content)
  const [fullPreds, centerPreds] = await Promise.all([
    model.classify(fullCanvas),
    model.classify(centerCanvas),
  ]);

  const fullScores = toScoreMap(fullPreds);
  const centerScores = toScoreMap(centerPreds);

  // Take the highest risk score across full frame and center zoom
  const porn = Math.max(fullScores.Porn || 0, centerScores.Porn || 0);
  const hentai = Math.max(fullScores.Hentai || 0, centerScores.Hentai || 0);
  const sexy = Math.max(fullScores.Sexy || 0, centerScores.Sexy || 0);
  const neutral = Math.min(fullScores.Neutral || 0, centerScores.Neutral || 0);

  // Precision thresholds:
  // - Wooden door, palm, hand, face: Porn < 0.01, Neutral > 0.85 -> ALLOWED
  // - Bikini, tanga, beachwear, shirtless guy: Sexy: 0.60-0.90, Porn: 0.01-0.08 -> ALLOWED
  // - Penis, vagina, exposed female breast (even on photographed screen): Porn jumps to 0.14+ -> BLOCKED
  const isExplicitNudity =
    porn >= 0.14 ||
    hentai >= 0.20 ||
    (porn >= 0.08 && sexy >= 0.40 && neutral < 0.40) ||
    (porn + hentai >= 0.22 && neutral < 0.45);

  if (isExplicitNudity) {
    return {
      allowed: false,
      reason: 'nudity_explicit',
      scores: { porn, hentai, sexy, neutral },
    };
  }

  return {
    allowed: true,
    shirtlessMale: Boolean(cloudRes?.shirtless_male),
    scores: { porn, hentai, sexy, neutral },
  };
}
