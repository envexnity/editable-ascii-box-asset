import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CUBE_LINES,
  normalizeCubeLines,
  resolveAsciiDensityForZoom,
} from './cube-config';
import {
  computeAsciiGridDimensions,
  intensityToAsciiChar,
  pixelsToAsciiText,
  sampleWebGLBufferCell,
} from './ascii-engine';
import { generateStandaloneIndexHtml } from './standalone-html';

test('normalizeCubeLines enforces 4 uppercase trimmed lines with safe defaults', () => {
  assert.deepEqual(normalizeCubeLines(['make', ' work ', 'feel', 'easy']), [
    'MAKE',
    'WORK',
    'FEEL',
    'EASY',
  ]);
  assert.deepEqual(normalizeCubeLines(['', 'only-two']), [
    DEFAULT_CUBE_LINES[0],
    'ONLY-TWO',
    DEFAULT_CUBE_LINES[2],
    DEFAULT_CUBE_LINES[3],
  ]);
  assert.deepEqual(normalizeCubeLines(['superlongwordhere', 'a', 'b', 'c']), [
    'SUPERLONGW',
    'A',
    'B',
    'C',
  ]);
});

test('resolveAsciiDensityForZoom scales from Large close-up to Micro far away with hysteresis', () => {
  const baseline = 8.75;
  assert.equal(resolveAsciiDensityForZoom('auto', 3.5, baseline), 'coarse');
  assert.equal(resolveAsciiDensityForZoom('auto', 6.5, baseline), 'balanced');
  assert.equal(resolveAsciiDensityForZoom('auto', 8.75, baseline), 'fine');
  assert.equal(resolveAsciiDensityForZoom('auto', 14.0, baseline), 'micro');

  // Hysteresis keeps current tier steady right around threshold
  assert.equal(
    resolveAsciiDensityForZoom('auto', 5.65, baseline, 'coarse'),
    'coarse',
  );
  // Fixed manual override always wins
  assert.equal(resolveAsciiDensityForZoom('micro', 3.5, baseline), 'micro');
});

test('computeAsciiGridDimensions preserves aspect bounds and high-density micro grids', () => {
  const small = computeAsciiGridDimensions(1440, 900, 5, 0.6, 2);
  assert.equal(small.cellHeight, 5);
  assert.equal(small.cellWidth, 3);
  assert.equal(small.cols, 480);
  assert.equal(small.rows, 180);
  assert.equal(small.sampleWidth, 960);
  assert.equal(small.sampleHeight, 360);

  const micro = computeAsciiGridDimensions(1440, 900, 4, 0.6, 2);
  assert.equal(micro.cellHeight, 4);
  assert.equal(micro.cols, 600);
  assert.equal(micro.rows, 225);

  const tiny = computeAsciiGridDimensions(50, 50, 10, 0.6, 2);
  assert.ok(tiny.cols >= 24);
  assert.ok(tiny.rows >= 16);
});

test('intensityToAsciiChar suppresses dark background and maps bright coral to dense glyphs', () => {
  // #000000 pure black & dark shadows -> empty space
  const pureBlack = intensityToAsciiChar(0, 0, 0, 'classic');
  assert.equal(pureBlack.char, ' ');
  assert.equal(pureBlack.intensity, 0);

  const bg = intensityToAsciiChar(18, 19, 21, 'classic');
  assert.equal(bg.char, ' ');
  assert.equal(bg.intensity, 0);

  // #EF4E42 coral red -> dense character
  const coral = intensityToAsciiChar(239, 78, 66, 'classic');
  assert.notEqual(coral.char, ' ');
  assert.ok(coral.intensity > 0.7);
});

test('pixelsToAsciiText flips WebGL bottom-up rows to top-down text accurately', () => {
  // 2x2 grid with supersample=1: bottom row (y=0 in WebGL) is bright coral, top row (y=1 in WebGL) is dark bg
  const pixels = new Uint8Array([
    // y=0 (bottom row in WebGL -> second row in ASCII output)
    239, 78, 66, 255, 239, 78, 66, 255,
    // y=1 (top row in WebGL -> first row in ASCII output)
    18, 19, 21, 255, 18, 19, 21, 255,
  ]);
  const text = pixelsToAsciiText(pixels, 2, 2, 2, 2, 'classic');
  const lines = text.split('\n');
  assert.equal(lines.length, 2);
  assert.equal(lines[0], '');
  assert.equal(lines[1].length, 2);
  assert.ok(lines[1][0] !== ' ');
});

test('sampleWebGLBufferCell preserves thin 1-subpixel strokes inside 2x2 supersample block', () => {
  // 1x1 cell with 2x2 supersampling: only 1 of 4 subpixels is coral red
  const pixels = new Uint8Array([
    239, 78, 66, 255, 18, 19, 21, 255,
    18, 19, 21, 255, 18, 19, 21, 255,
  ]);
  const cell = sampleWebGLBufferCell(pixels, 2, 2, 0, 0, 1, 1, 'classic');
  assert.notEqual(cell.char, ' ');
  assert.ok(cell.r > 80);
});

test('generateStandaloneIndexHtml embeds Agency FB font, cube text, auto zoom LOD, and Three.js module', () => {
  const html = generateStandaloneIndexHtml({
    lines: ['MAKE', 'WORK', 'FEEL', 'EASY'],
    charset: 'classic',
    density: 'auto',
    colorMode: 'coral',
  });
  assert.ok(html.includes('<!DOCTYPE html>'));
  assert.ok(html.includes('Agency FB'));
  assert.ok(html.includes('["MAKE","WORK","FEEL","EASY"]'));
  assert.ok(html.includes('resolveTierForZoom'));
  assert.ok(html.includes('OrbitControls'));
  assert.ok(!html.includes('outlineTex'));
});
