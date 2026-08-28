/**
 * Canvas pseudo-3D renderer for the KruMath race.
 * Projects road segments outrun-style and draws characters as sprites.
 */

import {
  ROAD_WIDTH,
  SEG_LENGTH,
  LANES,
  GATE_DRAW_SEGMENTS,
  type AnswerGate,
  type RaceState,
  type Racer,
  type RoadsideKind,
  type Segment,
} from "./raceEngine";
import { drawRacer3D, syncCharacters } from "./character3d";

const DRAW_DISTANCE = GATE_DRAW_SEGMENTS;
// Chase-cam height (OutRun Y). Not a look-down pitch; keep near original.
const CAMERA_HEIGHT = 1150;
const FIELD_OF_VIEW = 100;
const CAMERA_DEPTH = 1 / Math.tan(((FIELD_OF_VIEW / 2) * Math.PI) / 180);
/** How far behind the player the camera sits, in segments. Larger = more street ahead. */
const CAMERA_BEHIND_SEGS = 5.2;
/** Screen Y of player feet (0–1). Lower on screen = more road visible above the character. */
const PLAYER_SCREEN_Y = 0.82;

type Proj = { x: number; y: number; w: number; scale: number };

type LayoutScale = {
  aspect: number;
  playerFrac: number;
  playerScreenY: number;
  gateLaneFill: number;
  gateHeightCap: number;
  gateMinFont: number;
};

/**
 * Aspect-aware play layout. Portrait phones shrink the player and enlarge
 * answer gates; wide/desktop keeps the original constants.
 */
function layoutScale(width: number, height: number): LayoutScale {
  const aspect = height > 0 ? width / height : 1;
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  if (aspect >= 0.85) {
    return {
      aspect,
      playerFrac: 0.16,
      playerScreenY: PLAYER_SCREEN_Y,
      gateLaneFill: 0.52,
      gateHeightCap: 0.17,
      gateMinFont: 10,
    };
  }

  if (aspect < 0.65) {
    return {
      aspect,
      playerFrac: 0.1,
      playerScreenY: PLAYER_SCREEN_Y,
      // Near-full lane so mid-approach panels stay readable without overlapping
      gateLaneFill: 0.82,
      gateHeightCap: 0.22,
      gateMinFont: 16,
    };
  }

  const t = (aspect - 0.65) / (0.85 - 0.65);
  return {
    aspect,
    playerFrac: lerp(0.1, 0.16, t),
    playerScreenY: PLAYER_SCREEN_Y,
    gateLaneFill: lerp(0.82, 0.52, t),
    gateHeightCap: lerp(0.22, 0.17, t),
    gateMinFont: Math.round(lerp(16, 10, t)),
  };
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

const COLORS = {
  grassLight: "#4caf5f",
  grassDark: "#348a45",
  shoulderLight: "#6b9a4e",
  shoulderDark: "#557a3d",
  roadLight: "#4b5350",
  roadDark: "#414946",
  rumbleLight: "#f2ead2",
  rumbleDark: "#d95b45",
  lane: "#f5edc9",
  roadsideDark: "#2a6e3a",
  roadsideLight: "#45a054",
};

const GRASS_PATCHES = ["#4caf5f", "#3d9a4e", "#58b86a", "#2f8143", "#6aab52"];

function segNoise(i: number, salt = 0): number {
  const n = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function project(
  worldY: number,
  worldZ: number,
  cameraX: number,
  cameraY: number,
  cameraZ: number,
  width: number,
  height: number,
): Proj {
  const dz = Math.max(worldZ - cameraZ, 1);
  const scale = CAMERA_DEPTH / dz;
  // Snap to whole CSS pixels so high-contrast rumble/lane edges don't
  // antialias-shimmer as the camera scrolls (subpixel Y was the shake).
  return {
    x: Math.round(width / 2 + (scale * -cameraX * width) / 2),
    y: Math.round(height / 2 - (scale * (worldY - cameraY) * height) / 2),
    w: Math.max(1, Math.round((scale * ROAD_WIDTH * width) / 2)),
    scale,
  };
}

function polygon(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  x4: number,
  y4: number,
  color: string,
) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.lineTo(x4, y4);
  ctx.closePath();
  ctx.fill();
}
function shadeHex(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1] as string, 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amount));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amount));
  const b = Math.max(0, Math.min(255, (n & 255) + amount));
  return `rgb(${r},${g},${b})`;
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
 * Cute mascot racer — rear view.
 * Draw order (back → front): legs → tail → body → arms → backpack → head → ears/tuft.
 */
function drawLimb(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  thickness: number,
  color: string,
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, thickness);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.restore();
}

