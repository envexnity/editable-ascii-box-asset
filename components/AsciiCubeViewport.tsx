'use client';

import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  forwardRef,
} from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  ASCII_DENSITIES,
  CUBE_PALETTE,
  resolveAsciiDensityForZoom,
  type AsciiFixedDensityId,
  type CubeSceneState,
} from '@/lib/cube-config';
import {
  computeAsciiGridDimensions,
  pixelsToAsciiText,
  sampleWebGLBufferCellInto,
  type AsciiGridDimensions,
  type SampledCell,
} from '@/lib/ascii-engine';
import {
  buildTypographicCubeRig,
  type TypographicCubeRig,
} from '@/lib/three-cube-builder';

export interface AsciiCubeViewportHandle {
  resetIsometric: () => void;
  getAsciiTextSnapshot: () => string;
}

interface AsciiCubeViewportProps {
  sceneState: CubeSceneState;
  onToggleSpin: () => void;
  onToggleExplode: () => void;
  onToggleDock: () => void;
  onActiveDensityChange?: (tier: AsciiFixedDensityId) => void;
}

const ISOMETRIC_CAMERA_POS = new THREE.Vector3(5.05, 5.05, 5.05);
const ORIGIN = new THREE.Vector3(0, -0.18, 0);

function getResponsiveIsometricPos(aspect: number): THREE.Vector3 {
  const scale = aspect < 1 ? Math.min(1.68, 1.05 / Math.max(0.45, aspect)) : 1;
  return new THREE.Vector3(
    ISOMETRIC_CAMERA_POS.x * scale,
    ISOMETRIC_CAMERA_POS.y * scale,
    ISOMETRIC_CAMERA_POS.z * scale,
  );
}

// Scratch objects pre-allocated outside the render loop (zero GC churn)
const _scratchOffset = new THREE.Vector3();
const _scratchSpherical = new THREE.Spherical();
const _scratchCell: SampledCell = { char: ' ', r: 0, g: 0, b: 0, intensity: 0 };

function detectSoftwareWebGL(): boolean {
  if (typeof document === 'undefined') return false;
  const probe = document.createElement('canvas');
  const gl = probe.getContext('webgl2');
  if (!gl) return true;
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
  const gpu = String(gl.getParameter(param));
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
}

export const AsciiCubeViewport = forwardRef<
  AsciiCubeViewportHandle,
  AsciiCubeViewportProps
