export type RenderMode = 'ascii' | 'webgl' | 'split';
export type ColorMode = 'coral' | 'mono';
export type AsciiCharsetId = 'classic' | 'blocks' | 'minimal' | 'code';
export type AsciiFixedDensityId = 'micro' | 'fine' | 'balanced' | 'coarse';
export type AsciiDensityId = 'auto' | AsciiFixedDensityId;

export type CubeLines = [string, string, string, string];

export const DEFAULT_CUBE_LINES: CubeLines = ['MAKE', 'WORK', 'FEEL', 'EASY'];

export const CUBE_PALETTE = {
  background: '#000000',
  chassis: '#121316',
  plateSurface: '#050506',
  accent: '#ff0000',
  accentBright: '#ff0000',
  railMetal: '#262930',
  monoGlyph: '#f2f0eb',
} as const;

export const ASCII_CHARSETS: Record<
  AsciiCharsetId,
  { label: string; chars: string }
> = {
  classic: {
    label: 'Classic',
    chars: ' .:-=+*#%@',
  },
  blocks: {
    label: 'Blocks',
    chars: ' ░▒▓█',
  },
  minimal: {
    label: 'Minimal',
    chars: ' ·:+X#',
  },
  code: {
    label: 'Code',
    chars: ' .,:;i1tfLCG08@',
  },
};

export const ASCII_DENSITIES: Record<
  AsciiDensityId,
  { label: string; cellHeight: number }
> = {
  auto: { label: 'Auto (Zoom)', cellHeight: 5 },
  micro: { label: 'Micro', cellHeight: 4 },
  fine: { label: 'Small', cellHeight: 5 },
  balanced: { label: 'Medium', cellHeight: 7 },
  coarse: { label: 'Large', cellHeight: 11 },
};

/**
 * Selects the optimal ASCII cell size based on camera zoom distance relative to
 * the baseline isometric distance: close-up uses Large (fewest cells, highest FPS)
 * while far-away uses Micro so lettering remains readable when zoomed out.
 */
export function resolveAsciiDensityForZoom(
  densityMode: AsciiDensityId,
  cameraDistance: number,
  baselineDistance: number,
  currentTier?: AsciiFixedDensityId,
): AsciiFixedDensityId {
  if (densityMode !== 'auto') {
    return densityMode;
  }

  const ratio = cameraDistance / Math.max(0.1, baselineDistance);
  const h = currentTier ? 0.035 : 0;

  if (currentTier === 'coarse') {
    if (ratio < 0.64 + h) return 'coarse';
  } else if (currentTier === 'balanced') {
    if (ratio < 0.64 - h) return 'coarse';
    if (ratio < 0.88 + h) return 'balanced';
  } else if (currentTier === 'fine') {
    if (ratio < 0.88 - h) return 'balanced';
    if (ratio < 1.24 + h) return 'fine';
  } else if (currentTier === 'micro') {
    if (ratio >= 1.24 - h) return 'micro';
  }

  if (ratio < 0.64) return 'coarse';
  if (ratio < 0.88) return 'balanced';
  if (ratio < 1.24) return 'fine';
  return 'micro';
}

export interface CubeSceneState {
  lines: CubeLines;
  renderMode: RenderMode;
  colorMode: ColorMode;
  charset: AsciiCharsetId;
  density: AsciiDensityId;
  autoRotate: boolean;
  exploded: boolean;
}

export const INITIAL_CUBE_STATE: CubeSceneState = {
  lines: [...DEFAULT_CUBE_LINES] as CubeLines,
  renderMode: 'ascii',
  colorMode: 'coral',
  charset: 'classic',
  density: 'auto',
  autoRotate: false,
  exploded: false,
};

export function normalizeCubeLines(input: readonly string[]): CubeLines {
  const result: string[] = [];
  for (let i = 0; i < 4; i++) {
    const raw = input[i] ?? '';
    const cleaned = raw.trim().toUpperCase().slice(0, 10);
    result.push(cleaned || DEFAULT_CUBE_LINES[i]);
  }
  return result as CubeLines;
}
