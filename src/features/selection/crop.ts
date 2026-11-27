// The screenshot of a comment shows the selected element only (MAS-70 decision).

/** Element box in the viewport, CSS pixels, at capture time. */
export interface ViewportRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Pixel box of the element inside a screenshot of the viewport. The image may be larger than the
 * viewport in CSS pixels (high-DPI screens, zoom), so coordinates are scaled by image/viewport.
 * Parts outside the viewport are cut off; undefined when nothing of the element is visible.
 */
export function cropBox(
  rect: ViewportRect,
  viewportWidth: number,
  imageWidth: number,
  imageHeight: number,
) {
  const scale = imageWidth / viewportWidth;
  const left = Math.max(0, Math.round(rect.x * scale));
  const top = Math.max(0, Math.round(rect.y * scale));
  const right = Math.min(imageWidth, Math.round((rect.x + rect.width) * scale));
  const bottom = Math.min(imageHeight, Math.round((rect.y + rect.height) * scale));
  if (right <= left || bottom <= top) return undefined;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Cuts the element out of a viewport screenshot (PNG). */
export async function cropScreenshot(image: Blob, rect: ViewportRect, viewportWidth: number) {
  const bitmap = await createImageBitmap(image);
  const box = cropBox(rect, viewportWidth, bitmap.width, bitmap.height);
  if (!box) throw new Error('the element is not visible on screen');
  const canvas = new OffscreenCanvas(box.width, box.height);
  canvas
    .getContext('2d')!
    .drawImage(bitmap, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return { image_blob: blob, mime_type: 'image/png', width: box.width, height: box.height };
}
