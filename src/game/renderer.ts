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
  type Segment,
} from "./raceEngine";

const DRAW_DISTANCE = GATE_DRAW_SEGMENTS;
const CAMERA_HEIGHT = 1150;
const FIELD_OF_VIEW = 100;
const CAMERA_DEPTH = 1 / Math.tan(((FIELD_OF_VIEW / 2) * Math.PI) / 180);

type Proj = { x: number; y: number; w: number; scale: number };

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

const COLORS = {
  grassLight: "#2f8f4e",
  grassDark: "#27793f",
  roadLight: "#7cc23f",
  roadDark: "#6fb236",
  rumbleLight: "#f7f3e3",
  rumbleDark: "#c8532f",
  lane: "#eaf7d2",
};

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
  return {
    x: width / 2 + (scale * -cameraX * width) / 2,
    y: height / 2 - (scale * (worldY - cameraY) * height) / 2,
    w: (scale * ROAD_WIDTH * width) / 2,
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
/**
 * Cute mascot racer — rear view.
 *
 * Design goals:
 * - Oversized rounded mascot body/head
 * - Distinctive ears
 * - Small backpack visible from behind
 * - Stubby running legs
 * - Soft swinging arms
 * - Tiny bouncing tail
 * - Strong squash/stretch and running motion
 * - Designed to remain readable at small perspective scales
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
  /*
   * ---------------------------------------------------------
   * SIZE
   * ---------------------------------------------------------
   *
   * Keep the character compact but chunky.
   *
   * h = total character height.
   * Important details are proportional to h rather than
   * arbitrary canvas pixels, so perspective scaling remains
   * consistent.
   */
  const h = Math.max(12, scale * 0.98);

  const bodyW = h * 0.68;
  const headH = h * 0.54;
  const bodyH = h * 0.47;

  /*
   * ---------------------------------------------------------
   * RUNNING ANIMATION
   * ---------------------------------------------------------
   */

  const phase = racer.bob;

  // Main vertical bounce.
  const bounce = Math.abs(Math.sin(phase)) * h * 0.075;

  // Alternating leg movement.
  const legPhase = Math.sin(phase);

  // Opposite arm movement.
  const armPhase = Math.sin(phase + Math.PI);

  // Slight side-to-side movement.
  const sway = Math.sin(phase * 0.5) * h * 0.018;

  // Body squash/stretch.
  const squash = 1 + Math.sin(phase * 2) * 0.025;

  /*
   * ---------------------------------------------------------
   * COLORS
   * ---------------------------------------------------------
   */

  const baseColor =
    racer.color && racer.color.toLowerCase() !== "#ffffff"
      ? racer.color
      : "#7b68ee";

  const darkColor = shadeHex(baseColor, -45);
  const darkerColor = shadeHex(baseColor, -65);
  const lightColor = shadeHex(baseColor, 45);

  const backpackColor = shadeHex(baseColor, -30);
  const backpackDark = shadeHex(baseColor, -55);

  const limbColor = shadeHex(baseColor, -55);

  /*
   * ---------------------------------------------------------
   * CHARACTER POSITION
   * ---------------------------------------------------------
   */

  const baseY = groundY - bounce;

  /*
   * Shadow stays on the road while character moves above it.
   */
  ctx.save();

  ctx.fillStyle = "rgba(0,0,0,0.24)";

  ctx.beginPath();

  ctx.ellipse(
    cx + sway,
    groundY + h * 0.015,
    bodyW * 0.52,
    h * 0.075,
    0,
    0,
    Math.PI * 2,
  );

  ctx.fill();

  ctx.restore();

  /*
   * Everything below this point moves together.
   */

  ctx.save();

  ctx.translate(cx + sway, baseY);

  /*
   * Slight squash/stretch.
   */
  ctx.scale(1 / squash, squash);

  /*
   * ---------------------------------------------------------
   * DIMENSIONS
   * ---------------------------------------------------------
   */

  const headTop = -h * 0.98;
  const headBottom = -h * 0.43;

  const bodyTop = -h * 0.58;
  const bodyBottom = -h * 0.08;

  /*
   * ---------------------------------------------------------
   * LEGS
   * ---------------------------------------------------------
   */

  const legThickness = Math.max(2, h * 0.115);

  const legY = -h * 0.02;

  const leftLegX = -bodyW * 0.20;
  const rightLegX = bodyW * 0.20;

  /*
   * Feet move forward/backward.
   */
  const leftFootX =
    leftLegX + legPhase * h * 0.085;

  const rightFootX =
    rightLegX - legPhase * h * 0.085;

  /*
   * Slight vertical variation makes the legs feel like
   * actual running rather than two rotating lines.
   */
  const leftFootY =
    legY + Math.max(0, -legPhase) * h * 0.035;

  const rightFootY =
    legY + Math.max(0, legPhase) * h * 0.035;

  /*
   * Back leg shadow.
   */
  drawLimb(
    ctx,
    leftLegX,
    bodyBottom - h * 0.02,
    leftFootX,
    leftFootY,
    legThickness,
    darkerColor,
  );

  drawLimb(
    ctx,
    rightLegX,
    bodyBottom - h * 0.02,
    rightFootX,
    rightFootY,
    legThickness,
    darkerColor,
  );

  /*
   * Cute rounded feet.
   */
  const footRadius = Math.max(2, h * 0.065);

  ctx.fillStyle = limbColor;

  ctx.beginPath();
  ctx.ellipse(
    leftFootX,
    leftFootY,
    footRadius * 1.35,
    footRadius * 0.72,
    -0.12,
    0,
    Math.PI * 2,
  );
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(
    rightFootX,
    rightFootY,
    footRadius * 1.35,
    footRadius * 0.72,
    0.12,
    0,
    Math.PI * 2,
  );
  ctx.fill();

  /*
   * ---------------------------------------------------------
   * BACKPACK
   * ---------------------------------------------------------
   *
   * This is one of the most important design elements.
   * Since the player sees the character from behind, the
   * backpack gives the silhouette identity.
   */

  const backpackW = bodyW * 0.52;
  const backpackH = bodyH * 0.62;

  const backpackX = 0;
  const backpackY = bodyTop + h * 0.10;

  ctx.fillStyle = backpackDark;

  ctx.beginPath();

  ctx.roundRect(
    backpackX - backpackW / 2,
    backpackY,
    backpackW,
    backpackH,
    h * 0.10,
  );

  ctx.fill();

  /*
   * Backpack main panel.
   */
  ctx.fillStyle = backpackColor;

  ctx.beginPath();

  ctx.roundRect(
    backpackX - backpackW * 0.43,
    backpackY + h * 0.025,
    backpackW * 0.86,
    backpackH * 0.88,
    h * 0.075,
  );

  ctx.fill();

  /*
   * Backpack center pocket.
   */
  if (h > 18) {
    ctx.fillStyle = shadeHex(backpackColor, -20);

    ctx.beginPath();

    ctx.roundRect(
      -backpackW * 0.25,
      backpackY + backpackH * 0.46,
      backpackW * 0.50,
      backpackH * 0.28,
      h * 0.045,
    );

    ctx.fill();
  }

  /*
   * Backpack straps.
   */
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

  /*
   * ---------------------------------------------------------
   * ARMS
   * ---------------------------------------------------------
   */

  const shoulderY = bodyTop + h * 0.23;

  const armLength = h * 0.19;
  const armThickness = Math.max(2, h * 0.085);

  /*
   * Arms swing opposite to legs.
   */
  const leftArmX =
    -bodyW * 0.47 - armPhase * h * 0.055;

  const rightArmX =
    bodyW * 0.47 + armPhase * h * 0.055;

  const leftArmY =
    shoulderY + h * 0.11 + armPhase * h * 0.055;

  const rightArmY =
    shoulderY + h * 0.11 - armPhase * h * 0.055;

  drawLimb(
    ctx,
    -bodyW * 0.42,
    shoulderY,
    leftArmX,
    leftArmY,
    armThickness,
    limbColor,
  );

  drawLimb(
    ctx,
    bodyW * 0.42,
    shoulderY,
    rightArmX,
    rightArmY,
    armThickness,
    limbColor,
  );

  /*
   * Tiny rounded hands.
   */
  const handRadius = Math.max(1.5, h * 0.045);

  ctx.fillStyle = limbColor;

  ctx.beginPath();
  ctx.arc(leftArmX, leftArmY, handRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(rightArmX, rightArmY, handRadius, 0, Math.PI * 2);
  ctx.fill();

  /*
   * ---------------------------------------------------------
   * MAIN BODY
   * ---------------------------------------------------------
   */

  const bodyGradient = ctx.createLinearGradient(
    0,
    bodyTop,
    0,
    bodyBottom,
  );

  bodyGradient.addColorStop(0, lightColor);
  bodyGradient.addColorStop(0.42, baseColor);
  bodyGradient.addColorStop(1, darkColor);

  ctx.fillStyle = bodyGradient;

  ctx.beginPath();

  ctx.moveTo(0, bodyTop);

  /*
   * Right shoulder.
   */
  ctx.bezierCurveTo(
    bodyW * 0.40,
    bodyTop,
    bodyW * 0.52,
    bodyTop + h * 0.12,
    bodyW * 0.48,
    bodyTop + h * 0.28,
  );

  /*
   * Right side.
   */
  ctx.bezierCurveTo(
    bodyW * 0.47,
    bodyTop + h * 0.40,
    bodyW * 0.38,
    bodyBottom,
    bodyW * 0.18,
    bodyBottom,
  );

  /*
   * Bottom.
   */
  ctx.quadraticCurveTo(
    0,
    bodyBottom + h * 0.045,
    -bodyW * 0.18,
    bodyBottom,
  );

  /*
   * Left side.
   */
  ctx.bezierCurveTo(
    -bodyW * 0.38,
    bodyBottom,
    -bodyW * 0.47,
    bodyTop + h * 0.40,
    -bodyW * 0.48,
    bodyTop + h * 0.28,
  );

  ctx.bezierCurveTo(
    -bodyW * 0.52,
    bodyTop + h * 0.12,
    -bodyW * 0.40,
    bodyTop,
    0,
    bodyTop,
  );

  ctx.closePath();
  ctx.fill();

  /*
   * ---------------------------------------------------------
   * HEAD
   * ---------------------------------------------------------
   *
   * The head overlaps the body slightly. This creates a
   * mascot-like silhouette instead of a single bean.
   */

  const headW = bodyW * 1.28;

  const headGradient = ctx.createLinearGradient(
    0,
    headTop,
    0,
    headBottom,
  );

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
    headW * 0.50,
    headTop + h * 0.29,
  );

  ctx.bezierCurveTo(
    headW * 0.48,
    headBottom,
    headW * 0.30,
    headBottom + h * 0.04,
    0,
    headBottom + h * 0.02,
  );

  ctx.bezierCurveTo(
    -headW * 0.30,
    headBottom + h * 0.04,
    -headW * 0.48,
    headBottom,
    -headW * 0.50,
    headTop + h * 0.29,
  );

  ctx.bezierCurveTo(
    -headW * 0.53,
    headTop + h * 0.12,
    -headW * 0.43,
    headTop,
    0,
    headTop,
  );

  ctx.closePath();
  ctx.fill();

  /*
   * ---------------------------------------------------------
   * EARS
   * ---------------------------------------------------------
   *
   * Two small rounded ears make the silhouette much more
   * memorable from the rear.
   */

  const earW = h * 0.13;
  const earH = h * 0.16;

  const earY = headTop + h * 0.15;

  ctx.fillStyle = darkColor;

  /*
   * Left ear.
   */
  ctx.beginPath();

  ctx.ellipse(
    -headW * 0.43,
    earY,
    earW,
    earH,
    -0.20,
    0,
    Math.PI * 2,
  );

  ctx.fill();

  /*
   * Right ear.
   */
  ctx.beginPath();

  ctx.ellipse(
    headW * 0.43,
    earY,
    earW,
    earH,
    0.20,
    0,
    Math.PI * 2,
  );

  ctx.fill();

  /*
   * Inner ear highlight.
   */
  if (h > 20) {
    ctx.fillStyle = shadeHex(baseColor, 15);

    ctx.beginPath();
    ctx.ellipse(
      -headW * 0.43,
      earY,
      earW * 0.48,
      earH * 0.52,
      -0.20,
      0,
      Math.PI * 2,
    );
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(
      headW * 0.43,
      earY,
      earW * 0.48,
      earH * 0.52,
      0.20,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  /*
   * ---------------------------------------------------------
   * BACK OF HEAD DETAIL
   * ---------------------------------------------------------
   *
   * Small hair tuft / antenna.
   */

  const tuftBounce =
    Math.sin(phase * 1.5) * h * 0.025;

  ctx.fillStyle = darkerColor;

  ctx.beginPath();

  ctx.moveTo(-h * 0.06, headTop + h * 0.015);

  ctx.quadraticCurveTo(
    -h * 0.12,
    headTop - h * 0.07 + tuftBounce,
    0,
    headTop - h * 0.03 + tuftBounce,
  );

  ctx.quadraticCurveTo(
    h * 0.12,
    headTop - h * 0.07 + tuftBounce,
    h * 0.06,
    headTop + h * 0.015,
  );

  ctx.closePath();
  ctx.fill();

  /*
   * ---------------------------------------------------------
   * BACK HIGHLIGHT
   * ---------------------------------------------------------
   *
   * Gives the character a polished toy-like appearance.
   */

  if (h > 16) {
    ctx.fillStyle = "rgba(255,255,255,0.20)";

    ctx.beginPath();

    ctx.ellipse(
      -headW * 0.18,
      headTop + h * 0.18,
      headW * 0.14,
      h * 0.075,
      -0.35,
      0,
      Math.PI * 2,
    );

    ctx.fill();
  }

  /*
   * ---------------------------------------------------------
   * TAIL / BOUNCY ACCESSORY
   * ---------------------------------------------------------
   *
   * Positioned below the backpack so it is visible from the
   * rear even when the character is small.
   */

  const tailX =
    Math.sin(phase * 1.3) * h * 0.025;

  const tailY =
    bodyBottom - h * 0.07;

  const tailSize = Math.max(2, h * 0.075);

  ctx.fillStyle = lightColor;

  ctx.beginPath();

  ctx.arc(
    tailX,
    tailY,
    tailSize,
    0,
    Math.PI * 2,
  );

  ctx.fill();

  /*
   * ---------------------------------------------------------
   * RESTORE
   * ---------------------------------------------------------
   */

  ctx.restore();

  /*
   * ---------------------------------------------------------
   * YOU MARKER
   * ---------------------------------------------------------
   */

  if (label) {
    const markerTop =
      groundY -
      bounce -
      h * 1.02;

    drawYouMarker(
      ctx,
      cx + sway,
      markerTop,
      h,
    );
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
    const inset = Math.max(2, h * 0.07);
    ctx.beginPath();
    ctx.roundRect(
      panelX + inset,
      panelTop + inset,
      panelW - inset * 2,
      panelH - inset * 2,
      Math.max(2, radius - inset * 0.5),
    );
    ctx.fillStyle = fill;
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.roundRect(panelX, panelTop, panelW, panelH, radius);
    ctx.fillStyle = fill;
    ctx.fill();
  }

  const label =
    gate.state === "hit-correct" ? "✓" : gate.state === "hit-wrong" ? "✕" : String(gate.value);
  const fs = Math.max(8, h * (label.length > 2 ? 0.42 : 0.52));
  ctx.font = `900 ${fs}px "Baloo 2", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = Math.max(1, fs * 0.18);
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.strokeText(label, x, panelTop + panelH * 0.52);
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
    ctx.arc(cx + Math.cos(a) * r, groundY - scale * 0.55 + Math.sin(a) * r * 0.7, scale * 0.06 * life, 0, Math.PI * 2);
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
  const h = Math.max(10, scale);
  const good = kind === "+1" || kind === "+5" || kind === "x2";
  const y = groundY - h * 0.9 - Math.sin(t * 3) * h * 0.1;
  const fs = Math.max(10, h * 0.7);
  ctx.save();
  ctx.font = `900 ${fs}px "Baloo 2", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = fs * 0.24;
  ctx.strokeStyle = "rgba(0,0,0,0.6)";
  ctx.strokeText(kind, cx, y);
  ctx.fillStyle = good ? "#ffe066" : "#ff6b6b";
  ctx.fillText(kind, cx, y);
  ctx.restore();
}

const BUNTING = ["#ff5c8a", "#ffe066", "#3a86ff", "#2ec4b6", "#ff8c42", "#f7f3e3"];

/** Race finish gantry: posts, FINISH banner, cheer ropes / bunting. */
function drawFinishGate(
  ctx: CanvasRenderingContext2D,
  roadCx: number,
  groundY: number,
  roadHalfW: number,
  t: number,
) {
  const w = Math.max(8, roadHalfW);
  const postX = w * 1.05;
  const left = roadCx - postX;
  const right = roadCx + postX;
  const postW = Math.max(3, w * 0.055);
  const postH = Math.max(28, w * 1.15);
  const topY = groundY - postH;
  const bannerH = Math.max(10, w * 0.22);
  const bannerTop = topY + postH * 0.08;
  const sway = Math.sin(t * 2.4) * w * 0.012;

  ctx.save();

  // soft post shadows
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.ellipse(left, groundY + 2, postW * 1.4, postW * 0.55, 0, 0, Math.PI * 2);
  ctx.ellipse(right, groundY + 2, postW * 1.4, postW * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();

  // posts
  const postGrad = (x: number) => {
    const g = ctx.createLinearGradient(x - postW / 2, topY, x + postW / 2, groundY);
    g.addColorStop(0, "#f0ebe0");
    g.addColorStop(0.45, "#c9c0b0");
    g.addColorStop(1, "#6a6258");
    return g;
  };
  ctx.fillStyle = postGrad(left);
  ctx.fillRect(left - postW / 2, topY, postW, postH);
  ctx.fillStyle = postGrad(right);
  ctx.fillRect(right - postW / 2, topY, postW, postH);

  // crossbar
  const barH = Math.max(4, w * 0.04);
  ctx.fillStyle = "#2a2620";
  ctx.fillRect(left - postW / 2, bannerTop - barH, right - left + postW, barH);

  // FINISH banner with checkered ends
  const bannerLeft = left + postW * 0.15;
  const bannerRight = right - postW * 0.15;
  const bannerW = bannerRight - bannerLeft;
  ctx.fillStyle = "#1b1b1b";
  ctx.fillRect(bannerLeft, bannerTop, bannerW, bannerH);
  const cells = 10;
  const cellW = bannerW / cells;
  for (let row = 0; row < 2; row++) {
    for (let c = 0; c < cells; c++) {
      if ((c + row) % 2 === 0) continue;
      ctx.fillStyle = "#f8f8f8";
      ctx.fillRect(
        bannerLeft + c * cellW,
        bannerTop + row * bannerH * 0.5,
        cellW + 0.5,
        bannerH * 0.5,
      );
    }
  }
  // center panel for text
  const panelPad = bannerW * 0.22;
  ctx.fillStyle = "#1b1b1b";
  ctx.fillRect(bannerLeft + panelPad, bannerTop + bannerH * 0.08, bannerW - panelPad * 2, bannerH * 0.84);
  const fs = Math.max(8, bannerH * 0.55);
  ctx.font = `900 ${fs}px "Baloo 2", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffe066";
  ctx.fillText("FINISH", roadCx, bannerTop + bannerH * 0.52);

  // cheer ropes / bunting drooping between posts
  const ropeY = bannerTop + bannerH + Math.max(6, w * 0.06);
  const midY = ropeY + w * 0.18 + sway;
  ctx.strokeStyle = "#f7f3e3";
  ctx.lineWidth = Math.max(1.2, w * 0.012);
  ctx.beginPath();
  ctx.moveTo(left, ropeY);
  ctx.quadraticCurveTo(roadCx, midY, right, ropeY);
  ctx.stroke();

  const flags = 9;
  for (let i = 1; i < flags; i++) {
    const u = i / flags;
    // sample droop on the quadratic (approx along control)
    const fx = left + (right - left) * u;
    const fy = (1 - u) * (1 - u) * ropeY + 2 * (1 - u) * u * midY + u * u * ropeY;
    const fh = Math.max(4, w * 0.09);
    const fw = Math.max(3, w * 0.045);
    ctx.fillStyle = BUNTING[i % BUNTING.length] as string;
    ctx.beginPath();
    ctx.moveTo(fx - fw, fy);
    ctx.lineTo(fx + fw, fy);
    ctx.lineTo(fx, fy + fh);
    ctx.closePath();
    ctx.fill();
  }

  // second lighter rope higher for density
  const rope2Y = ropeY + w * 0.04;
  const mid2Y = rope2Y + w * 0.1 - sway * 0.6;
  ctx.strokeStyle = "rgba(247,243,227,0.7)";
  ctx.lineWidth = Math.max(1, w * 0.008);
  ctx.beginPath();
  ctx.moveTo(left, rope2Y);
  ctx.quadraticCurveTo(roadCx, mid2Y, right, rope2Y);
  ctx.stroke();

  ctx.restore();
}

export function render(
  ctx: CanvasRenderingContext2D,
  state: RaceState,
  width: number,
  height: number,
) {
  const segments = state.segments;
  const player = state.player;
  const cameraZ = player.z - SEG_LENGTH * 2.6;
  const baseIndex = Math.max(0, Math.floor(cameraZ / SEG_LENGTH));
  const baseSeg = segments[Math.min(baseIndex, segments.length - 1)] as Segment;
  const cameraY = baseSeg.y1 + CAMERA_HEIGHT;
  const cameraX = player.x * ROAD_WIDTH;

  // ---- sky + horizon ----
  const sky = ctx.createLinearGradient(0, 0, 0, height * 0.62);
  sky.addColorStop(0, "#0d3b2e");
  sky.addColorStop(0.55, "#1d6b4f");
  sky.addColorStop(1, "#5aa96b");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = COLORS.grassDark;
  ctx.fillRect(0, height * 0.42, width, height);

  // ---- road ----
  let x = 0;
  let dx = 0;
  let maxY = height;
  const projected: (Proj | null)[] = new Array(DRAW_DISTANCE).fill(null);
  const projZ: number[] = new Array(DRAW_DISTANCE).fill(0);

  let prev: Proj | null = null;
  let prevZ = 0;

  for (let n = 0; n < DRAW_DISTANCE; n++) {
    const idx = baseIndex + n;
    if (idx >= segments.length - 1) break;
    const seg = segments[idx] as Segment;

    const z1 = idx * SEG_LENGTH;
    const z2 = z1 + SEG_LENGTH;
    const p1 = project(seg.y1, z1, cameraX - x, cameraY, cameraZ, width, height);
    x += dx;
    dx += seg.curve;
    const p2 = project(seg.y2, z2, cameraX - x, cameraY, cameraZ, width, height);

    projected[n] = p2;
    projZ[n] = z2;

    if (prev && p2.y < maxY && p2.y < prev.y) {
      const a = prev;
      const b = p2;
      const dark = Math.floor(idx / 3) % 2 === 0;
      // grass
      polygon(ctx, 0, a.y, width, a.y, width, b.y, 0, b.y, dark ? COLORS.grassLight : COLORS.grassDark);
      // rumble
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
      // road
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
      // lane markers
      if (dark) {
        ctx.fillStyle = COLORS.lane;
        for (let l = 1; l < LANES; l++) {
          const f = -1 + (2 * l) / LANES;
          const lw1 = Math.max(0.6, a.w * 0.012);
          const lw2 = Math.max(0.6, b.w * 0.012);
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
      if (state.challenge && z2 < gateZ + SEG_LENGTH && z2 > gateZ - SEG_LENGTH * 16 && z1 > player.z - SEG_LENGTH) {
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
      // finish line band (one segment before logical track end so it is always drawable)
      const finishBandZ = state.trackLength - SEG_LENGTH * 2;
      if (z2 >= finishBandZ && prevZ < finishBandZ) {
        polygon(ctx, a.x - a.w, a.y, a.x + a.w, a.y, b.x + b.w, b.y, b.x - b.w, b.y, "#f8f8f8");
        const cells = 8;
        ctx.fillStyle = "#1b1b1b";
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
            "#1b1b1b",
          );
        }
      }
      maxY = b.y;
    }
    prev = p2;
    prevZ = z2;
  }

  // ---- distant canopy backdrop + horizon fog ----
  const horizonY = maxY;
  drawCanopy(ctx, width, horizonY, player.z);
  const fog = ctx.createLinearGradient(0, horizonY - height * 0.05, 0, horizonY + height * 0.12);
  fog.addColorStop(0, "rgba(200,230,205,0.55)");
  fog.addColorStop(1, "rgba(200,230,205,0)");
  ctx.fillStyle = fog;
  ctx.fillRect(0, horizonY - height * 0.05, width, height * 0.18);

  // ---- sprite helper ----
  const spriteAt = (z: number, offsetX: number) => {
    const n = Math.floor((z - baseIndex * SEG_LENGTH) / SEG_LENGTH);
    if (n < 1 || n >= DRAW_DISTANCE) return null;
    const p = projected[n];
    const pPrev = projected[n - 1];
    if (!p || !pPrev) return null;
    const pct = ((z % SEG_LENGTH) + SEG_LENGTH) % SEG_LENGTH / SEG_LENGTH;
    const scale = pPrev.scale + (p.scale - pPrev.scale) * pct;
    const sx = pPrev.x + (p.x - pPrev.x) * pct;
    const sy = pPrev.y + (p.y - pPrev.y) * pct;
    const w = pPrev.w + (p.w - pPrev.w) * pct;
    return { x: sx + offsetX * w, y: sy, scale: scale * height * 0.9, w };
  };

  // draw items and racers back-to-front
  type Draw = { z: number; fn: () => void };
  const draws: Draw[] = [];

  for (const item of state.items) {
    if (item.taken) continue;
    const s = spriteAt(item.z, item.x);
    if (!s) continue;
    draws.push({
      z: item.z,
      fn: () => drawItem(ctx, s.x, s.y, s.scale * 0.5, item.kind, state.elapsed),
    });
  }

  const allGates = [
    ...(state.challenge ? state.challenge.gates : []),
    ...state.fxGates,
  ];
  for (const gate of allGates) {
    const s = spriteAt(gate.z, gate.x);
    if (!s) continue;
    // Clear air gap between neighboring lanes; cap near-field size so they stay clean
    const laneW = (s.w * 2) / LANES;
    const gateScale = Math.max(4, Math.min(laneW * 0.34, height * 0.115));
    draws.push({
      z: gate.z,
      fn: () => drawAnswerGate(ctx, s.x, s.y, gateScale, gate, state.elapsed),
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
  // Sit 2 segments before trackLength so projection stays on drawable segments
  {
    const finishZ = state.trackLength - SEG_LENGTH * 2;
    const s = spriteAt(finishZ, 0);
    if (s) {
      draws.push({
        z: finishZ,
        fn: () => drawFinishGate(ctx, s.x, s.y, s.w, state.elapsed),
      });
    }
  }

  for (const r of state.racers) {
    if (r.isPlayer) continue;
    const s = spriteAt(r.z, r.x);
    if (!s) continue;
    draws.push({
      z: r.z,
      fn: () => drawCharacter(ctx, s.x, s.y, s.scale * 0.5, r, null),
    });
  }

  draws.sort((a, b) => b.z - a.z);
  for (const d of draws) d.fn();

  // player is camera-locked: always centered, fixed size, rock steady
  drawCharacter(ctx, width / 2, height * 0.7, height * 0.16, player, "YOU");

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


function drawCanopy(
  ctx: CanvasRenderingContext2D,
  width: number,
  horizonY: number,
  z: number,
) {
  const shift = (z * 0.02) % (width * 2);
  ctx.save();
  ctx.fillStyle = "#0b3326";
  for (let i = -2; i < 8; i++) {
    const cx = ((i * width) / 3 - shift * 0.15 + width * 4) % (width * 2) - width * 0.5;
    const r = width * 0.3;
    ctx.beginPath();
    ctx.ellipse(cx, horizonY + 2, r, r * 0.5, 0, Math.PI, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#061f18";
  for (let i = -2; i < 10; i++) {
    const cx = ((i * width) / 4 - shift * 0.28 + width * 4) % (width * 2) - width * 0.5;
    const r = width * 0.18;
    ctx.beginPath();
    ctx.ellipse(cx, horizonY + 4, r, r * 0.7, 0, Math.PI, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
