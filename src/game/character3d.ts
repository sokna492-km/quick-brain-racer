/**
 * Offscreen Three.js cat racers composited into the Canvas2D outrun draw queue.
 */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

import { BASE_SPEED, type Racer } from "./raceEngine";
import {
  CAT_CLIP,
  CAT_HEIGHT,
  cloneCuteCat,
  createCuteCatClips,
  createCuteCatRoot,
  tintCatMaterials,
} from "./cuteCatModel";

const GLB_URL = `${import.meta.env.BASE_URL}models/cat-racer.glb`;
const RT_SIZE = 256;
const FRAME_MARGIN = 1.28; // room for ears/bounce; keep modest so feet aren't floating
const CAMERA_FOV = 34;
/** Transparent pad under feet as a fraction of RT height (symmetric framing). */
const BOTTOM_PAD_FRAC = (FRAME_MARGIN - 1) / (2 * FRAME_MARGIN);

type ClipName = "idle" | "cuteRun" | "stumble";

type CatInstance = {
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  idle: THREE.AnimationAction;
  cuteRun: THREE.AnimationAction;
  stumble: THREE.AnimationAction;
  current: ClipName;
};

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let template: THREE.Object3D | null = null;
let clips: THREE.AnimationClip[] = [];
let ready = false;
let failed = false;
let loading: Promise<void> | null = null;
const pool = new Map<number, CatInstance>();

let blitCanvas: HTMLCanvasElement | null = null;
let blitCtx: CanvasRenderingContext2D | null = null;

function ensureBlitTarget(): CanvasRenderingContext2D | null {
  if (blitCtx && blitCanvas) return blitCtx;
  blitCanvas = document.createElement("canvas");
  blitCanvas.width = RT_SIZE;
  blitCanvas.height = RT_SIZE;
  blitCtx = blitCanvas.getContext("2d", { alpha: true });
  return blitCtx;
}

function findClip(name: string): THREE.AnimationClip | undefined {
  const lower = name.toLowerCase();
  return clips.find((c) => c.name.toLowerCase() === lower);
}

function ensureRenderer(): boolean {
  if (renderer && scene && camera) return true;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = RT_SIZE;
    canvas.height = RT_SIZE;

    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      // Must stay true: false breaks WebGL canvas → 2D ctx.drawImage compositing.
      premultipliedAlpha: true,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(RT_SIZE, RT_SIZE, false);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    scene = new THREE.Scene();

    // Bright, neutral lighting so mascots stay readable on asphalt (avoid green ground tint).
    const hemi = new THREE.HemisphereLight(0xffffff, 0xb0b8c4, 1.55);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    // Light the rear (camera-facing) side of the cat
    sun.position.set(0.4, 2.8, 3.5);
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0xfff0dd, 0.85);
    rim.position.set(-2.2, 1.2, -1.5);
    scene.add(rim);

    camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.05, 20);
    camera.position.set(0, CAT_HEIGHT * 0.5, CAT_HEIGHT * 2.4);
    camera.lookAt(0, CAT_HEIGHT * 0.45, 0);

    return true;
  } catch {
    return false;
  }
}

function buildProceduralTemplate() {
  template = createCuteCatRoot("#ffffff");
  clips = createCuteCatClips();
}

async function loadTemplate(): Promise<void> {
  if (!ensureRenderer()) {
    failed = true;
    return;
  }

  try {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(GLB_URL);
    const catRoot =
      gltf.scene.getObjectByName("CatRoot") ?? gltf.scene.children[0] ?? gltf.scene;
    template = catRoot;
    // Always use procedural clips so run timing/leg phase stay in sync with bob.
    clips = createCuteCatClips();
    template.updateMatrixWorld(true);
  } catch {
    buildProceduralTemplate();
  }

  if (!template) {
    failed = true;
    return;
  }

  // Ensure required clips exist
  if (!findClip(CAT_CLIP.Idle) || !findClip(CAT_CLIP.CuteRun)) {
    const procedural = createCuteCatClips();
    for (const c of procedural) {
      if (!findClip(c.name)) clips.push(c);
    }
  }

  ready = true;
  // Normalize facing after GLTF Euler round-trip (Y=PI often becomes X=-PI).
  template.rotation.set(0, Math.PI, 0);
  template.updateMatrixWorld(true);
}

