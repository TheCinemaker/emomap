// src/imageCompress.js
// Resize + re-encode an image client-side before upload. Phone camera
// photos are routinely 6-12MB — uploading those raw is ~20x more mobile
// data than needed and burns through Supabase Storage's free 1GB tier
// fast. Also incidentally fixes iPhone HEIC uploads (unviewable in most
// browsers) by always re-encoding to JPEG.
export function compressImage(file, { maxDim = 1200, quality = 0.8 } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      const scale = Math.min(1, maxDim / Math.max(width, height));
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Image compression failed'))),
        'image/jpeg',
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image'));
    };
    img.src = url;
  });
}
