import {
  ASCII_CHARSETS,
  ASCII_DENSITIES,
  CUBE_PALETTE,
  normalizeCubeLines,
  type AsciiCharsetId,
  type AsciiDensityId,
  type ColorMode,
  type CubeLines,
} from './cube-config';

export interface StandaloneExportConfig {
  lines: CubeLines;
  charset: AsciiCharsetId;
  density: AsciiDensityId;
  colorMode: ColorMode;
}

/**
 * Generates a self-contained, zero-build index.html file that renders the exact
 * interactive Three.js typographic cube in real-time ASCII with Agency FB lettering.
 */
export function generateStandaloneIndexHtml(
  config: StandaloneExportConfig,
): string {
  const safeLines = normalizeCubeLines(config.lines);
  const chars = ASCII_CHARSETS[config.charset].chars;
  const isAuto = config.density === 'auto';
  const fixedCellHeight = ASCII_DENSITIES[config.density].cellHeight;
  const serializedLines = JSON.stringify(safeLines);
  const serializedChars = JSON.stringify(chars);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeLines.join(' ')} — Interactive ASCII 3D Cube</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;700&family=Saira+Condensed:wght@600;700&display=swap" rel="stylesheet" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: ${CUBE_PALETTE.background}; color: #ff0000; font-family: system-ui, -apple-system, sans-serif; }
    #stage { position: fixed; inset: 0; cursor: grab; touch-action: none; }
    #stage:active { cursor: grabbing; }
    #ascii-canvas { position: fixed; inset: 0; width: 100%; height: 100%; display: block; pointer-events: none; }
    #hud { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); display: flex; gap: 8px; padding: 8px 12px; border-radius: 12px; background: rgba(13, 5, 5, 0.96); border: 1px solid rgba(255, 0, 0, 0.3); z-index: 10; }
    button { background: #000; color: rgba(255, 0, 0, 0.85); border: 1px solid rgba(255, 0, 0, 0.28); border-radius: 8px; padding: 6px 12px; font-size: 12px; font-weight: 500; cursor: pointer; white-space: nowrap; }
    button:hover { color: #ff0000; border-color: rgba(255, 0, 0, 0.65); }
    button.active { background: #360000; color: #ff1a1a; border-color: #ff0000; }
  </style>
  <script type="importmap">
    {
      "imports": {
        "three": "https://cdn.jsdelivr.net/npm/three@0.174.0/build/three.module.js",
        "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.174.0/examples/jsm/"
      }
    }
  </script>
</head>
<body>
  <div id="stage"></div>
  <canvas id="ascii-canvas"></canvas>
  <div id="hud">
    <button id="btn-mode" class="active">ASCII</button>
    <button id="btn-lod" class="${isAuto ? 'active' : ''}">${isAuto ? 'Size: Auto' : 'Size: Fixed'}</button>
    <button id="btn-spin">Spin</button>
    <button id="btn-reset">Isometric</button>
  </div>
  <script type="module">
    import * as THREE from 'three';
    import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
    import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

    const LINES = ${serializedLines};
    const CHARS = ${serializedChars};
    const FIXED_CELL_H = ${fixedCellHeight};
    const COLOR_MODE = ${JSON.stringify(config.colorMode)};
    const BASELINE_DIST = Math.hypot(5.05, 5.05, 5.05);
    const TIERS = { coarse: 11, balanced: 7, fine: 5, micro: 4 };
    const TIER_LABELS = { coarse: 'Large', balanced: 'Medium', fine: 'Small', micro: 'Micro' };

    let autoLod = ${JSON.stringify(isAuto)};
    let activeTier = 'fine';
    let currentCellH = autoLod ? TIERS.fine : FIXED_CELL_H;

    const stage = document.getElementById('stage');
    const asciiCanvas = document.getElementById('ascii-canvas');
    const asciiCtx = asciiCanvas.getContext('2d');
    const btnLod = document.getElementById('btn-lod');

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    stage.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('${CUBE_PALETTE.background}');
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(5.05, 5.05, 5.05);

    const controls = new OrbitControls(camera, stage);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.minDistance = 3.2;
    controls.maxDistance = 20;
    controls.target.set(0, -0.18, 0);
    controls.update();

    const keyLight = new THREE.DirectionalLight(0xfff1e6, 1.65);
    keyLight.position.set(6, 9, 5);
    scene.add(keyLight);
    scene.add(new THREE.HemisphereLight(0xb8c7e0, 0x1a181c, 0.72));

    function makeFaceTexture(outlined) {
      const c = document.createElement('canvas');
      c.width = 1024;
      c.height = 1024;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '${CUBE_PALETTE.plateSurface}';
      ctx.fillRect(0, 0, 1024, 1024);

      const padX = 36;
      const padY = 26;
      const usableW = 1024 - padX * 2;
      const usableH = 1024 - padY * 2;
      const rowH = usableH / 4;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '700 220px "Agency FB", "Saira Condensed", sans-serif';

      LINES.forEach((word, i) => {
        const metrics = ctx.measureText(word);
        const scaleX = usableW / Math.max(1, metrics.width);
        const scaleY = (rowH * 0.78) / 168;
        ctx.save();
        ctx.translate(512, padY + rowH * (i + 0.52));
        ctx.scale(scaleX, scaleY);
        if (outlined) {
          ctx.strokeStyle = '${CUBE_PALETTE.accent}';
          ctx.lineWidth = 10 / Math.max(0.5, (scaleX + scaleY) * 0.5);
          ctx.lineJoin = 'miter';
          ctx.strokeText(word, 0, 0);
        } else {
          ctx.fillStyle = '${CUBE_PALETTE.accent}';
          ctx.fillText(word, 0, 0);
        }
        ctx.restore();
      });

      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      return tex;
    }

    const cubeGroup = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.BoxGeometry(1.94, 1.94, 1.94),
      new THREE.MeshStandardMaterial({ color: '${CUBE_PALETTE.chassis}', roughness: 0.85, metalness: 0.1 })
    );
    cubeGroup.add(core);

    const solidTex = makeFaceTexture(false);
    const plateGeo = new THREE.PlaneGeometry(1.96, 1.96);

    const faces = [
      { pos: [0, 1.005, 0], rot: [-Math.PI / 2, 0, Math.PI / 2], tex: solidTex },
      { pos: [1.005, 0, 0], rot: [0, Math.PI / 2, 0], tex: solidTex },
      { pos: [0, 0, 1.005], rot: [0, 0, 0], tex: solidTex },
      { pos: [-1.005, 0, 0], rot: [0, -Math.PI / 2, 0], tex: solidTex },
      { pos: [0, 0, -1.005], rot: [0, Math.PI, 0], tex: solidTex },
      { pos: [0, -1.005, 0], rot: [Math.PI / 2, 0, -Math.PI / 2], tex: solidTex }
    ];

    faces.forEach((f) => {
      const mat = new THREE.MeshStandardMaterial({
        map: f.tex,
        roughness: 0.54,
        metalness: 0.02,
        emissiveMap: f.tex,
        emissive: new THREE.Color('#ff0000'),
        emissiveIntensity: 0.55
      });
      const plate = new THREE.Mesh(plateGeo, mat);
      plate.position.set(...f.pos);
      plate.rotation.set(...f.rot);
      cubeGroup.add(plate);
    });
    scene.add(cubeGroup);

    let asciiMode = true;
    let spinning = false;
    let cols = 240, rows = 140, cellW = 3, rt = null, pixels = null;

    function resolveTierForZoom() {
      const dist = camera.position.distanceTo(controls.target);
      const ratio = dist / BASELINE_DIST;
      const h = 0.035;
      if (activeTier === 'coarse' && ratio < 0.64 + h) return 'coarse';
      if (activeTier === 'balanced' && ratio >= 0.64 - h && ratio < 0.88 + h) return 'balanced';
      if (activeTier === 'fine' && ratio >= 0.88 - h && ratio < 1.24 + h) return 'fine';
      if (activeTier === 'micro' && ratio >= 1.24 - h) return 'micro';
      if (ratio < 0.64) return 'coarse';
      if (ratio < 0.88) return 'balanced';
      if (ratio < 1.24) return 'fine';
      return 'micro';
    }

    function updateLodBadge() {
      btnLod.textContent = autoLod ? 'Auto: ' + TIER_LABELS[activeTier] : 'Size: Fixed';
      btnLod.classList.toggle('active', autoLod);
    }

    function rebuildGrid() {
      const w = window.innerWidth, h = window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      const dpr = Math.min(2, Math.max(window.devicePixelRatio || 1, 1.5));
      asciiCanvas.width = Math.floor(w * dpr);
      asciiCanvas.height = Math.floor(h * dpr);
      asciiCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      currentCellH = autoLod ? TIERS[activeTier] : FIXED_CELL_H;
      cellW = Math.max(2.1, currentCellH * 0.6);
      cols = Math.max(32, Math.min(640, Math.floor(w / cellW)));
      rows = Math.max(20, Math.min(360, Math.floor(h / currentCellH)));
      if (rt) rt.dispose();
      rt = new THREE.WebGLRenderTarget(cols * 2, rows * 2, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
      pixels = new Uint8Array(cols * 2 * rows * 2 * 4);
      updateLodBadge();
    }

    function drawAscii() {
      if (autoLod) {
        const nextTier = resolveTierForZoom();
        if (nextTier !== activeTier) {
          activeTier = nextTier;
          rebuildGrid();
        }
      }

      renderer.setRenderTarget(rt);
      renderer.render(scene, camera);
      renderer.readRenderTargetPixels(rt, 0, 0, cols * 2, rows * 2, pixels);
      renderer.setRenderTarget(null);

      asciiCtx.fillStyle = '${CUBE_PALETTE.background}';
      asciiCtx.fillRect(0, 0, window.innerWidth, window.innerHeight);
      asciiCtx.font = '700 ' + Math.max(4, currentCellH * 1.06).toFixed(2) + 'px "JetBrains Mono", monospace';
      asciiCtx.textBaseline = 'top';

      const sw = cols * 2;
      for (let r = 0; r < rows; r++) {
        const flipR = rows - 1 - r;
        const y = r * currentCellH;
        for (let c = 0; c < cols; c++) {
          let sumR = 0, sumG = 0, sumB = 0, maxE = -1, pR = 0, pG = 0, pB = 0;
          for (let dy = 0; dy < 2; dy++) {
            for (let dx = 0; dx < 2; dx++) {
              const idx = ((flipR * 2 + dy) * sw + (c * 2 + dx)) * 4;
              const rv = pixels[idx], gv = pixels[idx + 1], bv = pixels[idx + 2];
              sumR += rv; sumG += gv; sumB += bv;
              const e = Math.max(rv, gv, bv);
              if (e > maxE) { maxE = e; pR = rv; pG = gv; pB = bv; }
            }
          }
          if (pR < 34 && pG < 34 && pB < 34) continue;
          const cr = Math.round((sumR / 4) * 0.68 + pR * 0.32);
          const cg = Math.round((sumG / 4) * 0.68 + pG * 0.32);
          const cb = Math.round((sumB / 4) * 0.68 + pB * 0.32);
          const luma = (0.2126 * cr + 0.7152 * cg + 0.0722 * cb) / 255;
          const sig = 0.4 * luma + 0.6 * (Math.max(cr, cg, cb) / 255);
          if (sig <= 0.13) continue;
          const norm = Math.min(1, Math.pow((sig - 0.13) / 0.87, 0.84));
          const ch = CHARS[Math.min(CHARS.length - 1, Math.max(1, Math.round(norm * (CHARS.length - 1))))];
          if (COLOR_MODE === 'mono') {
            const v = Math.round(92 + norm * 160);
            asciiCtx.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
          } else {
            const rr = Math.min(255, Math.max(105, Math.round(105 + norm * 150)));
            asciiCtx.fillStyle = 'rgb(' + rr + ',0,0)';
          }
          asciiCtx.fillText(ch, c * cellW, y);
        }
      }
    }

    document.getElementById('btn-mode').addEventListener('click', (e) => {
      asciiMode = !asciiMode;
      e.target.textContent = asciiMode ? 'ASCII' : '3D WebGL';
      e.target.classList.toggle('active', asciiMode);
      asciiCanvas.style.display = asciiMode ? 'block' : 'none';
      renderer.domElement.style.opacity = asciiMode ? '0' : '1';
    });
    btnLod.addEventListener('click', () => {
      autoLod = !autoLod;
      activeTier = resolveTierForZoom();
      rebuildGrid();
    });
    document.getElementById('btn-spin').addEventListener('click', (e) => {
      spinning = !spinning;
      controls.autoRotate = spinning;
      controls.autoRotateSpeed = 1.8;
      e.target.classList.toggle('active', spinning);
    });
    document.getElementById('btn-reset').addEventListener('click', () => {
      camera.position.set(5.05, 5.05, 5.05);
      controls.target.set(0, -0.18, 0);
      controls.update();
    });

    renderer.domElement.style.opacity = '0';
    window.addEventListener('resize', rebuildGrid);
    document.fonts.ready.then(() => {
      solidTex.needsUpdate = true;
    });
    activeTier = resolveTierForZoom();
    rebuildGrid();

    function animate() {
      requestAnimationFrame(animate);
      controls.update();
      if (asciiMode) drawAscii();
      else renderer.render(scene, camera);
    }
    animate();
  </script>
</body>
</html>
`;
}