>(function AsciiCubeViewport(
  {
    sceneState,
    onToggleSpin,
    onToggleExplode,
    onToggleDock,
    onActiveDensityChange,
  },
  ref,
) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const webglMountRef = useRef<HTMLDivElement | null>(null);
  const asciiCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [contextLost, setContextLost] = useState(false);
  const [gridDimsLabel, setGridDimsLabel] = useState('0x0');
  const [activeDensityLabel, setActiveDensityLabel] =
    useState<AsciiFixedDensityId>('fine');

  // Keep latest React state and callbacks in refs so the WebGL lifecycle never tears down
  const stateRef = useRef<CubeSceneState>(sceneState);
  stateRef.current = sceneState;

  const callbacksRef = useRef({
    onToggleSpin,
    onToggleExplode,
    onToggleDock,
    onActiveDensityChange,
  });
  callbacksRef.current = {
    onToggleSpin,
    onToggleExplode,
    onToggleDock,
    onActiveDensityChange,
  };

  // Imperative bridge refs populated once during Three.js setup
  const engineApiRef = useRef<{
    requestRender: () => void;
    updateTextures: () => void;
    rebuildGrid: () => void;
    resetCamera: () => void;
    getAsciiSnapshot: () => string;
  } | null>(null);

  useImperativeHandle(ref, () => ({
    resetIsometric: () => {
      engineApiRef.current?.resetCamera();
    },
    getAsciiTextSnapshot: () => {
      return engineApiRef.current?.getAsciiSnapshot() ?? '';
    },
  }));

  // Mount Three.js WebGL renderer, PBR studio environment, composite cube, and ASCII pipeline ONCE
  useEffect(() => {
    const stageEl = stageRef.current;
    const webglMountEl = webglMountRef.current;
    const asciiCanvasEl = asciiCanvasRef.current;
    if (!stageEl || !webglMountEl || !asciiCanvasEl) return;

    const isSoftwareGl = detectSoftwareWebGL();
    const asciiCtx = asciiCanvasEl.getContext('2d', { alpha: true });
    if (!asciiCtx) return;

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.setPixelRatio(
      isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2),
    );
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    webglMountEl.appendChild(renderer.domElement);

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    const handleContextRestored = () => {
      setContextLost(false);
      requestRender();
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
    renderer.domElement.addEventListener(
      'webglcontextrestored',
      handleContextRestored,
    );

    const scene = new THREE.Scene();
    const bgColor = new THREE.Color(CUBE_PALETTE.background);
    scene.background = bgColor;
    scene.fog = new THREE.FogExp2(CUBE_PALETTE.background, 0.032);

    // Mandatory studio environment reflection map on every device
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    // 3-Point Warm/Cool Studio Lighting Rig (calibrated for rich coral-vermilion)
    const keyLight = new THREE.DirectionalLight(0xfff1e4, 1.65);
    keyLight.position.set(5.5, 8.5, 4.5);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 22;
    keyLight.shadow.camera.left = -4;
    keyLight.shadow.camera.right = 4;
    keyLight.shadow.camera.top = 4;
    keyLight.shadow.camera.bottom = -4;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const hemiFill = new THREE.HemisphereLight(0xb8cae8, 0x16171a, 0.72);
    scene.add(hemiFill);

    const rimLight = new THREE.DirectionalLight(0xff0000, 0.72);
    rimLight.position.set(-5.5, -2.5, -5.5);
    scene.add(rimLight);

    const initialAspect =
      Math.max(1, stageEl.clientWidth) / Math.max(1, stageEl.clientHeight);
    const camera = new THREE.PerspectiveCamera(30, initialAspect, 0.1, 80);
    camera.position.copy(getResponsiveIsometricPos(initialAspect));
    camera.lookAt(ORIGIN);

    const controls = new OrbitControls(camera, stageEl);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.065;
    controls.enablePan = false;
    controls.minDistance = 3.2;
    controls.maxDistance = 20;
    controls.rotateSpeed = 0.85;
    controls.target.copy(ORIGIN);
    controls.update();

    // Composite Multi-Part Procedural Typographic Cube
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const cubeRig: TypographicCubeRig = buildTypographicCubeRig(
      stateRef.current.lines,
      maxAniso,
    );
    scene.add(cubeRig.root);
    scene.add(cubeRig.shadowDisc);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Offscreen RenderTarget & pixel buffer for real-time supersampled ASCII sampling
    let activeTier: AsciiFixedDensityId = resolveAsciiDensityForZoom(
      stateRef.current.density,
      camera.position.distanceTo(controls.target),
      getResponsiveIsometricPos(initialAspect).length(),
    );
    let gridDims: AsciiGridDimensions = computeAsciiGridDimensions(
      stageEl.clientWidth || window.innerWidth,
      stageEl.clientHeight || window.innerHeight,
      ASCII_DENSITIES[activeTier].cellHeight,
      0.6,
      2,
    );
    let renderTarget: THREE.WebGLRenderTarget | null = null;
    let pixelBuffer = new Uint8Array(4);
    let viewportW = stageEl.clientWidth || window.innerWidth;
    let viewportH = stageEl.clientHeight || window.innerHeight;

    let lastAspect = initialAspect;
    const rebuildGrid = (tierOverride?: AsciiFixedDensityId) => {
      viewportW = Math.max(160, stageEl.clientWidth || window.innerWidth);
      viewportH = Math.max(160, stageEl.clientHeight || window.innerHeight);

      const nextAspect = viewportW / viewportH;
      camera.aspect = nextAspect;
      camera.updateProjectionMatrix();
      renderer.setSize(viewportW, viewportH);

      // Keep cube framed cleanly when resizing between landscape desktop and portrait mobile
      if ((lastAspect >= 1 && nextAspect < 1) || (lastAspect < 1 && nextAspect >= 1)) {
        const targetDist = getResponsiveIsometricPos(nextAspect).length();
        _scratchOffset
          .copy(camera.position)
          .sub(controls.target)
          .normalize()
          .multiplyScalar(targetDist);
        camera.position.copy(controls.target).add(_scratchOffset);
        controls.update();
      }
      lastAspect = nextAspect;

      if (tierOverride) {
        activeTier = tierOverride;
      } else {
        activeTier = resolveAsciiDensityForZoom(
          stateRef.current.density,
          camera.position.distanceTo(controls.target),
          getResponsiveIsometricPos(nextAspect).length(),
          activeTier,
        );
      }

      // Oversample ASCII canvas slightly on 1x displays so 4-5px glyphs stay razor-sharp
      const dpr = Math.min(2, Math.max(window.devicePixelRatio || 1, 1.5));
      asciiCanvasEl.width = Math.floor(viewportW * dpr);
      asciiCanvasEl.height = Math.floor(viewportH * dpr);
      asciiCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const cellH = ASCII_DENSITIES[activeTier].cellHeight;
      gridDims = computeAsciiGridDimensions(viewportW, viewportH, cellH, 0.6, 2);

      if (renderTarget) {
        renderTarget.dispose();
      }
      renderTarget = new THREE.WebGLRenderTarget(
        gridDims.sampleWidth,
        gridDims.sampleHeight,
        {
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          format: THREE.RGBAFormat,
        },
      );
      pixelBuffer = new Uint8Array(
        gridDims.sampleWidth * gridDims.sampleHeight * 4,
      );
      setGridDimsLabel(`${gridDims.cols}x${gridDims.rows}`);
      setActiveDensityLabel(activeTier);
      callbacksRef.current.onActiveDensityChange?.(activeTier);
    };

    // Transition animation targets (frame-rate independent damping)
    let currentExplode = stateRef.current.exploded ? 1 : 0;
    let cameraResetActive = false;
    let lastTickMs = performance.now();

    // Frame scheduling following the Software-WebGL afterDraw() discipline
    let frameId = 0;
    let disposed = false;
    let renderBusy = false;
    let renderDirty = false;

    const afterDraw = (cb: () => void) => {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync?.(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      if (!sync) {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      gl.flush();
      const poll = () => {
        if (disposed) {
          gl.deleteSync(sync);
          return;
        }
        const status = gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (status === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    };

    const drawAsciiFrame = (splitRightHalfOnly: boolean) => {
      if (!renderTarget) return;

      // Render exact 3D scene into compact supersampled RenderTarget
      renderer.setRenderTarget(renderTarget);
      renderer.render(scene, camera);
      renderer.readRenderTargetPixels(
        renderTarget,
        0,
        0,
        gridDims.sampleWidth,
        gridDims.sampleHeight,
        pixelBuffer,
      );
      renderer.setRenderTarget(null);

      const { cols, rows, cellWidth, cellHeight, sampleWidth, sampleHeight } =
        gridDims;
      const { charset, colorMode } = stateRef.current;

      const startCol = splitRightHalfOnly ? Math.floor(cols / 2) : 0;
      const startX = startCol * cellWidth;

      if (splitRightHalfOnly) {
        asciiCtx.clearRect(0, 0, startX, viewportH);
        asciiCtx.fillStyle = CUBE_PALETTE.background;
        asciiCtx.fillRect(startX, 0, viewportW - startX, viewportH);
      } else {
        asciiCtx.fillStyle = CUBE_PALETTE.background;
        asciiCtx.fillRect(0, 0, viewportW, viewportH);
      }

      const fontSize = Math.max(4, Number((cellHeight * 1.06).toFixed(2)));
      asciiCtx.font = `700 ${fontSize}px var(--font-mono), "JetBrains Mono", ui-monospace, monospace`;
      asciiCtx.textBaseline = 'top';
      asciiCtx.textAlign = 'left';

      let lastColor = '';

      for (let row = 0; row < rows; row++) {
        const y = row * cellHeight;
        for (let col = startCol; col < cols; col++) {
          const cell = sampleWebGLBufferCellInto(
            pixelBuffer,
            sampleWidth,
            sampleHeight,
            col,
            row,
            cols,
            rows,
            charset,
            _scratchCell,
          );
          if (cell.intensity <= 0 || cell.char === ' ') continue;

          let fillColor: string;
          if (colorMode === 'mono') {
            const v = Math.round(92 + cell.intensity * 160);
            fillColor = `rgb(${v},${v},${Math.round(v * 0.98)})`;
          } else {
            // Pure full red rgb(R, 0, 0) scaled by sampled intensity
            const rr = Math.min(255, Math.max(105, Math.round(105 + cell.intensity * 150)));
            fillColor = `rgb(${rr},0,0)`;
          }

          if (fillColor !== lastColor) {
            asciiCtx.fillStyle = fillColor;
            lastColor = fillColor;
          }
          asciiCtx.fillText(cell.char, col * cellWidth, y);
        }
      }
    };

    const renderSingleFrame = () => {
      const now = performance.now();
      const dt = Math.min(0.1, Math.max(0.001, (now - lastTickMs) / 1000));
      lastTickMs = now;

      const curState = stateRef.current;
      let needsAnotherFrame = false;

      // Smooth exploded-view face plate separation
      const targetExplode = curState.exploded ? 1 : 0;
      if (Math.abs(currentExplode - targetExplode) > 0.002) {
        currentExplode = isSoftwareGl
          ? targetExplode
          : THREE.MathUtils.damp(currentExplode, targetExplode, 7.5, dt);
        cubeRig.setExplodeAmount(currentExplode);
        if (Math.abs(currentExplode - targetExplode) > 0.002) {
          needsAnotherFrame = true;
        }
      }

      // Smooth reset to reference isometric camera angle
      if (cameraResetActive) {
        const targetPos = getResponsiveIsometricPos(viewportW / viewportH);
        if (isSoftwareGl) {
          camera.position.copy(targetPos);
          controls.target.copy(ORIGIN);
          cameraResetActive = false;
        } else {
          const factor = 1 - Math.exp(-8 * dt);
          camera.position.lerp(targetPos, factor);
          controls.target.lerp(ORIGIN, factor);
          if (camera.position.distanceTo(targetPos) < 0.015) {
            camera.position.copy(targetPos);
            controls.target.copy(ORIGIN);
            cameraResetActive = false;
          } else {
            needsAnotherFrame = true;
          }
        }
      }

      // Continuous auto-spin around Y with subtle architectural tilt
      if (curState.autoRotate) {
        cubeRig.root.rotation.y += dt * 0.52;
        needsAnotherFrame = true;
      }

      const controlsChanged = controls.update();
      if (controlsChanged && !isSoftwareGl) {
        needsAnotherFrame = true;
      }

      // Dynamic zoom-based ASCII LOD: larger cells when zoomed in for performance,
      // micro cells when zoomed out for legibility.
      const camDistance = camera.position.distanceTo(controls.target);
      const baselineDistance = getResponsiveIsometricPos(
        viewportW / viewportH,
      ).length();
      const desiredTier = resolveAsciiDensityForZoom(
        curState.density,
        camDistance,
        baselineDistance,
        activeTier,
      );
      if (desiredTier !== activeTier) {
        rebuildGrid(desiredTier);
      }

      // Render active display mode
      if (curState.renderMode === 'webgl') {
        renderer.render(scene, camera);
      } else if (curState.renderMode === 'split') {
        renderer.render(scene, camera);
        drawAsciiFrame(true);
      } else {
        drawAsciiFrame(false);
      }

      return needsAnotherFrame;
    };

    const requestRender = () => {
      if (disposed) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        if (disposed) return;
        renderDirty = false;
        const keepGoing = renderSingleFrame();
        const done = () => {
          if (disposed) return;
          renderBusy = false;
          if (renderDirty || keepGoing) {
            requestRender();
          }
        };
        if (isSoftwareGl) {
          afterDraw(done);
        } else {
          done();
        }
      });
    };

    const handleControlStart = () => {
      cameraResetActive = false;
    };
    const handleControlChange = () => {
      requestRender();
    };
    controls.addEventListener('start', handleControlStart);
    controls.addEventListener('change', handleControlChange);

    const handleResize = () => {
      rebuildGrid();
      requestRender();
    };
    window.addEventListener('resize', handleResize);

    // Keyboard navigation (orbit with Arrows/WASD, shortcuts for Space/E/R/H)
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      const orbitStep = 0.14;
      if (
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight' ||
        e.key === 'ArrowUp' ||
        e.key === 'ArrowDown' ||
        e.key === 'a' ||
        e.key === 'd' ||
        e.key === 'w' ||
        e.key === 's'
      ) {
        e.preventDefault();
        cameraResetActive = false;
        _scratchOffset.copy(camera.position).sub(controls.target);
        _scratchSpherical.setFromVector3(_scratchOffset);
        if (e.key === 'ArrowLeft' || e.key === 'a') {
          _scratchSpherical.theta -= orbitStep;
        } else if (e.key === 'ArrowRight' || e.key === 'd') {
          _scratchSpherical.theta += orbitStep;
        } else if (e.key === 'ArrowUp' || e.key === 'w') {
          _scratchSpherical.phi = Math.max(0.2, _scratchSpherical.phi - orbitStep);
        } else if (e.key === 'ArrowDown' || e.key === 's') {
          _scratchSpherical.phi = Math.min(
            Math.PI - 0.2,
            _scratchSpherical.phi + orbitStep,
          );
        }
        _scratchOffset.setFromSpherical(_scratchSpherical);
        camera.position.copy(controls.target).add(_scratchOffset);
        camera.lookAt(controls.target);
        requestRender();
      } else if (e.code === 'Space') {
        e.preventDefault();
        callbacksRef.current.onToggleSpin();
      } else if (e.key === 'e' || e.key === 'E') {
        callbacksRef.current.onToggleExplode();
      } else if (e.key === 'r' || e.key === 'R') {
        cubeRig.root.rotation.set(0, 0, 0);
        cameraResetActive = true;
        requestRender();
      } else if (e.key === 'h' || e.key === 'H') {
        callbacksRef.current.onToggleDock();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    engineApiRef.current = {
      requestRender,
      updateTextures: () => {
        cubeRig.updateTextures(stateRef.current.lines);
        requestRender();
      },
      rebuildGrid: () => {
        rebuildGrid();
        requestRender();
      },
      resetCamera: () => {
        cubeRig.root.rotation.set(0, 0, 0);
        cameraResetActive = true;
        requestRender();
      },
      getAsciiSnapshot: () => {
        if (!renderTarget) return '';
        renderer.setRenderTarget(renderTarget);
        renderer.render(scene, camera);
        renderer.readRenderTargetPixels(
          renderTarget,
          0,
          0,
          gridDims.sampleWidth,
          gridDims.sampleHeight,
          pixelBuffer,
        );
        renderer.setRenderTarget(null);
        return pixelsToAsciiText(
          pixelBuffer,
          gridDims.sampleWidth,
          gridDims.sampleHeight,
          gridDims.cols,
          gridDims.rows,
          stateRef.current.charset,
        );
      },
    };

    rebuildGrid();
    requestRender();

    // Repaint CanvasTextures once webfont (Saira Condensed / Agency FB) resolves
    document.fonts?.ready.then(() => {
      if (!disposed) {
        cubeRig.updateTextures(stateRef.current.lines);
        requestRender();
      }
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      controls.removeEventListener('start', handleControlStart);
      controls.removeEventListener('change', handleControlChange);
      controls.dispose();
      renderer.domElement.removeEventListener(
        'webglcontextlost',
        handleContextLost,
      );
      renderer.domElement.removeEventListener(
        'webglcontextrestored',
        handleContextRestored,
      );
      if (renderTarget) renderTarget.dispose();
      envTarget.dispose();
      cubeRig.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === webglMountEl) {
        webglMountEl.removeChild(renderer.domElement);
      }
      engineApiRef.current = null;
    };
  }, []);

  // Reactive triggers that update textures, grid density, or kick on-demand render without remounting WebGL
  const linesKey = sceneState.lines.join('|');
  useEffect(() => {
    engineApiRef.current?.updateTextures();
  }, [linesKey]);

  useEffect(() => {
    engineApiRef.current?.rebuildGrid();
  }, [sceneState.density]);

  useEffect(() => {
    engineApiRef.current?.requestRender();
  }, [
    sceneState.renderMode,
    sceneState.colorMode,
    sceneState.charset,
    sceneState.autoRotate,
    sceneState.exploded,
  ]);

  const showWebgl =
    sceneState.renderMode === 'webgl' || sceneState.renderMode === 'split';
  const showAscii =
    sceneState.renderMode === 'ascii' || sceneState.renderMode === 'split';

  return (
    <div
      ref={stageRef}
      data-testid="cube-viewport"
      data-render-mode={sceneState.renderMode}
      data-color-mode={sceneState.colorMode}
      data-charset={sceneState.charset}
      data-density={sceneState.density}
      data-active-density={activeDensityLabel}
      data-exploded={String(sceneState.exploded)}
      data-auto-rotate={String(sceneState.autoRotate)}
      data-grid-dims={gridDimsLabel}
      className="fixed inset-0 w-screen h-screen overflow-hidden bg-black cursor-grab active:cursor-grabbing touch-none select-none"
    >
      {/* Dedicated WebGL canvas mount container isolated from sibling React nodes */}
      <div
        ref={webglMountRef}
        className={`absolute inset-0 transition-opacity duration-200 ${
          showWebgl ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Live ASCII 2D canvas overlay (pointer-events-none so OrbitControls receives all drags) */}
      <canvas
        ref={asciiCanvasRef}
        aria-label="Interactive Three.js cube rendered as ASCII typography"
        className={`absolute inset-0 w-full h-full block pointer-events-none transition-opacity duration-200 ${
          showAscii ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Clean split hairline divider when comparing 3D PBR vs live ASCII side-by-side */}
      {sceneState.renderMode === 'split' && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-[#ff0000]/25 flex items-start justify-center pt-6"
        >
          <div className="flex items-center gap-6 text-[11px] font-mono tracking-wider text-[#ff0000]">
            <span className="-translate-x-8 whitespace-nowrap">3D PBR</span>
            <span className="translate-x-8 whitespace-nowrap">
              ASCII
            </span>
          </div>
        </div>
      )}

      {/* Graceful fallback if WebGL context is lost */}
      {contextLost && (
        <div
          role="alert"
          className="absolute inset-0 z-30 flex items-center justify-center bg-black p-6"
        >
          <div className="max-w-sm border border-[#ff0000]/30 bg-[#120404] p-6 text-center rounded-xl">
            <p className="text-base font-semibold text-[#ff0000]">
              WebGL context paused
            </p>
            <p className="mt-2 text-sm text-[#ff0000]/80">
              Your browser temporarily reclaimed the graphics context. Reload or
              interact to restore the 3D ASCII cube.
            </p>
          </div>
        </div>
      )}
    </div>
  );
});
