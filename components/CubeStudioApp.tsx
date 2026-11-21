'use client';

import { useCallback, useRef, useState } from 'react';
import {
  DEFAULT_CUBE_LINES,
  INITIAL_CUBE_STATE,
  normalizeCubeLines,
  type AsciiCharsetId,
  type AsciiDensityId,
  type AsciiFixedDensityId,
  type ColorMode,
  type CubeLines,
  type CubeSceneState,
  type RenderMode,
} from '@/lib/cube-config';
import { generateStandaloneIndexHtml } from '@/lib/standalone-html';
import {
  AsciiCubeViewport,
  type AsciiCubeViewportHandle,
} from './AsciiCubeViewport';
import { CubeControlDock } from './CubeControlDock';

export function CubeStudioApp() {
  const viewportRef = useRef<AsciiCubeViewportHandle | null>(null);
  const [sceneState, setSceneState] =
    useState<CubeSceneState>(INITIAL_CUBE_STATE);
  const [activeDensityTier, setActiveDensityTier] =
    useState<AsciiFixedDensityId>('fine');
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [exportedHtmlCount, setExportedHtmlCount] = useState(0);

  const handleSetRenderMode = useCallback((renderMode: RenderMode) => {
    setSceneState((prev) => ({ ...prev, renderMode }));
  }, []);

  const handleSetColorMode = useCallback((colorMode: ColorMode) => {
    setSceneState((prev) => ({ ...prev, colorMode }));
  }, []);

  const handleSetCharset = useCallback((charset: AsciiCharsetId) => {
    setSceneState((prev) => ({ ...prev, charset }));
  }, []);

  const handleSetDensity = useCallback((density: AsciiDensityId) => {
    setSceneState((prev) => ({ ...prev, density }));
  }, []);

  const handleToggleSpin = useCallback(() => {
    setSceneState((prev) => ({ ...prev, autoRotate: !prev.autoRotate }));
  }, []);

  const handleToggleExplode = useCallback(() => {
    setSceneState((prev) => ({ ...prev, exploded: !prev.exploded }));
  }, []);

  const handleToggleDock = useCallback(() => {
    setDockCollapsed((prev) => !prev);
  }, []);

  const handleResetIsometric = useCallback(() => {
    setSceneState((prev) => ({ ...prev, autoRotate: false }));
    viewportRef.current?.resetIsometric();
  }, []);

  const handleUpdateLine = useCallback((index: number, value: string) => {
    setSceneState((prev) => {
      const next = [...prev.lines] as CubeLines;
      next[index] = value.toUpperCase().slice(0, 10);
      return { ...prev, lines: next };
    });
  }, []);

  const handleResetLines = useCallback(() => {
    setSceneState((prev) => ({
      ...prev,
      lines: [...DEFAULT_CUBE_LINES] as CubeLines,
    }));
  }, []);

  const handleCopyAscii = useCallback(async () => {
    const text = viewportRef.current?.getAsciiTextSnapshot() ?? '';
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for restricted iframe clipboard permissions
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      document.body.removeChild(area);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }, []);

  const handleDownloadHtml = useCallback(() => {
    const html = generateStandaloneIndexHtml({
      lines: normalizeCubeLines(sceneState.lines),
      charset: sceneState.charset,
      density: sceneState.density,
      colorMode: sceneState.colorMode,
    });
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'index.html';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setExportedHtmlCount((c) => c + 1);
  }, [sceneState.lines, sceneState.charset, sceneState.density, sceneState.colorMode]);

  return (
    <main
      data-exported-count={exportedHtmlCount}
      className="relative w-screen h-screen overflow-hidden bg-black"
    >
      {/* Full-bleed interactive Three.js + real-time ASCII canvas */}
      <AsciiCubeViewport
        ref={viewportRef}
        sceneState={sceneState}
        onToggleSpin={handleToggleSpin}
        onToggleExplode={handleToggleExplode}
        onToggleDock={handleToggleDock}
        onActiveDensityChange={setActiveDensityTier}
      />

      {/* Minimal Top-Left Editorial Title (zero pill clutter, unobstructed center) */}
      <header className="pointer-events-none fixed top-5 left-6 z-10 flex flex-col gap-0.5">
        <h1
          className="text-xl sm:text-2xl font-bold tracking-wider uppercase text-[#ff0000] leading-none"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {sceneState.lines.join(' ')}
        </h1>
        <p className="text-xs text-[#ff0000]/80">
          Drag to orbit <span aria-hidden="true">·</span> Scroll to zoom{' '}
          <span aria-hidden="true">·</span> Agency FB
        </p>
      </header>

      {/* Unified Collapsible Bottom Control Dock */}
      <CubeControlDock
        state={sceneState}
        activeDensityTier={activeDensityTier}
        collapsed={dockCollapsed}
        copied={copied}
        onToggleCollapsed={handleToggleDock}
        onSetRenderMode={handleSetRenderMode}
        onSetColorMode={handleSetColorMode}
        onSetCharset={handleSetCharset}
        onSetDensity={handleSetDensity}
        onToggleAutoRotate={handleToggleSpin}
        onToggleExplode={handleToggleExplode}
        onResetIsometric={handleResetIsometric}
        onUpdateLine={handleUpdateLine}
        onResetLines={handleResetLines}
        onCopyAscii={handleCopyAscii}
        onDownloadHtml={handleDownloadHtml}
      />
    </main>
  );
}