function drawCharacter(
  ctx: CanvasRenderingContext2D,
  cx: number,
  groundY: number,
  scale: number,
  racer: Racer,
  label: string | null,
) {
  // Soft floor only — hard 12px made distant rivals look oversized vs the road
  const h = Math.max(4, scale * 0.98);
  const bodyW = h * 0.68;
  const bodyH = h * 0.47;

  const phase = racer.bob;
  const bounce = Math.abs(Math.sin(phase)) * h * 0.075;
  const legPhase = Math.sin(phase);
  const armPhase = Math.sin(phase + Math.PI);
  const sway = Math.sin(phase * 0.5) * h * 0.018;
  const squash = 1 + Math.sin(phase * 2) * 0.025;

  // Keep racer color (including white player); shade for depth
  const baseColor = racer.color || "#7b68ee";
  const darkColor = shadeHex(baseColor, -45);
  const darkerColor = shadeHex(baseColor, -65);
  const lightColor = shadeHex(baseColor, 45);
  const backpackColor = shadeHex(baseColor, -30);
  const backpackDark = shadeHex(baseColor, -55);
  const limbColor = shadeHex(baseColor, -55);

  const baseY = groundY - bounce;

  // Shadow stays on the road
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.24)";
  ctx.beginPath();
  ctx.ellipse(cx + sway, groundY + h * 0.015, bodyW * 0.52, h * 0.075, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(cx + sway, baseY);
  ctx.scale(1 / squash, squash);

  const headTop = -h * 0.98;
  const headBottom = -h * 0.43;
  const bodyTop = -h * 0.58;
  const bodyBottom = -h * 0.08;
  const headW = bodyW * 1.28;

  // ---- LEGS (furthest back) ----
  const legThickness = Math.max(2, h * 0.115);
  const legY = -h * 0.02;
  const leftLegX = -bodyW * 0.2;
  const rightLegX = bodyW * 0.2;
  const leftFootX = leftLegX + legPhase * h * 0.085;
  const rightFootX = rightLegX - legPhase * h * 0.085;
  const leftFootY = legY + Math.max(0, -legPhase) * h * 0.035;
  const rightFootY = legY + Math.max(0, legPhase) * h * 0.035;

  drawLimb(ctx, leftLegX, bodyBottom - h * 0.02, leftFootX, leftFootY, legThickness, darkerColor);
  drawLimb(
    ctx,
    rightLegX,
    bodyBottom - h * 0.02,
    rightFootX,
    rightFootY,
    legThickness,
    darkerColor,
  );

  const footRadius = Math.max(2, h * 0.065);
  ctx.fillStyle = limbColor;
  ctx.beginPath();
  ctx.ellipse(leftFootX, leftFootY, footRadius * 1.35, footRadius * 0.72, -0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(rightFootX, rightFootY, footRadius * 1.35, footRadius * 0.72, 0.12, 0, Math.PI * 2);
  ctx.fill();

  // ---- TAIL (behind body) ----
  const tailX = Math.sin(phase * 1.3) * h * 0.025;
  const tailY = bodyBottom - h * 0.07;
  const tailSize = Math.max(2, h * 0.075);
  ctx.fillStyle = lightColor;
  ctx.beginPath();
  ctx.arc(tailX, tailY, tailSize, 0, Math.PI * 2);
  ctx.fill();

  // ---- BODY ----
  const bodyGradient = ctx.createLinearGradient(0, bodyTop, 0, bodyBottom);
  bodyGradient.addColorStop(0, lightColor);
  bodyGradient.addColorStop(0.42, baseColor);
  bodyGradient.addColorStop(1, darkColor);
  ctx.fillStyle = bodyGradient;
  ctx.beginPath();
  ctx.moveTo(0, bodyTop);
  ctx.bezierCurveTo(
    bodyW * 0.4,
    bodyTop,
    bodyW * 0.52,
    bodyTop + h * 0.12,
    bodyW * 0.48,
    bodyTop + h * 0.28,
  );
  ctx.bezierCurveTo(
    bodyW * 0.47,
    bodyTop + h * 0.4,
    bodyW * 0.38,
    bodyBottom,
    bodyW * 0.18,
    bodyBottom,
  );
  ctx.quadraticCurveTo(0, bodyBottom + h * 0.045, -bodyW * 0.18, bodyBottom);
  ctx.bezierCurveTo(
    -bodyW * 0.38,
    bodyBottom,
    -bodyW * 0.47,
    bodyTop + h * 0.4,
    -bodyW * 0.48,
    bodyTop + h * 0.28,
  );
  ctx.bezierCurveTo(-bodyW * 0.52, bodyTop + h * 0.12, -bodyW * 0.4, bodyTop, 0, bodyTop);
  ctx.closePath();
  ctx.fill();

  // ---- ARMS (beside body, under backpack) ----
  const shoulderY = bodyTop + h * 0.23;
  const armThickness = Math.max(2, h * 0.085);
  const leftArmX = -bodyW * 0.47 - armPhase * h * 0.055;
  const rightArmX = bodyW * 0.47 + armPhase * h * 0.055;
  const leftArmY = shoulderY + h * 0.11 + armPhase * h * 0.055;
  const rightArmY = shoulderY + h * 0.11 - armPhase * h * 0.055;

  drawLimb(ctx, -bodyW * 0.42, shoulderY, leftArmX, leftArmY, armThickness, limbColor);
  drawLimb(ctx, bodyW * 0.42, shoulderY, rightArmX, rightArmY, armThickness, limbColor);

  const handRadius = Math.max(1.5, h * 0.045);
  ctx.fillStyle = limbColor;
  ctx.beginPath();
  ctx.arc(leftArmX, leftArmY, handRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(rightArmX, rightArmY, handRadius, 0, Math.PI * 2);
  ctx.fill();

  // ---- BACKPACK (must be AFTER body — camera is behind the racer) ----
  const backpackW = bodyW * 0.52;
  const backpackH = bodyH * 0.62;
  const backpackY = bodyTop + h * 0.1;

  ctx.fillStyle = backpackDark;
  ctx.beginPath();
  ctx.roundRect(-backpackW / 2, backpackY, backpackW, backpackH, h * 0.1);
  ctx.fill();

  ctx.fillStyle = backpackColor;
  ctx.beginPath();
  ctx.roundRect(
    -backpackW * 0.43,
    backpackY + h * 0.025,
    backpackW * 0.86,
    backpackH * 0.88,
    h * 0.075,
  );
  ctx.fill();

  if (h > 18) {
    ctx.fillStyle = shadeHex(backpackColor, -20);
    ctx.beginPath();
    ctx.roundRect(
      -backpackW * 0.25,
      backpackY + backpackH * 0.46,
      backpackW * 0.5,
      backpackH * 0.28,
      h * 0.045,
    );
    ctx.fill();
  }

  if (h > 16) {
    ctx.strokeStyle = shadeHex(baseColor, -60);
    ctx.lineWidth = Math.max(1.5, h * 0.035);
    ctx.beginPath();
    ctx.moveTo(-bodyW * 0.31, bodyTop + h * 0.03);
    ctx.lineTo(-bodyW * 0.24, bodyBottom - h * 0.03);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(bodyW * 0.31, bodyTop + h * 0.03);
    ctx.lineTo(bodyW * 0.24, bodyBottom - h * 0.03);
    ctx.stroke();
  }

  // ---- EARS (behind / under head rim so they peek from sides) ----
  const earW = h * 0.13;
  const earH = h * 0.16;
  const earY = headTop + h * 0.15;
  ctx.fillStyle = darkColor;
  ctx.beginPath();
  ctx.ellipse(-headW * 0.43, earY, earW, earH, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(headW * 0.43, earY, earW, earH, 0.2, 0, Math.PI * 2);
  ctx.fill();

  if (h > 20) {
    ctx.fillStyle = shadeHex(baseColor, 15);
    ctx.beginPath();
    ctx.ellipse(-headW * 0.43, earY, earW * 0.48, earH * 0.52, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(headW * 0.43, earY, earW * 0.48, earH * 0.52, 0.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---- HEAD ----
  const headGradient = ctx.createLinearGradient(0, headTop, 0, headBottom);
  headGradient.addColorStop(0, lightColor);
  headGradient.addColorStop(0.55, baseColor);
  headGradient.addColorStop(1, darkColor);
  ctx.fillStyle = headGradient;
  ctx.beginPath();
  ctx.moveTo(0, headTop);
  ctx.bezierCurveTo(
    headW * 0.43,
    headTop,
    headW * 0.53,
    headTop + h * 0.12,
    headW * 0.5,
    headTop + h * 0.29,
  );
  ctx.bezierCurveTo(
    headW * 0.48,
    headBottom,
    headW * 0.3,
    headBottom + h * 0.04,
    0,
    headBottom + h * 0.02,
  );
  ctx.bezierCurveTo(
    -headW * 0.3,
    headBottom + h * 0.04,
    -headW * 0.48,
    headBottom,
    -headW * 0.5,
    headTop + h * 0.29,
  );
  ctx.bezierCurveTo(-headW * 0.53, headTop + h * 0.12, -headW * 0.43, headTop, 0, headTop);
  ctx.closePath();
  ctx.fill();

  // ---- HAIR TUFT ----
  const tuftBounce = Math.sin(phase * 1.5) * h * 0.025;
  ctx.fillStyle = darkerColor;
  ctx.beginPath();
  ctx.moveTo(-h * 0.06, headTop + h * 0.015);
  ctx.quadraticCurveTo(
    -h * 0.12,
    headTop - h * 0.07 + tuftBounce,
    0,
    headTop - h * 0.03 + tuftBounce,
  );
  ctx.quadraticCurveTo(h * 0.12, headTop - h * 0.07 + tuftBounce, h * 0.06, headTop + h * 0.015);
  ctx.closePath();
  ctx.fill();

  // ---- SPECULAR ----
  if (h > 16) {
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.beginPath();
    ctx.ellipse(-headW * 0.18, headTop + h * 0.18, headW * 0.14, h * 0.075, -0.35, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();

  if (label) {
    drawYouMarker(ctx, cx + sway, groundY - bounce - h * 1.02, h);
  }
}

/** Prefer Three.js GLB cat; fall back to procedural canvas bean. */
function drawRacer(
  ctx: CanvasRenderingContext2D,
  cx: number,
  groundY: number,
  scale: number,
  racer: Racer,
  label: string | null,
) {
  const ok3d = drawRacer3D(ctx, cx, groundY, scale, racer, label);
  if (!ok3d) {
    drawCharacter(ctx, cx, groundY, scale, racer, label);
  }
}

const LANE_RGB = ["58, 134, 255", "255, 224, 102", "46, 196, 182", "255, 92, 138"];
const LANE_TINT = [
  "rgba(58,134,255,0.24)",
  "rgba(255,224,102,0.24)",
  "rgba(46,196,182,0.24)",
  "rgba(255,92,138,0.24)",
];

function drawLanePlate(
  ctx: CanvasRenderingContext2D,
  cx: number,
  groundY: number,
  panelW: number,
  lane: number,
  alpha: number,
) {
  const w = Math.max(4, panelW * 0.48);
  const tint = LANE_RGB[lane] ?? LANE_RGB[0];
  ctx.save();
  ctx.globalAlpha = alpha * 0.6;
  ctx.fillStyle = `rgba(${tint},0.95)`;
  ctx.beginPath();
  ctx.ellipse(cx, groundY + panelW * 0.04, w, Math.max(3, panelW * 0.1), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawAnswerGate(
  ctx: CanvasRenderingContext2D,
  cx: number,
  groundY: number,
  targetWidth: number,
  gate: AnswerGate,
  t: number,
  minFont = 10,
) {
  const fadeMax = gate.state === "hit-correct" || gate.state === "hit-wrong" ? 0.5 : 0.4;
  const alpha = gate.state === "idle" ? 1 : Math.max(0, Math.min(1, gate.fade / fadeMax));
  // targetWidth = projected panel width in pixels (grows as 1/dz with the road)
  const w = Math.max(4, targetWidth);
  const h = w * 1.05;
  const shake = gate.state === "hit-wrong" ? Math.sin(t * 42) * h * 0.07 : 0;
  const pop = gate.state === "hit-correct" ? (1 - alpha) * h * 0.18 : 0;
  const x = cx + shake;
  const y = groundY - pop;
  const rim = LANE_RGB[gate.lane] ?? LANE_RGB[0];

  ctx.save();
  ctx.globalAlpha = alpha;

  drawLanePlate(ctx, x, groundY, w, gate.lane, alpha);

  const panelTop = y - h * 1.05;
  const panelH = h * 0.98;
  const panelW = w;
  const panelX = x - panelW / 2;
  const radius = Math.min(22, h * 0.18);

  let fill = "#f7f3e8";
  if (gate.state === "hit-correct") fill = "#7dff9a";
  else if (gate.state === "hit-wrong") fill = "#ff6b6b";
  else if (gate.state === "fading") fill = "#c5c0b4";

  // soft ground contact (not a hard outline)
  ctx.beginPath();
  ctx.ellipse(x, groundY + h * 0.02, w * 0.42, Math.max(2, h * 0.06), 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.fill();

  if (gate.state === "idle") {
    // lane-colored shell via nested fills — no stroke (avoids dark hairline outlines)
    ctx.beginPath();
    ctx.roundRect(panelX, panelTop, panelW, panelH, radius);
    ctx.fillStyle = `rgba(${rim},0.95)`;
    ctx.fill();
    // Hard 2px inset collapses cream fill on first-appear (~5px) panels
    const inset = panelH < 14 ? Math.max(0.35, h * 0.08) : Math.max(2, h * 0.07);
    const innerW = panelW - inset * 2;
    const innerH = panelH - inset * 2;
    if (innerW > 0.5 && innerH > 0.5) {
      ctx.beginPath();
      ctx.roundRect(
        panelX + inset,
        panelTop + inset,
        innerW,
        innerH,
        Math.max(0.5, radius - inset * 0.5),
      );
      ctx.fillStyle = fill;
      ctx.fill();
    }
  } else {
    ctx.beginPath();
    ctx.roundRect(panelX, panelTop, panelW, panelH, radius);
    ctx.fillStyle = fill;
    ctx.fill();
  }

  const label =
    gate.state === "hit-correct" ? "✓" : gate.state === "hit-wrong" ? "✕" : String(gate.value);
  const ratioFs = h * (label.length > 2 ? 0.42 : 0.52);
  // Prefer readable floor on mobile, but never let glyphs exceed the panel
  // (distant gates are only ~4–8px tall; an uncapped 16px floor popped out).
  const preferredFs = Math.max(minFont, ratioFs);
  const maxFs = panelH * 0.68;
  const fs = Math.max(2, Math.min(preferredFs, maxFs));
  ctx.font = `900 ${fs}px "Baloo 2", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // Stroke on tiny first-appear panels makes digits look like they pop out of the shape
  if (panelH >= 12) {
    ctx.lineWidth = Math.max(1, fs * 0.18);
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.strokeText(label, x, panelTop + panelH * 0.52);
  }
  ctx.fillStyle = gate.state === "hit-wrong" ? "#fff5f5" : "#1b1b1b";
  ctx.fillText(label, x, panelTop + panelH * 0.52);

  ctx.restore();
}

function drawBurst(
  ctx: CanvasRenderingContext2D,
  cx: number,
  groundY: number,
  scale: number,
  life: number,
  good: boolean,
) {
  const p = 1 - life;
  ctx.save();
  ctx.globalAlpha = Math.max(0, life);
  ctx.strokeStyle = good ? "#ffe066" : "#ff7a7a";
  ctx.lineWidth = Math.max(2, scale * 0.06 * (1 - p));
  ctx.beginPath();
  ctx.arc(cx, groundY - scale * 0.55, scale * (0.25 + p * 0.7), 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = good ? "#ffe066" : "#ff7a7a";
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + p * 1.2;
    const r = scale * (0.2 + p * 0.85);
    ctx.beginPath();
    ctx.arc(
      cx + Math.cos(a) * r,
      groundY - scale * 0.55 + Math.sin(a) * r * 0.7,
      scale * 0.06 * life,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.restore();
}

function drawItem(
  ctx: CanvasRenderingContext2D,
  cx: number,
  groundY: number,
  scale: number,
  kind: string,
  t: number,
) {
  // Soft floor only — hard 10px made far pickups look huge vs the road
  const h = Math.max(2, scale);
  const good = kind === "+1" || kind === "+5" || kind === "x2";
  const y = groundY - h * 0.9 - Math.sin(t * 3) * h * 0.1;
  const fs = Math.max(2, h * 0.7);
  ctx.save();
  ctx.font = `900 ${fs}px "Baloo 2", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (fs >= 6) {
    ctx.lineWidth = fs * 0.24;
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.strokeText(kind, cx, y);
  }
  ctx.fillStyle = good ? "#ffe066" : "#ff6b6b";
  ctx.fillText(kind, cx, y);
  ctx.restore();
}

const BUNTING = ["#e85d5d", "#ffd166", "#4ea8de", "#45c9a5", "#f29e4c", "#f7f3e3"];

const FINISH = {
  dark: "#25211d",
  metal: "#d8d0c2",
  metalDark: "#756d61",
  cream: "#f7f3e3",
  red: "#d94b43",
  gold: "#ffd166",
  green: "#2f8f4e",
  glow: "rgba(255, 209, 102, 0.18)",
};

/** Stylized race finish gantry with banner, lights and bunting. */
function drawFinishGate(
  ctx: CanvasRenderingContext2D,
  roadCx: number,
  groundY: number,
  roadHalfW: number,
  t: number,
  height: number,
  aspect: number,
) {
  // Follow road width with soft mins only — hard floors (8 / 32 / 10) made the
  // distant gantry look huge then relatively shrink as you approached.
  // Soft near-camera cap keeps the gate on-screen on short portrait displays.
  const maxW = height * (aspect < 0.85 ? 0.42 : 0.48);
  const w = Math.max(2, Math.min(roadHalfW, maxW));

  const postX = w * 1.08;
  const left = roadCx - postX;
  const right = roadCx + postX;

  const postW = Math.max(1, w * 0.065);
  const postH = Math.max(3, w * 1.22);

  const topY = groundY - postH;

  // Banner scales with width; soft floor only for tiny distant frames
  const bannerH = Math.max(2, w * (aspect < 0.85 ? 0.42 : 0.3));
  const bannerTop = topY + postH * 0.07;

  const barH = Math.max(1, w * 0.045);

  const pulse = 0.75 + Math.sin(t * 4.0) * 0.25;
  const sway = Math.sin(t * 2.2) * w * 0.014;

  ctx.save();

  // 1. Finish-line glow
  const glow = ctx.createRadialGradient(
    roadCx,
    groundY - postH * 0.45,
    0,
    roadCx,
    groundY - postH * 0.45,
    w * 1.7,
  );
  glow.addColorStop(0, FINISH.glow);
  glow.addColorStop(1, "rgba(255,209,102,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(roadCx - w * 1.7, groundY - postH * 1.2, w * 3.4, postH * 1.5);

  // 2. Ground shadows
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(left, groundY + 2, postW * 1.7, postW * 0.6, 0, 0, Math.PI * 2);
  ctx.ellipse(right, groundY + 2, postW * 1.7, postW * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();

  // 3. Post bases
  const baseW = postW * 1.8;
  const baseH = Math.max(3, postW * 0.7);
  ctx.fillStyle = FINISH.dark;
  ctx.fillRect(left - baseW / 2, groundY - baseH, baseW, baseH);
  ctx.fillRect(right - baseW / 2, groundY - baseH, baseW, baseH);

  // 4. Main posts
  const drawPost = (x: number) => {
    const g = ctx.createLinearGradient(x - postW / 2, topY, x + postW / 2, groundY);
    g.addColorStop(0, "#f5efe4");
    g.addColorStop(0.45, FINISH.metal);
    g.addColorStop(1, FINISH.metalDark);
    ctx.fillStyle = g;
    ctx.fillRect(x - postW / 2, topY, postW, postH);

    ctx.fillStyle = FINISH.red;
    ctx.fillRect(x - postW / 2, topY + postH * 0.18, postW, Math.max(2, postW * 0.28));

    ctx.fillStyle = FINISH.green;
    ctx.fillRect(
      x - postW / 2,
      topY + postH * 0.18 + Math.max(2, postW * 0.28),
      postW,
      Math.max(1.5, postW * 0.14),
    );

    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(x - postW * 0.34, topY, Math.max(1, postW * 0.16), postH);
  };

  drawPost(left);
  drawPost(right);

  // 5. Top crossbar
  ctx.fillStyle = FINISH.dark;
  ctx.fillRect(left - postW / 2, topY, right - left + postW, barH);
  ctx.fillStyle = FINISH.gold;
  ctx.fillRect(
    left - postW / 2,
    topY + barH - Math.max(1, w * 0.012),
    right - left + postW,
    Math.max(1, w * 0.012),
  );

  // 6. Banner
  const bannerLeft = left + postW * 0.2;
  const bannerRight = right - postW * 0.2;
  const bannerW = bannerRight - bannerLeft;

  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(bannerLeft + w * 0.012, bannerTop + w * 0.018, bannerW, bannerH);

  ctx.fillStyle = FINISH.dark;
  ctx.fillRect(bannerLeft, bannerTop, bannerW, bannerH);

  ctx.fillStyle = FINISH.red;
  ctx.fillRect(bannerLeft, bannerTop, bannerW, bannerH * 0.16);

  ctx.fillStyle = FINISH.cream;
  ctx.fillRect(bannerLeft, bannerTop + bannerH * 0.84, bannerW, bannerH * 0.16);

  // 7. Checkered ends — cap width so they never crush the center label area
  const checkerRows = 2;
  const checkerCols = 4;
  const maxCheckerBlock = bannerW * 0.12;
  const checkerSize = Math.min(bannerH * 0.34, maxCheckerBlock / checkerCols);

  const drawCheckerBlock = (x: number, y: number) => {
    for (let row = 0; row < checkerRows; row++) {
      for (let col = 0; col < checkerCols; col++) {
        ctx.fillStyle = (row + col) % 2 === 0 ? FINISH.cream : FINISH.dark;
        ctx.fillRect(
          x + col * checkerSize,
          y + row * checkerSize,
          checkerSize + 0.5,
          checkerSize + 0.5,
        );
      }
    }
  };

  const checkerBlockW = checkerCols * checkerSize;
  if (checkerBlockW > 2 && bannerW > checkerBlockW * 2.4) {
    drawCheckerBlock(bannerLeft + w * 0.03, bannerTop + bannerH * 0.27);
    drawCheckerBlock(bannerRight - w * 0.03 - checkerBlockW, bannerTop + bannerH * 0.27);
  }

  // 8. Celebration text panel — inset past checkers so label never overlaps them
  const checkerInset = checkerBlockW > 2 ? checkerBlockW + w * 0.04 : bannerW * 0.06;
  const panelPad = Math.max(bannerW * 0.04, checkerInset);
  const panelX = bannerLeft + panelPad;
  const panelW = Math.max(4, bannerW - panelPad * 2);
  const panelH = bannerH * 0.7;
  const panelTop = bannerTop + bannerH * 0.15;

  ctx.fillStyle = "#171513";
  ctx.fillRect(panelX, panelTop, panelW, panelH);

  ctx.strokeStyle = "rgba(255,209,102,0.65)";
  ctx.lineWidth = Math.max(1, w * 0.012);
  ctx.strokeRect(panelX, panelTop, panelW, panelH);

  const label = "អបអរសាទរ!";
  // Fit to usable panel width first (Khmer is wide); then cap to panel height.
  const maxLabelW = panelW * 0.94;
  let fs = Math.max(2, panelH * 0.55);
  ctx.font = `700 ${fs}px "Kantumruy Pro", "Baloo 2", system-ui, sans-serif`;
  const measured = ctx.measureText(label).width;
  if (measured > maxLabelW && measured > 0) {
    fs = Math.max(2, fs * (maxLabelW / measured));
    ctx.font = `700 ${fs}px "Kantumruy Pro", "Baloo 2", system-ui, sans-serif`;
  }
  const maxFs = panelH * 0.72;
  if (fs > maxFs) {
    fs = maxFs;
    ctx.font = `700 ${fs}px "Kantumruy Pro", "Baloo 2", system-ui, sans-serif`;
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const labelY = panelTop + panelH * 0.5;
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillText(label, roadCx + w * 0.012, labelY + w * 0.012);
  ctx.fillStyle = FINISH.gold;
  ctx.fillText(label, roadCx, labelY);

  // 9. Decorative lights
  const lightY = bannerTop - w * 0.055;
  const lights = 7;
  for (let i = 0; i < lights; i++) {
    const u = i / (lights - 1);
    const lx = left + (right - left) * u;
    const radius = Math.max(1.2, w * 0.025);
    ctx.fillStyle =
      i % 2 === 0 ? `rgba(255,209,102,${0.65 + pulse * 0.35})` : "rgba(247,243,227,0.9)";
    ctx.beginPath();
    ctx.arc(lx, lightY, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // 10. Main bunting rope
  const ropeY = bannerTop + bannerH + Math.max(6, w * 0.055);
  const midY = ropeY + w * 0.18 + sway;

  ctx.strokeStyle = FINISH.cream;
  ctx.lineWidth = Math.max(1.2, w * 0.012);
  ctx.beginPath();
  ctx.moveTo(left, ropeY);
  ctx.quadraticCurveTo(roadCx, midY, right, ropeY);
  ctx.stroke();

  const flags = 11;
  for (let i = 1; i < flags; i++) {
    const u = i / flags;
    const fx = left + (right - left) * u;
    const fy = (1 - u) * (1 - u) * ropeY + 2 * (1 - u) * u * midY + u * u * ropeY;
    const fh = Math.max(4, w * 0.095);
    const fw = Math.max(3, w * 0.042);
    ctx.fillStyle = BUNTING[i % BUNTING.length] as string;
    ctx.beginPath();
    ctx.moveTo(fx - fw, fy);
    ctx.lineTo(fx + fw, fy);
    ctx.lineTo(fx, fy + fh);
    ctx.closePath();
    ctx.fill();
  }

  // 11. Secondary bunting rope
  const rope2Y = ropeY + w * 0.045;
  const mid2Y = rope2Y + w * 0.105 - sway * 0.6;
  ctx.strokeStyle = "rgba(247,243,227,0.65)";
  ctx.lineWidth = Math.max(1, w * 0.008);
  ctx.beginPath();
  ctx.moveTo(left, rope2Y);
  ctx.quadraticCurveTo(roadCx, mid2Y, right, rope2Y);
  ctx.stroke();

  // 12. Small hanging center decoration
  const centerY = midY + w * 0.04;
  ctx.fillStyle = FINISH.gold;
  ctx.beginPath();
  ctx.arc(roadCx, centerY, Math.max(2, w * 0.035), 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export function render(
  ctx: CanvasRenderingContext2D,
  state: RaceState,
  width: number,
  height: number,
  dt = 0.016,
) {
  ensureEnvAssetsLoaded();
  const layout = layoutScale(width, height);
  const segments = state.segments;
  const player = state.player;
  const cameraZ = player.z - SEG_LENGTH * CAMERA_BEHIND_SEGS;
  const baseIndex = Math.max(0, Math.floor(cameraZ / SEG_LENGTH));
  const baseSeg = segments[Math.min(baseIndex, segments.length - 1)] as Segment;
  // Fractional position inside the camera segment — without this, curve/hill
  // offsets snap each time baseIndex increments (most visible when slow).
  const segPercent = (((cameraZ % SEG_LENGTH) + SEG_LENGTH) % SEG_LENGTH) / SEG_LENGTH;
  const cameraY = baseSeg.y1 + (baseSeg.y2 - baseSeg.y1) * segPercent + CAMERA_HEIGHT;
  const cameraX = player.x * ROAD_WIDTH;

  // ---- sky (warm afternoon) ----
  const sky = ctx.createLinearGradient(0, 0, 0, height * 0.58);
  sky.addColorStop(0, "#1a4a6e");
  sky.addColorStop(0.45, "#4a8fb0");
  sky.addColorStop(0.78, "#c4d6a8");
  sky.addColorStop(1, "#8fba7a");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  // Soft far ground under sky before road projects maxY
  ctx.fillStyle = COLORS.grassDark;
  ctx.fillRect(0, height * 0.48, width, height * 0.52);

  drawClouds(ctx, width, height, player.z);

  // ---- road ----
  let x = 0;
  let dx = -baseSeg.curve * segPercent;
  let maxY = height;
  const projected: (Proj | null)[] = new Array(DRAW_DISTANCE).fill(null);
  const projZ: number[] = new Array(DRAW_DISTANCE).fill(0);
  const roadsideDraws: { z: number; fn: () => void }[] = [];

  let prev: Proj | null = null;
  let prevZ = 0;

  for (let n = 0; n < DRAW_DISTANCE; n++) {
    const idx = baseIndex + n;
    if (idx >= segments.length - 1) break;
    const seg = segments[idx] as Segment;

    const z1 = idx * SEG_LENGTH;
    const z2 = z1 + SEG_LENGTH;
    x += dx;
    dx += seg.curve;
    const p2 = project(seg.y2, z2, cameraX - x, cameraY, cameraZ, width, height);

    projected[n] = p2;
    projZ[n] = z2;

    // Capture before maxY updates — used for prop flicker diagnostics
    const segVisible = !!(prev && p2.y < maxY && p2.y < prev.y);

    if (segVisible && prev) {
      const a = prev;
      const b = p2;
      const dark = Math.floor(idx / 3) % 2 === 0;

      // Far vegetation — solid green stripes (textures broke segment alignment)
      polygon(
        ctx,
        0,
        a.y,
        width,
        a.y,
        width,
        b.y,
        0,
        b.y,
        dark ? COLORS.grassLight : COLORS.grassDark,
      );

      // Near roadside bands
      const veg1 = a.w * 1.55;
      const veg2 = b.w * 1.55;
      polygon(
        ctx,
        a.x - veg1,
        a.y,
        a.x + veg1,
        a.y,
        b.x + veg2,
        b.y,
        b.x - veg2,
        b.y,
        dark ? COLORS.roadsideLight : COLORS.roadsideDark,
      );

      // Shoulder / verge
      const shoulder1 = a.w * 1.18;
      const shoulder2 = b.w * 1.18;
      polygon(
        ctx,
        a.x - shoulder1,
        a.y,
        a.x + shoulder1,
        a.y,
        b.x + shoulder2,
        b.y,
        b.x - shoulder2,
        b.y,
        dark ? COLORS.shoulderLight : COLORS.shoulderDark,
      );

      // Occasional grass patches beside shoulder
      if (segNoise(idx, 7) < 0.22) {
        const patch = GRASS_PATCHES[Math.floor(segNoise(idx, 8) * GRASS_PATCHES.length)] as string;
        const side = segNoise(idx, 9) < 0.5 ? -1 : 1;
        const o1 = a.w * (1.2 + segNoise(idx, 10) * 0.25);
        const o2 = b.w * (1.2 + segNoise(idx, 10) * 0.25);
        const hw = 0.08 + segNoise(idx, 11) * 0.06;
        polygon(
          ctx,
          a.x + side * o1 * (1 - hw),
          a.y,
          a.x + side * o1 * (1 + hw),
          a.y,
          b.x + side * o2 * (1 + hw),
          b.y,
          b.x + side * o2 * (1 - hw),
          b.y,
          patch,
        );
      }

      // Rumble (high-contrast solid — keep readable)
      const r1 = a.w * 1.12;
      const r2 = b.w * 1.12;
      polygon(
        ctx,
        a.x - r1,
        a.y,
        a.x + r1,
        a.y,
        b.x + r2,
        b.y,
        b.x - r2,
        b.y,
        dark ? COLORS.rumbleLight : COLORS.rumbleDark,
      );

      // Asphalt — solid (pattern tiling misaligned lane strips)
      polygon(
        ctx,
        a.x - a.w,
        a.y,
        a.x + a.w,
        a.y,
        b.x + b.w,
        b.y,
        b.x - b.w,
        b.y,
        dark ? COLORS.roadLight : COLORS.roadDark,
      );

      // Lane markers
      if (dark) {
        for (let l = 1; l < LANES; l++) {
          const f = -1 + (2 * l) / LANES;
          const lw1 = Math.max(1, Math.round(a.w * 0.012));
          const lw2 = Math.max(1, Math.round(b.w * 0.012));
          polygon(
            ctx,
            a.x + a.w * f - lw1,
            a.y,
            a.x + a.w * f + lw1,
            a.y,
            b.x + b.w * f + lw2,
            b.y,
            b.x + b.w * f - lw2,
            b.y,
            COLORS.lane,
          );
        }
      }

      // approach tints leading into answer gates
      const gateZ = state.challenge?.spawnZ ?? -1;
      if (
        state.challenge &&
        z2 < gateZ + SEG_LENGTH &&
        z2 > gateZ - SEG_LENGTH * 16 &&
        z1 > player.z - SEG_LENGTH
      ) {
        const proximity = clamp01(1 - (gateZ - z2) / (SEG_LENGTH * 16));
        for (const gate of state.challenge.gates) {
          if (gate.state !== "idle") continue;
          const tint = LANE_TINT[gate.lane] ?? "rgba(58,134,255,0.24)";
          const hw = 0.1 * proximity;
          polygon(
            ctx,
            a.x + a.w * (gate.x - hw),
            a.y,
            a.x + a.w * (gate.x + hw),
            a.y,
            b.x + b.w * (gate.x + hw),
            b.y,
            b.x + b.w * (gate.x - hw),
            b.y,
            tint,
          );
        }
      }

      // finish line band
      const finishBandZ = state.trackLength - SEG_LENGTH * 3;
      const finishBandEndZ = finishBandZ + SEG_LENGTH * 1.2;

      if (z2 >= finishBandZ && prevZ < finishBandZ) {
        polygon(ctx, a.x - a.w, a.y, a.x + a.w, a.y, b.x + b.w, b.y, b.x - b.w, b.y, "#f7f3e3");

        const cells = 10;
        for (let c = 0; c < cells; c += 2) {
          const f1 = -1 + (2 * c) / cells;
          const f2 = -1 + (2 * (c + 1)) / cells;
          polygon(
            ctx,
            a.x + a.w * f1,
            a.y,
            a.x + a.w * f2,
            a.y,
            b.x + b.w * f2,
            b.y,
            b.x + b.w * f1,
            b.y,
            "#25211d",
          );
        }
      }

      // Secondary thin finish stripe
      if (z2 >= finishBandEndZ && prevZ < finishBandEndZ) {
        polygon(ctx, a.x - a.w, a.y, a.x + a.w, a.y, b.x + b.w, b.y, b.x - b.w, b.y, "#d94b43");
      }

      maxY = b.y;
    }

    // Props outside hill-clip so they don't flash when a segment is occluded
    if (prev && seg.props.length > 0 && n > 2) {
      const a = prev;
      const b = p2;
      const roadW = Math.max(1, (a.w + b.w) * 0.5);
      if (roadW >= 22) {
        const mx = (a.x + b.x) * 0.5;
        const my = (a.y + b.y) * 0.5;
        for (const prop of seg.props) {
          const aspect = PROP_ASPECT[prop.kind] ?? 0.9;
          const halfSprite = (roadW * PROP_SPRITE_H[prop.kind] * aspect) / 2;
          const minOff = 1.25 + halfSprite / roadW;
          const off = Math.max(prop.offset, minOff);
          const sx = mx + prop.side * off * roadW;
          roadsideDraws.push({
            z: z2,
            fn: () => drawRoadsideProp(ctx, sx, my, roadW, prop.kind, prop.variant ?? 0),
          });
        }
      }
    }

    prev = p2;
    prevZ = z2;
  }

  // ---- horizon layers (above road clip) ----
  const horizonY = maxY;
  drawMountainLayers(ctx, width, horizonY, player.z);
  drawTreesFarLayer(ctx, width, height, horizonY, player.z);
  // Soft forest blobs sit in front of mountains and read as flat "shape"
  // hills — skip them once realistic mountain WebPs are ready.
  if (!mountainsFullyLoaded()) {
    drawFarForest(ctx, width, horizonY, player.z);
    drawCanopy(ctx, width, horizonY, player.z);
  }
  // Soft haze only (no thick horizontal bar)
  const fog = ctx.createLinearGradient(0, horizonY - height * 0.05, 0, horizonY + height * 0.06);
  fog.addColorStop(0, "rgba(180,210,170,0.08)");
  fog.addColorStop(1, "rgba(52,138,69,0)");
  ctx.fillStyle = fog;
  ctx.fillRect(0, horizonY - height * 0.05, width, height * 0.11);

  // Roadside props (far → near)
  roadsideDraws.sort((a, b) => b.z - a.z);
  for (const d of roadsideDraws) d.fn();

  // ---- sprite helper ----
  const spriteAt = (z: number, offsetX: number) => {
    const n = Math.floor((z - baseIndex * SEG_LENGTH) / SEG_LENGTH);
    if (n < 1 || n >= DRAW_DISTANCE) return null;
    const p = projected[n];
    const pPrev = projected[n - 1];
    if (!p || !pPrev) return null;
    const pct = (((z % SEG_LENGTH) + SEG_LENGTH) % SEG_LENGTH) / SEG_LENGTH;
    const scale = pPrev.scale + (p.scale - pPrev.scale) * pct;
    const sx = pPrev.x + (p.x - pPrev.x) * pct;
    const sy = pPrev.y + (p.y - pPrev.y) * pct;
    const w = pPrev.w + (p.w - pPrev.w) * pct;
    return { x: sx + offsetX * w, y: sy, scale: scale * height * 0.9, w };
  };

  // Shared depth reference: sprites at player camera-depth match playerFrac size
  const playerDrawScale = height * layout.playerFrac;
  const refSpriteScale = (CAMERA_DEPTH / (SEG_LENGTH * CAMERA_BEHIND_SEGS)) * height * 0.9;

  // Advance 3D cat mixers once per frame before the depth-sorted draw queue
  syncCharacters(state.racers, dt);

  // draw items and racers back-to-front
  type Draw = { z: number; fn: () => void };
  const draws: Draw[] = [];

  for (const item of state.items) {
    if (item.taken) continue;
    const s = spriteAt(item.z, item.x);
    if (!s) continue;
    // Readable pickup labels: a bit taller than the player sprite at player depth
    const itemScale = playerDrawScale * 1.2 * (s.scale / Math.max(1e-6, refSpriteScale));
    draws.push({
      z: item.z,
      fn: () => drawItem(ctx, s.x, s.y, itemScale, item.kind, state.elapsed),
    });
  }

  const allGates = [...(state.challenge ? state.challenge.gates : []), ...state.fxGates];
  for (const gate of allGates) {
    const s = spriteAt(gate.z, gate.x);
    if (!s) continue;
    // Perspective size from lane width only — no far screen-size floor
    // (floors look huge in the distance and shrink vs the road as you approach).
    const laneW = (s.w * 2) / LANES;
    const perspective = Math.min(laneW * layout.gateLaneFill, height * layout.gateHeightCap);
    const gateScale = Math.max(4, perspective);
    draws.push({
      z: gate.z,
      fn: () => drawAnswerGate(ctx, s.x, s.y, gateScale, gate, state.elapsed, layout.gateMinFont),
    });
  }

  for (const burst of state.bursts) {
    const s = spriteAt(burst.z, burst.x);
    if (!s) continue;
    draws.push({
      z: burst.z + 1,
      fn: () => drawBurst(ctx, s.x, s.y, s.scale * 0.7, burst.life, burst.good),
    });
  }

  // finish competition gantry (posts + FINISH banner + cheer ropes)
  {
    const finishZ = state.trackLength - SEG_LENGTH * 3;
    const s = spriteAt(finishZ, 0);
    if (s) {
      draws.push({
        z: finishZ,
        fn: () => drawFinishGate(ctx, s.x, s.y, s.w, state.elapsed, height, layout.aspect),
      });
    }
  }

  // Rivals share player depth scale, with soft near-pack matching
  for (const r of state.racers) {
    if (r.isPlayer) continue;
    const s = spriteAt(r.z, r.x);
    if (!s) continue;
    const rawRatio = s.scale / Math.max(1e-6, refSpriteScale);
    // Pure perspective matches at same Z, but rivals slightly ahead look too small
    // and anyone between camera & player balloons — soften both cases.
    let depthRatio = rawRatio;
    if (rawRatio > 1) {
      // Behind / toward camera: keep near pack ≈ player size
      depthRatio = Math.min(1.08, 1 + (rawRatio - 1) * 0.08);
    } else {
      // Slightly ahead: pull size toward player so pack racing feels matched
      const blend = clamp01(1 - Math.abs(r.z - player.z) / (SEG_LENGTH * 12));
      depthRatio = rawRatio + (1 - rawRatio) * blend * 0.75;
    }
    const aiDrawScale = playerDrawScale * depthRatio;
    draws.push({
      z: r.z,
      fn: () => drawRacer(ctx, s.x, s.y, aiDrawScale, r, null),
    });
  }

  draws.sort((a, b) => b.z - a.z);
  for (const d of draws) d.fn();

  // player is camera-locked: centered; Y/size from aspect-aware layout
  drawRacer(ctx, width / 2, height * layout.playerScreenY, playerDrawScale, player, "YOU");

  // ---- speed streaks ----
  const intensity = Math.max(0, state.boost);
  if (intensity > 0.05) {
    ctx.save();
    ctx.globalAlpha = Math.min(0.5, intensity * 0.5);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + state.elapsed * 2;
      const rr = width * 0.34;
      const cxp = width / 2 + Math.cos(a) * rr;
      const cyp = height * 0.55 + Math.sin(a) * rr * 0.6;
      ctx.beginPath();
      ctx.moveTo(cxp, cyp);
      ctx.lineTo(width / 2 + Math.cos(a) * rr * 0.72, height * 0.55 + Math.sin(a) * rr * 0.43);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---- floating feedback pops ----
  for (const pop of state.pops) {
    const fs = Math.max(20, width * 0.055);
    ctx.save();
    ctx.globalAlpha = Math.min(1, pop.life);
    ctx.font = `900 ${fs}px "Baloo 2", system-ui, sans-serif`;
    ctx.textAlign = "center";
    const px = width * (0.5 + pop.x);
    const py = height * (0.5 - pop.y * 0.35);
    ctx.lineWidth = fs * 0.22;
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.strokeText(pop.text, px, py);
    ctx.fillStyle = pop.good ? "#ffe066" : "#ff7a7a";
    ctx.fillText(pop.text, px, py);
    ctx.restore();
  }
}

function drawClouds(ctx: CanvasRenderingContext2D, width: number, height: number, z: number) {
  const shift = (z * 0.008) % (width * 2);
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  for (let i = 0; i < 5; i++) {
    const cx = ((i * width * 0.55 - shift + width * 4) % (width * 1.8)) - width * 0.2;
    const cy = height * (0.08 + (i % 3) * 0.05);
    const r = width * (0.08 + (i % 2) * 0.04);
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r * 0.45, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + r * 0.55, cy + 4, r * 0.7, r * 0.38, 0, 0, Math.PI * 2);
    ctx.ellipse(cx - r * 0.5, cy + 2, r * 0.55, r * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

type MountainLayer = {
  src: string;
  /** 0–1 screen opacity */
  opacity: number;
  /** CSS canvas filter blur in CSS pixels */
  blurPx: number;
  /** Parallax scroll rate vs player.z */
  parallax: number;
  /** Layer height as a fraction of horizonY */
  heightFrac: number;
};

const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\//, "")}`;

/** Far → near: softer / blurrier → sharper (stylised-realistic depth). */
const MOUNTAIN_LAYERS: MountainLayer[] = [
  {
    src: assetUrl("bg/mountains-far.webp"),
    opacity: 0.45,
    blurPx: 2.5,
    parallax: 0.004,
    heightFrac: 0.58,
  },
  {
    src: assetUrl("bg/mountains-mid.webp"),
    opacity: 0.7,
    blurPx: 1,
    parallax: 0.008,
    heightFrac: 0.5,
  },
  {
    src: assetUrl("bg/mountains-near.webp"),
    opacity: 1,
    blurPx: 0,
    parallax: 0.014,
    heightFrac: 0.42,
  },
];

const ENV_TEX_SRCS = {
  treesFar: assetUrl("bg/trees-far.webp?v=2"),
} as const;

const PROP_SRCS: Record<RoadsideKind, string | string[]> = {
  tree: assetUrl("props/tree.webp"),
  palm: assetUrl("props/palm.webp"),
  bush: assetUrl("props/bush.webp"),
  rock: assetUrl("props/rock.webp"),
  lamp: assetUrl("props/lamp.webp"),
  sign: assetUrl("props/sign.webp"),
  house: [
    assetUrl("props/house-1.webp?v=2"),
    assetUrl("props/house-2.webp?v=2"),
    assetUrl("props/house-3.webp?v=2"),
  ],
  stall: assetUrl("props/stall.webp"),
  fence: assetUrl("props/fence.webp"),
  pole: assetUrl("props/pole.webp"),
};

/** Sprite height as a multiple of projected road half-width. */
const PROP_SPRITE_H: Record<RoadsideKind, number> = {
  tree: 1.35,
  palm: 1.5,
  bush: 0.45,
  rock: 0.28,
  lamp: 1.05,
  sign: 0.95,
  house: 1.25,
  stall: 0.9,
  fence: 0.5,
  pole: 1.15,
};

/** Approx width/height — used to keep wide sprites off the asphalt. */
const PROP_ASPECT: Partial<Record<RoadsideKind, number>> = {
  tree: 1.05,
  palm: 0.87,
  house: 1.1,
  bush: 1.4,
  stall: 1.25,
};

const mountainImages: (HTMLImageElement | null)[] = MOUNTAIN_LAYERS.map(() => null);
const envImages: {
  treesFar: HTMLImageElement | null;
} = { treesFar: null };
const propImages: Partial<Record<string, HTMLImageElement | null>> = {};

let envAssetsLoadStarted = false;

function loadImage(src: string, onReady: (img: HTMLImageElement) => void) {
  if (typeof Image === "undefined") return;
  const img = new Image();
  img.decoding = "async";
  img.onload = () => onReady(img);
  img.src = src;
}

function ensureEnvAssetsLoaded() {
  if (envAssetsLoadStarted || typeof Image === "undefined") return;
  envAssetsLoadStarted = true;

  MOUNTAIN_LAYERS.forEach((layer, i) => {
    loadImage(layer.src, (img) => {
      mountainImages[i] = img;
    });
  });

  (Object.keys(ENV_TEX_SRCS) as (keyof typeof ENV_TEX_SRCS)[]).forEach((key) => {
    loadImage(ENV_TEX_SRCS[key], (img) => {
      envImages[key] = img;
    });
  });

  (Object.keys(PROP_SRCS) as RoadsideKind[]).forEach((kind) => {
    const src = PROP_SRCS[kind];
    if (Array.isArray(src)) {
      src.forEach((url, vi) => {
        loadImage(url, (img) => {
          propImages[`${kind}:${vi}`] = img;
        });
      });
    } else {
      loadImage(src, (img) => {
        propImages[kind] = img;
      });
    }
  });
}

function mountainsFullyLoaded() {
  return mountainImages.every((img) => img !== null && img.complete && img.naturalWidth > 0);
}

/** Flat silhouette fallback while WebP layers load. */
function drawMountainSilhouetteFallback(
  ctx: CanvasRenderingContext2D,
  width: number,
  horizonY: number,
) {
  const peakH = Math.max(80, horizonY * 0.45);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, horizonY + 8);
  const peaks = [0.08, 0.22, 0.38, 0.52, 0.68, 0.82, 0.95];
  const heights = [0.12, 0.22, 0.16, 0.28, 0.14, 0.2, 0.1];
  for (let i = 0; i < peaks.length; i++) {
    const px = width * (peaks[i] as number);
    const py = horizonY - peakH * (heights[i] as number);
    ctx.lineTo(px, py);
  }
  ctx.lineTo(width, horizonY + 8);
  ctx.closePath();
  ctx.fillStyle = "#3d5a6a";
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(0, horizonY + 10);
  for (let i = 0; i < peaks.length; i++) {
    const px = width * ((peaks[i] as number) + 0.04);
    const py = horizonY - peakH * ((heights[i] as number) * 0.55);
    ctx.lineTo(px, py);
  }
  ctx.lineTo(width, horizonY + 10);
  ctx.closePath();
  ctx.fillStyle = "#2a4552";
  ctx.fill();
  ctx.restore();
}

function drawMountainLayers(
  ctx: CanvasRenderingContext2D,
  width: number,
  horizonY: number,
  z: number,
) {
  ensureEnvAssetsLoaded();
  if (!mountainsFullyLoaded()) {
    drawMountainSilhouetteFallback(ctx, width, horizonY);
    return;
  }

  ctx.save();
  for (let i = 0; i < MOUNTAIN_LAYERS.length; i++) {
    const layer = MOUNTAIN_LAYERS[i] as MountainLayer;
    const img = mountainImages[i];
    if (!img) continue;

    const drawH = Math.max(72, horizonY * layer.heightFrac);
    const aspect = img.naturalWidth / Math.max(1, img.naturalHeight);
    const drawW = Math.max(width * 1.4, drawH * aspect);
    // Slight overlap hides hard tile seams
    const step = drawW * 0.97;
    const shift = (((z * layer.parallax) % step) + step) % step;
    const y = horizonY - drawH + 10;

    ctx.globalAlpha = layer.opacity;
    ctx.filter = layer.blurPx > 0 ? `blur(${layer.blurPx}px)` : "none";

    // Mirror alternate tiles so left/right edges meet more cleanly
    let tile = 0;
    for (let x = -shift - drawW; x < width + drawW; x += step) {
      const flip = tile % 2 === 1;
      if (flip) {
        ctx.save();
        ctx.translate(x + drawW, y);
        ctx.scale(-1, 1);
        ctx.drawImage(img, 0, 0, drawW, drawH);
        ctx.restore();
      } else {
        ctx.drawImage(img, x, y, drawW, drawH);
      }
      tile++;
    }
  }
  ctx.filter = "none";
  ctx.globalAlpha = 1;
  ctx.restore();
}

/** Far tree strip — feet planted into the horizon line. */
function drawTreesFarLayer(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  horizonY: number,
  z: number,
) {
  const img = envImages.treesFar;
  if (!img?.complete || img.naturalWidth <= 0) return;

  const drawH = Math.max(56, Math.min(height * 0.2, horizonY * 0.36));
  const aspect = img.naturalWidth / Math.max(1, img.naturalHeight);
  const drawW = Math.max(width * 1.15, drawH * aspect);
  const parallax = 0.018;
  const shift = (((z * parallax) % drawW) + drawW) % drawW;
  // Sink contact band slightly below horizon so trunks don't float over mountains
  const sink = Math.max(4, Math.round(drawH * 0.08));
  const y = Math.round(horizonY - drawH + sink);

  ctx.save();
  ctx.globalAlpha = 0.92;
  for (let x = -shift - drawW; x < width + drawW; x += drawW) {
    ctx.drawImage(img, Math.round(x), y, Math.round(drawW), Math.round(drawH));
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawFarForest(ctx: CanvasRenderingContext2D, width: number, horizonY: number, z: number) {
  const shift = (z * 0.014) % (width * 2);
  ctx.save();
  ctx.globalAlpha = 0.72;
  ctx.fillStyle = "#1a4a32";
  for (let i = -2; i < 14; i++) {
    const cx = (((i * width) / 5 - shift * 0.2 + width * 4) % (width * 2)) - width * 0.4;
    const r = width * 0.12;
    ctx.beginPath();
    ctx.ellipse(cx, horizonY + 6, r, r * 0.55, 0, Math.PI, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawCanopy(ctx: CanvasRenderingContext2D, width: number, horizonY: number, z: number) {
  const shift = (z * 0.02) % (width * 2);
  ctx.save();
  ctx.globalAlpha = 0.82;
  ctx.fillStyle = "#0b3326";
  for (let i = -2; i < 8; i++) {
    const cx = (((i * width) / 3 - shift * 0.15 + width * 4) % (width * 2)) - width * 0.5;
    const r = width * 0.22;
    ctx.beginPath();
    ctx.ellipse(cx, horizonY + 2, r, r * 0.5, 0, Math.PI, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#061f18";
  for (let i = -2; i < 10; i++) {
    const cx = (((i * width) / 4 - shift * 0.28 + width * 4) % (width * 2)) - width * 0.5;
    const r = width * 0.14;
    ctx.beginPath();
    ctx.ellipse(cx, horizonY + 4, r, r * 0.65, 0, Math.PI, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawRoadsideProp(
  ctx: CanvasRenderingContext2D,
  x: number,
  groundY: number,
  roadHalfW: number,
  kind: RoadsideKind,
  variant = 0,
) {
  const h = Math.max(18, roadHalfW * PROP_SPRITE_H[kind]);
  const spriteKey = Array.isArray(PROP_SRCS[kind]) ? `${kind}:${variant % 3}` : kind;
  let sprite = propImages[spriteKey] ?? propImages[kind];
  // Prefer any loaded 3/4 house over the flat vector facade
  if ((!sprite || !sprite.complete || sprite.naturalWidth <= 0) && kind === "house") {
    sprite = propImages["house:0"] ?? propImages["house:1"] ?? propImages["house:2"] ?? null;
  }
  if (sprite?.complete && sprite.naturalWidth > 0) {
    const aspect = sprite.naturalWidth / Math.max(1, sprite.naturalHeight);
    const w = h * aspect;
    // Plant into the ground slightly so feet don't hover on the grass edge
    const sink =
      kind === "house"
        ? Math.max(3, Math.round(h * 0.08))
        : kind === "palm"
          ? Math.max(2, Math.round(h * 0.05))
          : kind === "tree"
            ? Math.max(2, Math.round(h * 0.04))
            : Math.max(1, Math.round(h * 0.02));
    const dx = Math.round(x - w / 2);
    const dy = Math.round(groundY - h + sink);
    const dw = Math.round(w);
    const dh = Math.round(h);

    ctx.save();
    if (kind === "house" || kind === "tree" || kind === "stall") {
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.beginPath();
      ctx.ellipse(
        Math.round(x),
        Math.round(groundY + 1),
        Math.max(6, dw * 0.38),
        Math.max(2, dh * 0.05),
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.drawImage(sprite, dx, dy, dw, dh);
    ctx.restore();
    return;
  }

  // Never draw the old flat front-wall house vector — wait for sprites
  if (kind === "house") {
    return;
  }

  // Vector fallback uses a comparable world height
  const s = h / Math.max(0.55, PROP_SPRITE_H[kind]);
  ctx.save();
  ctx.translate(Math.round(x), Math.round(groundY));

  switch (kind) {
    case "tree": {
      ctx.fillStyle = "#5c3a1e";
      ctx.fillRect(-s * 0.08, -s * 0.55, s * 0.16, s * 0.55);
      ctx.fillStyle = "#2d7a3e";
      ctx.beginPath();
      ctx.ellipse(0, -s * 0.7, s * 0.42, s * 0.38, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#246b35";
      ctx.beginPath();
      ctx.ellipse(-s * 0.15, -s * 0.55, s * 0.28, s * 0.24, 0, 0, Math.PI * 2);
      ctx.ellipse(s * 0.18, -s * 0.58, s * 0.26, s * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "palm": {
      ctx.fillStyle = "#6b4a28";
      ctx.beginPath();
      ctx.moveTo(-s * 0.06, 0);
      ctx.quadraticCurveTo(s * 0.08, -s * 0.4, -s * 0.02, -s * 0.85);
      ctx.lineTo(s * 0.06, -s * 0.85);
      ctx.quadraticCurveTo(s * 0.14, -s * 0.4, s * 0.06, 0);
      ctx.fill();
      ctx.strokeStyle = "#1f6b3a";
      ctx.lineWidth = Math.max(1.5, s * 0.06);
      ctx.lineCap = "round";
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.82);
        ctx.quadraticCurveTo(i * s * 0.35, -s * 0.95, i * s * 0.55, -s * 0.7);
        ctx.stroke();
      }
      break;
    }
    case "bush": {
      ctx.fillStyle = "#2f8a45";
      ctx.beginPath();
      ctx.ellipse(-s * 0.15, -s * 0.18, s * 0.22, s * 0.16, 0, 0, Math.PI * 2);
      ctx.ellipse(s * 0.12, -s * 0.2, s * 0.24, s * 0.18, 0, 0, Math.PI * 2);
      ctx.ellipse(0, -s * 0.28, s * 0.2, s * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "rock": {
      ctx.fillStyle = "#7a7568";
      ctx.beginPath();
      ctx.ellipse(0, -s * 0.12, s * 0.22, s * 0.14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#5e5a50";
      ctx.beginPath();
      ctx.ellipse(s * 0.08, -s * 0.08, s * 0.12, s * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "lamp": {
      ctx.fillStyle = "#3a3a3a";
      ctx.fillRect(-s * 0.04, -s * 0.9, s * 0.08, s * 0.9);
      ctx.fillStyle = "#f0d878";
      ctx.beginPath();
      ctx.ellipse(0, -s * 0.95, s * 0.12, s * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "pole": {
      ctx.fillStyle = "#5a5348";
      ctx.fillRect(-s * 0.05, -s * 1.05, s * 0.1, s * 1.05);
      ctx.strokeStyle = "#3d3830";
      ctx.lineWidth = Math.max(1, s * 0.04);
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.95);
      ctx.lineTo(s * 0.45, -s * 0.7);
      ctx.moveTo(0, -s * 0.85);
      ctx.lineTo(-s * 0.4, -s * 0.65);
      ctx.stroke();
      break;
    }
    case "sign": {
      ctx.fillStyle = "#555";
      ctx.fillRect(-s * 0.04, -s * 0.7, s * 0.08, s * 0.7);
      ctx.fillStyle = "#c0392b";
      ctx.fillRect(-s * 0.28, -s * 0.95, s * 0.56, s * 0.32);
      ctx.fillStyle = "#fff";
      ctx.font = `700 ${Math.max(8, s * 0.18)}px "Baloo 2", system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("!", 0, -s * 0.79);
      break;
    }
    case "stall": {
      ctx.fillStyle = "#d4a574";
      ctx.fillRect(-s * 0.4, -s * 0.35, s * 0.8, s * 0.35);
      ctx.fillStyle = "#e74c3c";
      ctx.beginPath();
      ctx.moveTo(-s * 0.48, -s * 0.35);
      ctx.lineTo(0, -s * 0.62);
      ctx.lineTo(s * 0.48, -s * 0.35);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#f5c542";
      ctx.fillRect(-s * 0.28, -s * 0.22, s * 0.18, s * 0.12);
      ctx.fillStyle = "#2ecc71";
      ctx.fillRect(s * 0.05, -s * 0.22, s * 0.18, s * 0.12);
      break;
    }
    case "fence": {
      ctx.strokeStyle = "#8b6914";
      ctx.lineWidth = Math.max(1.5, s * 0.05);
      ctx.beginPath();
      ctx.moveTo(-s * 0.45, -s * 0.22);
      ctx.lineTo(s * 0.45, -s * 0.22);
      ctx.moveTo(-s * 0.45, -s * 0.1);
      ctx.lineTo(s * 0.45, -s * 0.1);
      ctx.stroke();
      ctx.fillStyle = "#8b6914";
      for (let i = -2; i <= 2; i++) {
        ctx.fillRect(i * s * 0.2 - s * 0.03, -s * 0.32, s * 0.06, s * 0.32);
      }
      break;
    }
  }

  ctx.restore();
}
