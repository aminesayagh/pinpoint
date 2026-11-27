import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cropBox } from '../src/features/selection/crop.ts';

test('crop box follows the element, scaled and clipped to the screenshot', () => {
  // 1:1 screen
  assert.deepEqual(cropBox({ x: 24, y: 209, width: 226, height: 229 }, 1000, 1000, 700), {
    x: 24,
    y: 209,
    width: 226,
    height: 229,
  });
  // high-DPI: image is twice the CSS size
  assert.deepEqual(cropBox({ x: 10, y: 20, width: 30, height: 40 }, 1000, 2000, 1400), {
    x: 20,
    y: 40,
    width: 60,
    height: 80,
  });
  // partly above and right of the viewport: only the visible part
  assert.deepEqual(cropBox({ x: 950, y: -50, width: 100, height: 100 }, 1000, 1000, 700), {
    x: 950,
    y: 0,
    width: 50,
    height: 50,
  });
  // fully off screen
  assert.equal(cropBox({ x: 0, y: 800, width: 50, height: 50 }, 1000, 1000, 700), undefined);
});
