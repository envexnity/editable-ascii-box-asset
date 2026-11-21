'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Download,
  Layers,
  Play,
  Pause,
  RotateCcw,
  SlidersHorizontal,
  Type,
} from 'lucide-react';
import {
  ASCII_CHARSETS,
  ASCII_DENSITIES,
  DEFAULT_CUBE_LINES,
  type AsciiCharsetId,
  type AsciiDensityId,
  type AsciiFixedDensityId,
  type ColorMode,
  type CubeLines,
  type CubeSceneState,
  type RenderMode,
} from '@/lib/cube-config';

interface CubeControlDockProps {
  state: CubeSceneState;
  activeDensityTier: AsciiFixedDensityId;
  collapsed: boolean;
  copied: boolean;
  onToggleCollapsed: () => void;
  onSetRenderMode: (mode: RenderMode) => void;
  onSetColorMode: (mode: ColorMode) => void;
  onSetCharset: (charset: AsciiCharsetId) => void;
  onSetDensity: (density: AsciiDensityId) => void;
  onToggleAutoRotate: () => void;
  onToggleExplode: () => void;
  onResetIsometric: () => void;
  onUpdateLine: (index: number, value: string) => void;
  onResetLines: () => void;
  onCopyAscii: () => void;
  onDownloadHtml: () => void;
}

type SubPanel = 'none' | 'style' | 'text';

