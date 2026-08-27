/**
 * Procedural cute bipedal cat mascot (rear view) + Idle / CuteRun / Stumble clips.
 * Used as the default character and as the source for public/models/cat-racer.glb.
 */

import * as THREE from "three";

export const CAT_CLIP = {
  Idle: "Idle",
  CuteRun: "CuteRun",
  Stumble: "Stumble",
} as const;

/** World-unit height from feet to top of ears (used for camera framing). */
export const CAT_HEIGHT = 1.05;

function mat(color: string, opts?: { roughness?: number; metalness?: number; emissive?: number }) {
  const c = new THREE.Color(color);
  return new THREE.MeshStandardMaterial({
    color: c,
    roughness: opts?.roughness ?? 0.45,
    metalness: opts?.metalness ?? 0.02,
    emissive: c.clone().multiplyScalar(opts?.emissive ?? 0.22),
    emissiveIntensity: 1,
  });
}

function addMesh(
  parent: THREE.Object3D,
  geo: THREE.BufferGeometry,
  material: THREE.Material,
  name: string,
  pos: [number, number, number],
  scale?: [number, number, number],
) {
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = name;
  mesh.position.set(pos[0], pos[1], pos[2]);
  if (scale) mesh.scale.set(scale[0], scale[1], scale[2]);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  parent.add(mesh);
  return mesh;
}

/**
 * Build a named Object3D hierarchy suitable for AnimationClip tracks.
 * Facing +Z (toward camera = rear of cat facing viewer when camera looks at -Z from +Z).
 * Camera sits behind the racer looking forward down the track (+Z world in game is
 * "away"); here the cat faces -Z (away from camera), so the viewer sees its back.
 */
export function createCuteCatRoot(baseColor = "#ffffff"): THREE.Group {
  const root = new THREE.Group();
  root.name = "CatRoot";

  const bodyMat = mat(baseColor);
  const darkMat = mat(shade(baseColor, -40));
  const lightMat = mat(shade(baseColor, 35));
  const packMat = mat(shade(baseColor, -25));
  const packDark = mat(shade(baseColor, -50));
  const noseMat = mat("#ff8fab", { roughness: 0.4 });

  // Pivot at feet; hip sits above ground
  const hip = new THREE.Group();
  hip.name = "Hip";
  hip.position.set(0, 0.28, 0);
  root.add(hip);

  const torso = new THREE.Group();
  torso.name = "Torso";
  hip.add(torso);

  addMesh(torso, new THREE.SphereGeometry(0.22, 16, 12), bodyMat, "Body", [0, 0.12, 0], [1.05, 1.15, 0.95]);

  const backpack = new THREE.Group();
  backpack.name = "Backpack";
  backpack.position.set(0, 0.14, 0.16);
  torso.add(backpack);
  addMesh(backpack, new THREE.BoxGeometry(0.2, 0.22, 0.12), packDark, "PackShell", [0, 0, 0]);
  addMesh(backpack, new THREE.BoxGeometry(0.16, 0.18, 0.1), packMat, "PackFront", [0, 0, 0.02]);

  const head = new THREE.Group();
  head.name = "Head";
  head.position.set(0, 0.42, -0.02);
  torso.add(head);
  addMesh(head, new THREE.SphereGeometry(0.26, 18, 14), bodyMat, "HeadMesh", [0, 0.06, 0], [1.05, 1, 1]);
  addMesh(head, new THREE.SphereGeometry(0.04, 8, 6), darkMat, "Tuft", [0, 0.28, -0.02], [1.2, 0.7, 0.8]);

  // Big soft rounded ears — adorable / funny, clearly on top of the head (rear-readable)
  const earL = new THREE.Group();
  earL.name = "EarL";
  earL.position.set(-0.2, 0.28, -0.02);
  earL.rotation.z = 0.42;
  earL.rotation.x = -0.08;
  head.add(earL);
  addMesh(
    earL,
    new THREE.SphereGeometry(0.1, 14, 12),
    darkMat,
    "EarLMesh",
    [0, 0.1, 0],
    [0.9, 1.45, 0.65],
  );
  addMesh(
    earL,
    new THREE.SphereGeometry(0.055, 12, 10),
    lightMat,
    "EarLIn",
    [0, 0.09, 0.035],
    [0.85, 1.25, 0.45],
  );

  const earR = new THREE.Group();
  earR.name = "EarR";
  earR.position.set(0.2, 0.28, -0.02);
  earR.rotation.z = -0.42;
  earR.rotation.x = -0.08;
  head.add(earR);
  addMesh(
    earR,
    new THREE.SphereGeometry(0.1, 14, 12),
    darkMat,
    "EarRMesh",
    [0, 0.1, 0],
    [0.9, 1.45, 0.65],
  );
  addMesh(
    earR,
    new THREE.SphereGeometry(0.055, 12, 10),
    lightMat,
    "EarRIn",
    [0, 0.09, 0.035],
    [0.85, 1.25, 0.45],
  );

  // Tiny rear "cheek" blush for cuteness when large on screen
  addMesh(head, new THREE.SphereGeometry(0.05, 8, 6), noseMat, "BlushL", [-0.18, 0.0, 0.12], [1, 0.7, 0.5]);
  addMesh(head, new THREE.SphereGeometry(0.05, 8, 6), noseMat, "BlushR", [0.18, 0.0, 0.12], [1, 0.7, 0.5]);

  const armL = new THREE.Group();
  armL.name = "ArmL";
  armL.position.set(-0.24, 0.2, 0.02);
  torso.add(armL);
  addMesh(armL, new THREE.CapsuleGeometry(0.055, 0.12, 4, 8), darkMat, "ArmLMesh", [0, -0.1, 0]);

  const armR = new THREE.Group();
  armR.name = "ArmR";
  armR.position.set(0.24, 0.2, 0.02);
  torso.add(armR);
  addMesh(armR, new THREE.CapsuleGeometry(0.055, 0.12, 4, 8), darkMat, "ArmRMesh", [0, -0.1, 0]);

  const legL = new THREE.Group();
  legL.name = "LegL";
  legL.position.set(-0.09, 0, 0);
  hip.add(legL);
  addMesh(legL, new THREE.CapsuleGeometry(0.065, 0.14, 4, 8), darkMat, "LegLMesh", [0, -0.16, 0]);
  addMesh(legL, new THREE.SphereGeometry(0.07, 10, 8), darkMat, "FootL", [0, -0.28, 0.02], [1.25, 0.7, 1.1]);

  const legR = new THREE.Group();
  legR.name = "LegR";
  legR.position.set(0.09, 0, 0);
  hip.add(legR);
  addMesh(legR, new THREE.CapsuleGeometry(0.065, 0.14, 4, 8), darkMat, "LegRMesh", [0, -0.16, 0]);
  addMesh(legR, new THREE.SphereGeometry(0.07, 10, 8), darkMat, "FootR", [0, -0.28, 0.02], [1.25, 0.7, 1.1]);

  const tail = new THREE.Group();
  tail.name = "Tail";
  tail.position.set(0, 0.08, 0.18);
  hip.add(tail);
  addMesh(tail, new THREE.CapsuleGeometry(0.045, 0.2, 4, 8), lightMat, "TailMesh", [0, 0.08, 0.08]);
  // Base tilt lives in Idle/CuteRun quaternion tracks (exportable).

  // Face camera from behind: cat looks down -Z (forward on track)
  root.rotation.y = Math.PI;

  return root;
}