export function ensureCharactersReady(): Promise<void> {
  if (ready || failed) return Promise.resolve();
  if (loading) return loading;
  loading = loadTemplate().finally(() => {
    loading = null;
  });
  return loading;
}

function getOrCreateInstance(racer: Racer): CatInstance | null {
  if (!ready || !template || !scene) return null;
  let inst = pool.get(racer.id);
  if (inst) return inst;

  const root = cloneCuteCat(template);
  tintCatMaterials(root, racer.color || "#ffffff");
  root.visible = false;
  scene.add(root);

  const mixer = new THREE.AnimationMixer(root);
  const idleClip = findClip(CAT_CLIP.Idle) ?? createCuteCatClips()[0]!;
  const runClip = findClip(CAT_CLIP.CuteRun) ?? createCuteCatClips()[1]!;
  const stumbleClip = findClip(CAT_CLIP.Stumble) ?? createCuteCatClips()[2]!;

  const idle = mixer.clipAction(idleClip);
  const cuteRun = mixer.clipAction(runClip);
  const stumble = mixer.clipAction(stumbleClip);

  idle.enabled = true;
  cuteRun.enabled = true;
  stumble.enabled = true;
  idle.setLoop(THREE.LoopRepeat, Infinity);
  cuteRun.setLoop(THREE.LoopRepeat, Infinity);
  stumble.setLoop(THREE.LoopOnce, 1);
  stumble.clampWhenFinished = true;

  idle.play();
  inst = { root, mixer, idle, cuteRun, stumble, current: "idle" };
  pool.set(racer.id, inst);
  return inst;
}

function pickClip(racer: Racer, preferIdle: boolean): ClipName {
  if (racer.stumble > 0.04) return "stumble";
  if (preferIdle) return "idle";
  if (racer.speed > BASE_SPEED * 0.15) return "cuteRun";
  return "idle";
}

function crossfade(inst: CatInstance, next: ClipName) {
  if (inst.current === next) return;
  const map = {
    idle: inst.idle,
    cuteRun: inst.cuteRun,
    stumble: inst.stumble,
  } as const;
  const to = map[next];
  const from = map[inst.current];
  to.reset();
  to.setEffectiveWeight(1);
  to.play();
  from.crossFadeTo(to, next === "stumble" ? 0.08 : 0.15, false);
  inst.current = next;
}