export function CubeControlDock({
  state,
  activeDensityTier,
  collapsed,
  copied,
  onToggleCollapsed,
  onSetRenderMode,
  onSetColorMode,
  onSetCharset,
  onSetDensity,
  onToggleAutoRotate,
  onToggleExplode,
  onResetIsometric,
  onUpdateLine,
  onResetLines,
  onCopyAscii,
  onDownloadHtml,
}: CubeControlDockProps) {
  const [openPanel, setOpenPanel] = useState<SubPanel>('none');

  const togglePanel = (panel: SubPanel) => {
    setOpenPanel((prev) => (prev === panel ? 'none' : panel));
  };

  return (
    <div className="fixed bottom-4 left-1/2 z-20 -translate-x-1/2 w-fit max-w-[96vw] flex flex-col items-center pointer-events-none">
      {/* Collapse / Expand toggle tab pinned cleanly to top of dock */}
      <button
        type="button"
        onClick={onToggleCollapsed}
        aria-expanded={!collapsed}
        aria-label={collapsed ? 'Show Controls' : 'Hide Controls'}
        className="pointer-events-auto mb-1.5 inline-flex items-center gap-1.5 rounded-t-lg rounded-b-md border border-[#ff0000]/30 bg-[#0d0505] px-3 py-1 text-xs font-medium text-[#ff0000] hover:border-[#ff0000]/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff0000] whitespace-nowrap shrink-0"
      >
        {collapsed ? (
          <>
            <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Show Controls</span>
          </>
        ) : (
          <>
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Hide Controls</span>
          </>
        )}
      </button>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            key="dock-body"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 18 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="pointer-events-auto w-full flex flex-col items-center gap-2"
          >
            {/* Optional Sub-Drawer: ASCII Style or Custom Cube Typography */}
            <AnimatePresence mode="wait">
              {openPanel === 'style' && (
                <motion.div
                  key="style-panel"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.15 }}
                  className="w-full max-w-xl rounded-xl border border-[#ff0000]/30 bg-[#0d0505] p-4 shadow-xl"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs font-medium text-[#ff0000]/80 mb-2">
                        Palette
                      </p>
                      <div
                        role="group"
                        aria-label="ASCII color palette"
                        className="inline-flex rounded-lg bg-black p-1 border border-[#ff0000]/25 w-full"
                      >
                        {(
                          [
                            ['coral', 'Full Red'],
                            ['mono', 'Mono'],
                          ] as const
                        ).map(([id, label]) => (
                          <button
                            key={id}
                            type="button"
                            onClick={() => onSetColorMode(id)}
                            aria-pressed={state.colorMode === id}
                            className={`flex-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                              state.colorMode === id
                                ? 'bg-[#360000] border border-[#ff0000] text-[#ff1a1a]'
                                : 'text-[#ff0000]/70 hover:text-[#ff0000]'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-medium text-[#ff0000]/80 mb-2">
                        Characters
                      </p>
                      <div
                        role="group"
                        aria-label="ASCII character set"
                        className="grid grid-cols-2 gap-1 rounded-lg bg-black p-1 border border-[#ff0000]/25"
                      >
                        {(
                          Object.entries(ASCII_CHARSETS) as Array<
                            [AsciiCharsetId, { label: string; chars: string }]
                          >
                        ).map(([id, cfg]) => (
                          <button
                            key={id}
                            type="button"
                            onClick={() => onSetCharset(id)}
                            aria-pressed={state.charset === id}
                            className={`rounded-md px-2 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                              state.charset === id
                                ? 'bg-[#360000] border border-[#ff0000] text-[#ff1a1a]'
                                : 'text-[#ff0000]/70 hover:text-[#ff0000]'
                            }`}
                          >
                            {cfg.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-medium text-[#ff0000]/80 mb-2">
                        ASCII Size
                        {state.density === 'auto'
                          ? ` · ${ASCII_DENSITIES[activeDensityTier].label}`
                          : ''}
                      </p>
                      <div
                        role="group"
                        aria-label="ASCII font size"
                        className="grid grid-cols-2 gap-1 rounded-lg bg-black p-1 border border-[#ff0000]/25"
                      >
                        <button
                          type="button"
                          onClick={() => onSetDensity('auto')}
                          aria-pressed={state.density === 'auto'}
                          className={`col-span-2 rounded-md px-2 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                            state.density === 'auto'
                              ? 'bg-[#360000] border border-[#ff0000] text-[#ff1a1a]'
                              : 'text-[#ff0000]/70 hover:text-[#ff0000]'
                          }`}
                        >
                          Auto (Zoom)
                        </button>
                        {(
                          ['micro', 'fine', 'balanced', 'coarse'] as const
                        ).map((id) => (
                          <button
                            key={id}
                            type="button"
                            onClick={() => onSetDensity(id)}
                            aria-pressed={state.density === id}
                            className={`rounded-md px-2 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                              state.density === id
                                ? 'bg-[#360000] border border-[#ff0000] text-[#ff1a1a]'
                                : 'text-[#ff0000]/70 hover:text-[#ff0000]'
                            }`}
                          >
                            {ASCII_DENSITIES[id].label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {openPanel === 'text' && (
                <motion.div
                  key="text-panel"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.15 }}
                  className="w-full max-w-xl rounded-xl border border-[#ff0000]/30 bg-[#0d0505] p-4 shadow-xl"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium text-[#ff0000]">
                      Cube Face Typography (Agency FB)
                    </span>
                    <button
                      type="button"
                      onClick={onResetLines}
                      className="text-xs font-medium text-[#ff0000] hover:underline transition-colors whitespace-nowrap"
                    >
                      Reset Default
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {state.lines.map((line, index) => (
                      <div key={index} className="flex flex-col gap-1">
                        <label
                          htmlFor={`cube-line-${index}`}
                          className="text-[11px] text-[#ff0000]/80"
                        >
                          Row {index + 1}
                        </label>
                        <input
                          id={`cube-line-${index}`}
                          type="text"
                          value={line}
                          maxLength={10}
                          placeholder={DEFAULT_CUBE_LINES[index]}
                          onChange={(e) => onUpdateLine(index, e.target.value)}
                          className="w-full rounded-lg border border-[#ff0000]/30 bg-black px-2.5 py-1.5 text-sm font-semibold tracking-wider uppercase text-[#ff0000] placeholder:text-[#ff0000]/40 focus:border-[#ff0000] focus:outline-none"
                        />
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Primary Single-Row Compact Control Dock (solid dark fill, no backdrop-filter over WebGL) */}
            <nav
              aria-label="Cube Controls"
              className="w-fit max-w-full rounded-xl border border-[#ff0000]/30 bg-[#0d0505] px-2.5 py-2 shadow-2xl flex flex-wrap lg:flex-nowrap items-center justify-center gap-2"
            >
              {/* Zone 1: View Mode Segmented Switcher */}
              <div
                role="group"
                aria-label="Render mode"
                className="inline-flex items-center rounded-lg bg-black p-1 border border-[#ff0000]/25 shrink-0"
              >
                {(
                  [
                    ['ascii', 'ASCII'],
                    ['webgl', '3D PBR'],
                    ['split', 'Split'],
                  ] as Array<[RenderMode, string]>
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => onSetRenderMode(mode)}
                    aria-pressed={state.renderMode === mode}
                    className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff0000] ${
                      state.renderMode === mode
                        ? 'bg-[#360000] border border-[#ff0000] text-[#ff1a1a]'
                        : 'text-[#ff0000]/75 hover:text-[#ff0000]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div
                className="hidden lg:block h-5 w-px bg-[#ff0000]/25 shrink-0"
                aria-hidden="true"
              />

              {/* Zone 2: Scene & Typography Controls */}
              <div className="flex flex-wrap lg:flex-nowrap items-center justify-center gap-1.5">
                <button
                  type="button"
                  onClick={() => togglePanel('style')}
                  aria-expanded={openPanel === 'style'}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff0000] ${
                    openPanel === 'style'
                      ? 'border-[#ff0000] bg-[#360000] text-[#ff1a1a]'
                      : 'border-[#ff0000]/25 bg-black text-[#ff0000]/85 hover:text-[#ff0000] hover:border-[#ff0000]/60'
                  }`}
                >
                  <SlidersHorizontal
                    className="h-3.5 w-3.5"
                    aria-hidden="true"
                  />
                  <span>ASCII Style</span>
                </button>

                <button
                  type="button"
                  onClick={() => togglePanel('text')}
                  aria-expanded={openPanel === 'text'}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff0000] ${
                    openPanel === 'text'
                      ? 'border-[#ff0000] bg-[#360000] text-[#ff1a1a]'
                      : 'border-[#ff0000]/25 bg-black text-[#ff0000]/85 hover:text-[#ff0000] hover:border-[#ff0000]/60'
                  }`}
                >
                  <Type className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Edit Text</span>
                </button>

                <button
                  type="button"
                  onClick={onToggleAutoRotate}
                  aria-pressed={state.autoRotate}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff0000] ${
                    state.autoRotate
                      ? 'border-[#ff0000] bg-[#360000] text-[#ff1a1a]'
                      : 'border-[#ff0000]/25 bg-black text-[#ff0000]/85 hover:text-[#ff0000] hover:border-[#ff0000]/60'
                  }`}
                >
                  {state.autoRotate ? (
                    <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Play className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  <span>{state.autoRotate ? 'Pause' : 'Spin'}</span>
                </button>

                <button
                  type="button"
                  onClick={onToggleExplode}
                  aria-pressed={state.exploded}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff0000] ${
                    state.exploded
                      ? 'border-[#ff0000] bg-[#360000] text-[#ff1a1a]'
                      : 'border-[#ff0000]/25 bg-black text-[#ff0000]/85 hover:text-[#ff0000] hover:border-[#ff0000]/60'
                  }`}
                >
                  <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Explode</span>
                </button>

                <button
                  type="button"
                  onClick={onResetIsometric}
                  aria-label="Reset Isometric View"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#ff0000]/25 bg-black px-3 py-1.5 text-xs font-medium text-[#ff0000]/85 hover:text-[#ff0000] hover:border-[#ff0000]/60 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff0000]"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Isometric</span>
                </button>
              </div>

              {/* Zone 3: Copy ASCII & Standalone index.html Export */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={onCopyAscii}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#ff0000]/25 bg-black px-3 py-1.5 text-xs font-medium text-[#ff0000]/90 hover:text-[#ff0000] hover:border-[#ff0000]/60 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff0000]"
                >
                  {copied ? (
                    <Check
                      className="h-3.5 w-3.5 text-[#ff0000]"
                      aria-hidden="true"
                    />
                  ) : (
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  <span>{copied ? 'Copied' : 'Copy ASCII'}</span>
                </button>

                <button
                  type="button"
                  onClick={onDownloadHtml}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#ff0000] bg-[#360000] px-3 py-1.5 text-xs font-semibold text-[#ff1a1a] hover:bg-[#4d0000] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff0000]"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>index.html</span>
                </button>
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
