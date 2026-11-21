import { ASCII_CHARSETS, type AsciiCharsetId } from './cube-config';

export interface AsciiGridDimensions {
  cols: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
  sampleWidth: number;
  sampleHeight: number;
}

export interface SampledCell {
  char: string;
  r: number;
  g: number;
  b: number;
  intensity: number;
}

/**
 * Computes responsive ASCII grid dimensions from viewport CSS pixels so that
 * monospace glyphs preserve exact 1:1 geometric aspect ratio of the 3D scene.
 */
export function computeAsciiGridDimensions(
  viewportWidth: number,
  viewportHeight: number,
  cellHeight: number,
  charAspect = 0.6,
  supersample = 2,
): AsciiGridDimensions {
  const safeW = Math.max(160, Math.floor(viewportWidth));
  const safeH = Math.max(160, Math.floor(viewportHeight));
  const safeCellH = Math.max(3.5, Math.min(24, cellHeight));
  const cellWidth = Math.max(2.1, safeCellH * charAspect);

  const cols = Math.max(24, Math.min(640, Math.floor(safeW / cellWidth)));
  const rows = Math.max(16, Math.min(360, Math.floor(safeH / safeCellH)));
  const factor = Math.max(1, Math.min(2, Math.round(supersample)));

  return {
    cols,
    rows,
    cellWidth,
    cellHeight: safeCellH,
    sampleWidth: cols * factor,
    sampleHeight: rows * factor,
  };
}

/**
 * Converts an sRGB pixel (0-255) into perceptual luminance (0-1) using Rec. 709.
 */
export function computePerceptualLuminance(
  r: number,
  g: number,
  b: number,
): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/**
 * Maps pixel RGB + signal intensity to an ASCII glyph index, suppressing
 * background charcoal noise below floorThreshold so the negative space stays clean.
 */
export function intensityToAsciiChar(
  r: number,
  g: number,
  b: number,
  charsetId: AsciiCharsetId,
  floorThreshold = 0.13,
): { char: string; intensity: number } {
  const chars = ASCII_CHARSETS[charsetId].chars;
  const luma = computePerceptualLuminance(r, g, b);
  // Coral-red channels carry high red energy even when perceptual luma is moderate.
  // Blending max-channel chroma signal preserves bright legible ASCII on red lettering.
  const peak = Math.max(r, g, b) / 255;
  const rawSignal = 0.4 * luma + 0.6 * peak;

  if (rawSignal <= floorThreshold) {
    return { char: chars[0], intensity: 0 };
  }

  const normalized = Math.min(
    1,
    Math.max(0, (rawSignal - floorThreshold) / (1 - floorThreshold)),
  );
  const boosted = Math.pow(normalized, 0.84);
  const idx = Math.min(
    chars.length - 1,
    Math.max(1, Math.round(boosted * (chars.length - 1))),
  );

  return { char: chars[idx], intensity: boosted };
}

/**
 * Zero-allocation WebGL buffer cell sampler for high-density ASCII grids.
 * Writes sampled glyph and color directly into `out`.
 */
export function sampleWebGLBufferCellInto(
  pixels: Uint8Array,
  sampleWidth: number,
  sampleHeight: number,
  col: number,
  row: number,
  cols: number,
  rows: number,
  charsetId: AsciiCharsetId,
  out: SampledCell,
): SampledCell {
  const scaleX = Math.max(1, Math.floor(sampleWidth / cols));
  const scaleY = Math.max(1, Math.floor(sampleHeight / rows));

  // WebGL pixel buffers start at bottom-left; flip vertically for top-down rows.
  const flippedRow = rows - 1 - row;
  const startX = col * scaleX;
  const startY = flippedRow * scaleY;

  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let maxEnergy = -1;
  let peakR = 0;
  let peakG = 0;
  let peakB = 0;
  let count = 0;

  for (let dy = 0; dy < scaleY; dy++) {
    const py = Math.min(sampleHeight - 1, startY + dy);
    const rowOffset = py * sampleWidth;
    for (let dx = 0; dx < scaleX; dx++) {
      const px = Math.min(sampleWidth - 1, startX + dx);
      const offset = (rowOffset + px) * 4;
      const r = pixels[offset];
      const g = pixels[offset + 1];
      const b = pixels[offset + 2];
      sumR += r;
      sumG += g;
      sumB += b;
      const energy = Math.max(r, g, b) * 0.6 + (r + g + b) * 0.133;
      if (energy > maxEnergy) {
        maxEnergy = energy;
        peakR = r;
        peakG = g;
        peakB = b;
      }
      count++;
    }
  }

  // Fast exit for pure charcoal background cells (skips luminance math & fillText)
  if (peakR < 34 && peakG < 34 && peakB < 34) {
    out.char = ' ';
    out.r = peakR;
    out.g = peakG;
    out.b = peakB;
    out.intensity = 0;
    return out;
  }

  const avgR = sumR / count;
  const avgG = sumG / count;
  const avgB = sumB / count;

  // 32% peak blend keeps thin Agency FB outlines unbroken even when zoomed far out
  const blend = scaleX > 1 || scaleY > 1 ? 0.32 : 0;
  const r = Math.round(avgR * (1 - blend) + peakR * blend);
  const g = Math.round(avgG * (1 - blend) + peakG * blend);
  const b = Math.round(avgB * (1 - blend) + peakB * blend);

  const mapped = intensityToAsciiChar(r, g, b, charsetId);
  out.char = mapped.char;
  out.r = r;
  out.g = g;
  out.b = b;
  out.intensity = mapped.intensity;
  return out;
}

/**
 * Samples a bottom-to-top WebGL RGBA pixel buffer (from readRenderTargetPixels)
 * using crisp 2x2 weighted supersampling so thin outlined strokes stay readable
 * even when zoomed out.
 */
export function sampleWebGLBufferCell(
  pixels: Uint8Array,
  sampleWidth: number,
  sampleHeight: number,
  col: number,
  row: number,
  cols: number,
  rows: number,
  charsetId: AsciiCharsetId,
): SampledCell {
  return sampleWebGLBufferCellInto(
    pixels,
    sampleWidth,
    sampleHeight,
    col,
    row,
    cols,
    rows,
    charsetId,
    { char: ' ', r: 0, g: 0, b: 0, intensity: 0 },
  );
}

/**
 * Converts a WebGL RGBA pixel buffer into a clean newline-separated ASCII string
 * suitable for clipboard copy or plain-text export.
 */
export function pixelsToAsciiText(
  pixels: Uint8Array,
  sampleWidth: number,
  sampleHeight: number,
  cols: number,
  rows: number,
  charsetId: AsciiCharsetId,
): string {
  const lines: string[] = [];
  for (let row = 0; row < rows; row++) {
    let line = '';
    for (let col = 0; col < cols; col++) {
      const cell = sampleWebGLBufferCell(
        pixels,
        sampleWidth,
        sampleHeight,
        col,
        row,
        cols,
        rows,
        charsetId,
      );
      line += cell.char;
    }
    lines.push(line.trimEnd());
  }
  return lines.join('\n');
}