function shade(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1] as string, 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amount));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amount));
  const b = Math.max(0, Math.min(255, (n & 255) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

function quatAxisAngle(axis: THREE.Vector3, angle: number): THREE.Quaternion {
  return new THREE.Quaternion().setFromAxisAngle(axis, angle);
}

function quatTrack(name: string, times: number[], angles: number[], axis: THREE.Vector3) {
  const values: number[] = [];
  for (const a of angles) {
    const q = quatAxisAngle(axis, a);
    values.push(q.x, q.y, q.z, q.w);
  }
  return new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times, values);
}

function posTrack(name: string, times: number[], positions: number[]) {
  return new THREE.VectorKeyframeTrack(`${name}.position`, times, positions);
}

function quatEuler(x: number, y: number, z: number): THREE.Quaternion {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, "XYZ"));
}

function quatEulerTrack(name: string, times: number[], eulers: Array<[number, number, number]>) {
  const values: number[] = [];
  for (const [x, y, z] of eulers) {
    const q = quatEuler(x, y, z);
    values.push(q.x, q.y, q.z, q.w);
  }
  return new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times, values);
}

/** Create Idle, CuteRun, Stumble clips targeting named nodes under CatRoot. */
export function createCuteCatClips(): THREE.AnimationClip[] {
  const X = new THREE.Vector3(1, 0, 0);
  const Z = new THREE.Vector3(0, 0, 1);

  // ---- Idle: soft sway + ear/tail twitch ----
  const idleT = [0, 0.5, 1.0, 1.5, 2.0];
  const idle = new THREE.AnimationClip(CAT_CLIP.Idle, 2.0, [
    posTrack("Hip", idleT, [
      0, 0.28, 0, 0, 0.295, 0, 0, 0.28, 0, 0, 0.295, 0, 0, 0.28, 0,
    ]),
    quatEulerTrack("Tail", idleT, [
      [0.55, 0, 0],
      [0.75, 0.12, 0],
      [0.55, 0, 0],
      [0.35, -0.12, 0],
      [0.55, 0, 0],
    ]),
    quatEulerTrack("EarL", idleT, [
      [0, 0, 0.42],
      [-0.08, 0, 0.5],
      [0, 0, 0.42],
      [0.06, 0, 0.34],
      [0, 0, 0.42],
    ]),
    quatEulerTrack("EarR", idleT, [
      [0, 0, -0.42],
      [0.08, 0, -0.5],
      [0, 0, -0.42],
      [-0.06, 0, -0.34],
      [0, 0, -0.42],
    ]),
    quatTrack("Backpack", idleT, [0, 0.04, 0, -0.03, 0], X),
    quatTrack("ArmL", idleT, [0.15, 0.2, 0.15, 0.1, 0.15], X),
    quatTrack("ArmR", idleT, [0.15, 0.1, 0.15, 0.2, 0.15], X),
  ]);

  // ---- CuteRun: clear opposite-phase trot (phase-locked to racer.bob) ----
  const runT = [0, 0.125, 0.25, 0.375, 0.5];
  const run = new THREE.AnimationClip(CAT_CLIP.CuteRun, 0.5, [
    posTrack("Hip", runT, [
      0, 0.28, 0, 0, 0.33, 0, 0, 0.28, 0, 0, 0.33, 0, 0, 0.28, 0,
    ]),
    quatTrack("Hip", runT, [0, 0.06, 0, -0.06, 0], Z),
    quatTrack("Torso", runT, [-0.1, -0.06, -0.1, -0.06, -0.1], X),
    quatTrack("LegL", runT, [0.75, 0.15, -0.7, 0.1, 0.75], X),
    quatTrack("LegR", runT, [-0.7, 0.1, 0.75, 0.15, -0.7], X),
    quatTrack("ArmL", runT, [-0.55, 0.35, 0.6, -0.25, -0.55], X),
    quatTrack("ArmR", runT, [0.6, -0.25, -0.55, 0.35, 0.6], X),
    quatEulerTrack("Tail", runT, [
      [0.5, -0.45, 0],
      [0.85, 0.45, 0],
      [0.5, -0.45, 0],
      [0.85, 0.45, 0],
      [0.5, -0.45, 0],
    ]),
    quatEulerTrack("EarL", runT, [
      [0, 0, 0.42],
      [-0.15, 0, 0.55],
      [0, 0, 0.42],
      [0.12, 0, 0.3],
      [0, 0, 0.42],
    ]),
    quatEulerTrack("EarR", runT, [
      [0, 0, -0.42],
      [0.15, 0, -0.55],
      [0, 0, -0.42],
      [-0.12, 0, -0.3],
      [0, 0, -0.42],
    ]),
    quatTrack("Head", runT, [0, -0.05, 0, 0.05, 0], Z),
    quatTrack("Backpack", runT, [0.04, -0.1, 0.04, 0.08, 0.04], X),
  ]);

  // ---- Stumble: brief wobble ----
  const stT = [0, 0.12, 0.24, 0.4, 0.55];
  const stumble = new THREE.AnimationClip(CAT_CLIP.Stumble, 0.55, [
    posTrack("Hip", stT, [
      0, 0.28, 0, 0.04, 0.22, 0, -0.05, 0.32, 0, 0.02, 0.26, 0, 0, 0.28, 0,
    ]),
    quatTrack("Hip", stT, [0, 0.35, -0.4, 0.15, 0], Z),
    quatTrack("Torso", stT, [-0.1, 0.25, -0.3, 0.1, -0.1], X),
    quatTrack("Head", stT, [0, 0.3, -0.35, 0.1, 0], Z),
    quatTrack("LegL", stT, [0.2, 0.5, 0.1, -0.2, 0.2], X),
    quatTrack("LegR", stT, [-0.1, -0.4, 0.3, 0.1, -0.1], X),
    quatTrack("ArmL", stT, [0.2, -0.6, 0.4, -0.2, 0.2], X),
    quatTrack("ArmR", stT, [0.2, 0.5, -0.5, 0.2, 0.2], X),
    quatTrack("Tail", stT, [0.5, 1.1, 0.2, 0.7, 0.5], X),
  ]);

  return [idle, run, stumble];
}