/** Advance all active mixers once per frame (call before draw queue). */
export function syncCharacters(
  racers: Racer[],
  dt: number,
  preferIdle = false,
) {
  if (!ready || failed) return;
  for (const r of racers) {
    const inst = getOrCreateInstance(r);
    if (!inst) continue;

    tintCatMaterials(inst.root, r.color || "#ffffff");

    const next = pickClip(r, preferIdle);
    crossfade(inst, next);

    if (next === "cuteRun") {
      // Drive run phase from raceEngine bob (already scales with speed) so legs
      // match the old canvas walk timing instead of drifting vs velocity.
      inst.cuteRun.timeScale = 0;
      inst.idle.timeScale = 1;
      inst.stumble.timeScale = 1;
      inst.mixer.update(dt);
      const dur = inst.cuteRun.getClip()?.duration || 0.5;
      const phase = ((r.bob % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      // How many full leg cycles per one bob (2π) cycle. 1 = walk-like; >1 = run.
      const RUN_CYCLES_PER_BOB = 2.4;
      inst.cuteRun.time = (((phase * RUN_CYCLES_PER_BOB) / (Math.PI * 2)) * dur) % dur;
    } else {
      const speedRatio = Math.max(0.15, r.speed / BASE_SPEED);
      const timeScale =
        next === "idle"
          ? 0.9
          : THREE.MathUtils.clamp(speedRatio * 1.1, 0.85, 1.4);
      inst.idle.timeScale = timeScale;
      inst.cuteRun.timeScale = 1;
      inst.stumble.timeScale = timeScale;
      inst.mixer.update(dt);
    }

    if (next === "stumble" && !inst.stumble.isRunning()) {
      crossfade(inst, pickClip({ ...r, stumble: 0 }, preferIdle));
    }
  }
}

function drawShadow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  groundY: number,
  scale: number,
) {
  const h = Math.max(4, scale * 0.98);
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.24)";
  ctx.beginPath();
  ctx.ellipse(cx, groundY + h * 0.015, h * 0.34, h * 0.075, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawYouMarker(ctx: CanvasRenderingContext2D, cx: number, topY: number, h: number) {
  const fs = Math.max(12, Math.min(28, h * 0.38));
  const textY = topY - fs * 0.35;
  ctx.save();
  ctx.font = `900 ${fs}px "Baloo 2", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = Math.max(3, fs * 0.28);
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(0,0,0,0.72)";
  ctx.strokeText("YOU", cx, textY);
  ctx.fillStyle = "#ffffff";
  ctx.fillText("YOU", cx, textY);

  const aw = Math.max(5, fs * 0.28);
  const ah = Math.max(4, fs * 0.32);
  const ay = textY + fs * 0.55;
  ctx.beginPath();
  ctx.moveTo(cx, ay + ah);
  ctx.lineTo(cx - aw, ay);
  ctx.lineTo(cx + aw, ay);
  ctx.closePath();
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.lineWidth = Math.max(1.5, fs * 0.08);
  ctx.stroke();
  ctx.restore();
}

/**
 * Render one racer into the 2D context. Returns false if 3D path unavailable
 * (caller should fall back to procedural canvas drawCharacter).
 */
export function drawRacer3D(
  ctx: CanvasRenderingContext2D,
  cx: number,
  groundY: number,
  scale: number,
  racer: Racer,
  label: string | null,
): boolean {
  if (!ready || failed || !renderer || !scene || !camera) return false;
  const inst = getOrCreateInstance(racer);
  if (!inst) return false;

  const h = Math.max(4, scale * 0.98);
  drawShadow(ctx, cx, groundY, scale);

  for (const other of pool.values()) other.root.visible = false;
  inst.root.visible = true;
  inst.root.position.set(0, 0, 0);
  // GLTF Euler reload can turn authored Y=PI into X=-PI (cat flips under the
  // camera). Always re-apply rear-facing upright orientation + cute lean.
  const leanZ = Math.sin(racer.bob * 0.5) * 0.04;
  inst.root.rotation.set(0, Math.PI, leanZ);
  inst.root.updateMatrixWorld(true);

  // Frame full bounds (head + feet) with margin — previous close-up cropped both.
  const box = new THREE.Box3().setFromObject(inst.root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const span = Math.max(size.x, size.y, 0.01) * FRAME_MARGIN;
  const vFov = (CAMERA_FOV * Math.PI) / 180;
  const dist = span / 2 / Math.tan(vFov / 2);
  camera.fov = CAMERA_FOV;
  camera.near = 0.05;
  camera.far = Math.max(20, dist * 4);
  camera.position.set(center.x, center.y, center.z + dist);
  camera.lookAt(center.x, center.y, center.z);
  camera.updateProjectionMatrix();

  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(scene, camera);

  const drawH = h * 1.05;
  const drawW = drawH; // square RT
  const bounce = Math.abs(Math.sin(racer.bob)) * h * 0.02;
  const blit = ensureBlitTarget();
  let source: CanvasImageSource = renderer.domElement;
  if (blit && blitCanvas) {
    blit.clearRect(0, 0, RT_SIZE, RT_SIZE);
    blit.drawImage(renderer.domElement, 0, 0);
    source = blitCanvas;
  }
  // Plant feet using frame margin pad (avoid per-frame gl.readPixels — stalls GPU)
  const drawTop = groundY - drawH * (1 - BOTTOM_PAD_FRAC) + bounce * 0.08;
  ctx.drawImage(source, cx - drawW / 2, drawTop, drawW, drawH);

  if (label) {
    drawYouMarker(ctx, cx, drawTop - h * 0.08, h);
  }

  inst.root.visible = false;
  return true;
}

export function disposeCharacters() {
  for (const inst of pool.values()) {
    inst.mixer.stopAllAction();
    scene?.remove(inst.root);
    inst.root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose();
        const m = obj.material;
        if (Array.isArray(m)) m.forEach((x) => x.dispose());
        else m?.dispose();
      }
    });
  }
  pool.clear();
  renderer?.dispose();
  renderer = null;
  scene = null;
  camera = null;
  template = null;
  clips = [];
  blitCanvas = null;
  blitCtx = null;
  ready = false;
  failed = false;
  loading = null;
}

/** True once a template is ready (GLB or procedural). */
export function charactersReady() {
  return ready;
}
