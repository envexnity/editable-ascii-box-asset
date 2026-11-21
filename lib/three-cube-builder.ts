import * as THREE from 'three';
import { CUBE_PALETTE, type CubeLines } from './cube-config';

export interface CubeFaceAssembly {
  group: THREE.Group;
  normal: THREE.Vector3;
  baseOffset: number;
  isOutlined: boolean;
  material: THREE.MeshStandardMaterial;
}

export interface TypographicCubeRig {
  root: THREE.Group;
  faces: CubeFaceAssembly[];
  shadowDisc: THREE.Mesh;
  updateTextures: (lines: CubeLines) => void;
  setExplodeAmount: (amount: number) => void;
  dispose: () => void;
}

function resolveAgencyFontStack(): string {
  if (typeof window === 'undefined') {
    return '"Agency FB", "Saira Condensed", "Arial Narrow", sans-serif';
  }
  const fallbackVar = getComputedStyle(document.documentElement)
    .getPropertyValue('--font-agency-fallback')
    .trim();
  const fallback = fallbackVar || '"Saira Condensed"';
  return `"Agency FB", ${fallback}, "Saira Condensed", "Arial Narrow", sans-serif`;
}

function createMicroGrainCanvas(size = 256): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const img = ctx.createImageData(size, size);
  const data = img.data;
  // Deterministic linear congruential generator for zero-randomness micro-grain
  let seed = 1337;
  for (let i = 0; i < size * size; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const v = 112 + ((seed >>> 24) % 36);
    const idx = i * 4;
    data[idx] = v;
    data[idx + 1] = v;
    data[idx + 2] = v;
    data[idx + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function drawTypographicFace(
  canvas: HTMLCanvasElement,
  lines: CubeLines,
  outlined: boolean,
  isBump: boolean,
): void {
  const size = canvas.width;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.fillStyle = isBump ? '#6c6c6c' : CUBE_PALETTE.plateSurface;
  ctx.fillRect(0, 0, size, size);

  // Subtle architectural hairline margin border on bump map for crisp edge catchlight
  if (isBump) {
    ctx.strokeStyle = '#9a9a9a';
    ctx.lineWidth = 6;
    ctx.strokeRect(10, 10, size - 20, size - 20);
  }

  const fontStack = resolveAgencyFontStack();
  const padX = Math.round(size * 0.036);
  const padY = Math.round(size * 0.026);
  const usableW = size - padX * 2;
  const usableH = size - padY * 2;
  const rowHeight = usableH / 4;

  const baseFontSize = Math.round(size * 0.24);
  ctx.font = `700 ${baseFontSize}px ${fontStack}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Measure uniform cap height reference using 'H' so all 4 rows align identically
  const refMetrics = ctx.measureText('H');
  const capHeight =
    (refMetrics.actualBoundingBoxAscent || baseFontSize * 0.72) +
    (refMetrics.actualBoundingBoxDescent || 0);

  const targetRowCapH = rowHeight * 0.77;

  for (let i = 0; i < 4; i++) {
    const word = lines[i] || '';
    if (!word) continue;

    const metrics = ctx.measureText(word);
    const measuredW = Math.max(
      1,
      metrics.actualBoundingBoxLeft !== undefined &&
        metrics.actualBoundingBoxRight !== undefined
        ? metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight
        : metrics.width,
    );

    const scaleX = usableW / measuredW;
    const scaleY = targetRowCapH / Math.max(1, capHeight);
    const centerY = padY + rowHeight * (i + 0.515);

    ctx.save();
    ctx.translate(size / 2, centerY);
    ctx.scale(scaleX, scaleY);

    if (outlined) {
      // Calibrate stroke width so hollow coral outlines read cleanly in both 3D and ASCII
      const avgScale = Math.max(0.45, (scaleX + scaleY) * 0.5);
      ctx.strokeStyle = isBump ? '#ededed' : CUBE_PALETTE.accent;
      ctx.lineWidth = (size * 0.013) / avgScale;
      ctx.lineJoin = 'miter';
      ctx.miterLimit = 3;
      ctx.strokeText(word, 0, 0);
    } else {
      ctx.fillStyle = isBump ? '#f4f4f4' : CUBE_PALETTE.accent;
      ctx.fillText(word, 0, 0);
    }
    ctx.restore();
  }
}

function createChamferedSquareShape(halfSize: number, chamfer: number): THREE.Shape {
  const s = halfSize;
  const c = chamfer;
  const shape = new THREE.Shape();
  shape.moveTo(-s + c, -s);
  shape.lineTo(s - c, -s);
  shape.lineTo(s, -s + c);
  shape.lineTo(s, s - c);
  shape.lineTo(s - c, s);
  shape.lineTo(-s + c, s);
  shape.lineTo(-s, s - c);
  shape.lineTo(-s, -s + c);
  shape.closePath();
  return shape;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(
      size / 2,
      size / 2,
      size * 0.05,
      size / 2,
      size / 2,
      size * 0.5,
    );
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
    grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.28)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Builds the composite multi-part procedural typographic cube (chamfered core,
 * 6 beveled typographic face assemblies with solid/outlined isometric contrast,
 * 12 instanced machined edge rails, 8 corner brackets, and studio contact shadow).
 */
export function buildTypographicCubeRig(
  lines: CubeLines,
  maxAnisotropy: number,
): TypographicCubeRig {
  const root = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];

  const microGrainTex = new THREE.CanvasTexture(createMicroGrainCanvas(256));
  microGrainTex.wrapS = THREE.RepeatWrapping;
  microGrainTex.wrapT = THREE.RepeatWrapping;
  microGrainTex.repeat.set(3, 3);
  disposables.push(microGrainTex);

  // Part 1: Primary Silhouette — Chamfered Matte Obsidian Chassis Core
  const coreShape = createChamferedSquareShape(0.86, 0.08);
  const coreGeo = new THREE.ExtrudeGeometry(coreShape, {
    depth: 1.72,
    bevelEnabled: true,
    bevelThickness: 0.07,
    bevelSize: 0.07,
    bevelSegments: 2,
  });
  coreGeo.center();
  disposables.push(coreGeo);

  const coreMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(CUBE_PALETTE.chassis),
    roughness: 0.86,
    metalness: 0.08,
    bumpMap: microGrainTex,
    bumpScale: 0.008,
  });
  disposables.push(coreMat);

  const coreMesh = new THREE.Mesh(coreGeo, coreMat);
  coreMesh.castShadow = true;
  coreMesh.receiveShadow = true;
  root.add(coreMesh);

  // Part 2: Accent Details — 12 Machined Anodized Edge Rails (InstancedMesh)
  const railGeo = new THREE.BoxGeometry(1.76, 0.036, 0.036);
  const railMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(CUBE_PALETTE.railMetal),
    roughness: 0.28,
    metalness: 0.82,
  });
  disposables.push(railGeo, railMat);

  const rails = new THREE.InstancedMesh(railGeo, railMat, 12);
  const dummy = new THREE.Object3D();
  const rOff = 0.968;
  let railIndex = 0;

  // 4 rails parallel to X
  for (const sy of [-1, 1]) {
    for (const sz of [-1, 1]) {
      dummy.position.set(0, sy * rOff, sz * rOff);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      rails.setMatrixAt(railIndex++, dummy.matrix);
    }
  }
  // 4 rails parallel to Y
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      dummy.position.set(sx * rOff, 0, sz * rOff);
      dummy.rotation.set(0, 0, Math.PI / 2);
      dummy.updateMatrix();
      rails.setMatrixAt(railIndex++, dummy.matrix);
    }
  }
  // 4 rails parallel to Z
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      dummy.position.set(sx * rOff, sy * rOff, 0);
      dummy.rotation.set(0, Math.PI / 2, 0);
      dummy.updateMatrix();
      rails.setMatrixAt(railIndex++, dummy.matrix);
    }
  }
  rails.instanceMatrix.needsUpdate = true;
  rails.computeBoundingSphere();
  root.add(rails);

  // Part 3: 8 Flush Machined Corner Blocks (InstancedMesh)
  const cornerGeo = new THREE.BoxGeometry(0.064, 0.064, 0.064);
  const cornerMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#2d313a'),
    roughness: 0.24,
    metalness: 0.86,
  });
  disposables.push(cornerGeo, cornerMat);

  const corners = new THREE.InstancedMesh(cornerGeo, cornerMat, 8);
  let cornerIndex = 0;
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        dummy.position.set(sx * 0.942, sy * 0.942, sz * 0.942);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        corners.setMatrixAt(cornerIndex++, dummy.matrix);
      }
    }
  }
  corners.instanceMatrix.needsUpdate = true;
  corners.computeBoundingSphere();
  root.add(corners);

  // Shared High-Res Procedural Typographic Textures (Solid & Outlined + Relief Bump Maps)
  const solidCanvas = document.createElement('canvas');
  solidCanvas.width = 1024;
  solidCanvas.height = 1024;
  const outlineCanvas = document.createElement('canvas');
  outlineCanvas.width = 1024;
  outlineCanvas.height = 1024;
  const solidBumpCanvas = document.createElement('canvas');
  solidBumpCanvas.width = 512;
  solidBumpCanvas.height = 512;
  const outlineBumpCanvas = document.createElement('canvas');
  outlineBumpCanvas.width = 512;
  outlineBumpCanvas.height = 512;

  const solidTex = new THREE.CanvasTexture(solidCanvas);
  solidTex.colorSpace = THREE.SRGBColorSpace;
  solidTex.anisotropy = maxAnisotropy;

  const outlineTex = new THREE.CanvasTexture(outlineCanvas);
  outlineTex.colorSpace = THREE.SRGBColorSpace;
  outlineTex.anisotropy = maxAnisotropy;

  const solidBumpTex = new THREE.CanvasTexture(solidBumpCanvas);
  solidBumpTex.anisotropy = maxAnisotropy;

  const outlineBumpTex = new THREE.CanvasTexture(outlineBumpCanvas);
  outlineBumpTex.anisotropy = maxAnisotropy;

  disposables.push(solidTex, outlineTex, solidBumpTex, outlineBumpTex);

  const paintAllTextures = (nextLines: CubeLines) => {
    drawTypographicFace(solidCanvas, nextLines, false, false);
    drawTypographicFace(outlineCanvas, nextLines, true, false);
    drawTypographicFace(solidBumpCanvas, nextLines, false, true);
    drawTypographicFace(outlineBumpCanvas, nextLines, true, true);
    solidTex.needsUpdate = true;
    outlineTex.needsUpdate = true;
    solidBumpTex.needsUpdate = true;
    outlineBumpTex.needsUpdate = true;
  };
  paintAllTextures(lines);

  // Parts 4–9: Six Beveled Typographic Face Plate Assemblies
  const backingShape = createChamferedSquareShape(0.955, 0.035);
  const backingGeo = new THREE.ExtrudeGeometry(backingShape, {
    depth: 0.032,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.012,
    bevelSegments: 1,
  });
  backingGeo.center();
  disposables.push(backingGeo);

  const backingMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#1d1f24'),
    roughness: 0.55,
    metalness: 0.35,
  });
  disposables.push(backingMat);

  const decalGeo = new THREE.PlaneGeometry(1.9, 1.9);
  disposables.push(decalGeo);

  const solidFaceMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: solidTex,
    bumpMap: solidBumpTex,
    bumpScale: 0.016,
    roughness: 0.54,
    metalness: 0.02,
    emissive: new THREE.Color('#ff0000'),
    emissiveMap: solidTex,
    emissiveIntensity: 0.55,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

  const outlineFaceMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: outlineTex,
    bumpMap: outlineBumpTex,
    bumpScale: 0.014,
    roughness: 0.56,
    metalness: 0.02,
    emissive: new THREE.Color('#ff0000'),
    emissiveMap: outlineTex,
    emissiveIntensity: 0.65,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  disposables.push(solidFaceMat, outlineFaceMat);

  // All 6 faces render solid filled red typography (no hollow/outlined text on the box).
  const faceSpecs: Array<{
    normal: [number, number, number];
    rot: [number, number, number];
    outlined: boolean;
  }> = [
    { normal: [0, 1, 0], rot: [-Math.PI / 2, 0, Math.PI / 2], outlined: false },
    { normal: [1, 0, 0], rot: [0, Math.PI / 2, 0], outlined: false },
    { normal: [0, 0, 1], rot: [0, 0, 0], outlined: false },
    { normal: [-1, 0, 0], rot: [0, -Math.PI / 2, 0], outlined: false },
    { normal: [0, 0, -1], rot: [0, Math.PI, 0], outlined: false },
    { normal: [0, -1, 0], rot: [Math.PI / 2, 0, -Math.PI / 2], outlined: false },
  ];

  const baseOffset = 0.975;
  const faces: CubeFaceAssembly[] = [];

  for (const spec of faceSpecs) {
    const faceGroup = new THREE.Group();
    const normal = new THREE.Vector3(...spec.normal);

    const backingMesh = new THREE.Mesh(backingGeo, backingMat);
    backingMesh.castShadow = true;
    backingMesh.receiveShadow = true;
    faceGroup.add(backingMesh);

    const mat = spec.outlined ? outlineFaceMat : solidFaceMat;
    const decalMesh = new THREE.Mesh(decalGeo, mat);
    decalMesh.position.z = 0.03;
    decalMesh.receiveShadow = true;
    faceGroup.add(decalMesh);

    faceGroup.position.copy(normal).multiplyScalar(baseOffset);
    faceGroup.rotation.set(...spec.rot);
    root.add(faceGroup);

    faces.push({
      group: faceGroup,
      normal,
      baseOffset,
      isOutlined: spec.outlined,
      material: mat,
    });
  }

  // Grounding Studio Radial Contact Shadow Plane
  const shadowTex = createContactShadowTexture();
  const shadowGeo = new THREE.CircleGeometry(2.15, 40);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  });
  disposables.push(shadowTex, shadowGeo, shadowMat);

  const shadowDisc = new THREE.Mesh(shadowGeo, shadowMat);
  shadowDisc.rotation.x = -Math.PI / 2;
  shadowDisc.position.y = -1.92;

  const setExplodeAmount = (amount: number) => {
    const clamped = Math.max(0, Math.min(1, amount));
    const spread = clamped * 0.58;
    for (const face of faces) {
      face.group.position
        .copy(face.normal)
        .multiplyScalar(face.baseOffset + spread);
    }
  };

  const dispose = () => {
    for (const item of disposables) {
      item.dispose();
    }
  };

  return {
    root,
    faces,
    shadowDisc,
    updateTextures: paintAllTextures,
    setExplodeAmount,
    dispose,
  };
}