export function tintCatMaterials(root: THREE.Object3D, hex: string) {
  const body = shade(hex, 0);
  const dark = shade(hex, -40);
  const light = shade(hex, 35);
  const pack = shade(hex, -25);
  const packDark = shade(hex, -50);

  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const m = obj.material;
    if (!(m instanceof THREE.MeshStandardMaterial)) return;
    const n = obj.name;
    if (n.startsWith("Blush") || n === "Tuft") return;

    let next = body;
    if (n.startsWith("PackShell")) next = packDark;
    else if (n.startsWith("Pack")) next = pack;
    else if (
      n.startsWith("Ear") ||
      n.startsWith("Arm") ||
      n.startsWith("Leg") ||
      n.startsWith("Foot")
    ) {
      next = n.includes("In") ? light : dark;
    } else if (n.startsWith("Tail")) next = light;

    m.color.set(next);
    // Keep a readable glow so cats don't camouflage into asphalt
    m.emissive.set(next);
    m.emissiveIntensity = 0.28;
    m.roughness = 0.45;
    m.metalness = 0.02;
  });
}

export function cloneCuteCat(template: THREE.Object3D): THREE.Group {
  const clone = template.clone(true) as THREE.Group;
  clone.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.material) {
      if (Array.isArray(obj.material)) {
        obj.material = obj.material.map((m) => m.clone());
      } else {
        obj.material = obj.material.clone();
      }
    }
  });
  return clone;
}
