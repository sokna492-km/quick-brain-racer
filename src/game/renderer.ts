/**
 * Canvas pseudo-3D renderer for the KruMath race.
 * Projects road segments outrun-style and draws characters as sprites.
 */

import {
  ROAD_WIDTH,
  SEG_LENGTH,
  LANES,
  type RaceState,
  type Racer,
  type Segment,
} from "./raceEngine";

const DRAW_DISTANCE = 190;
const CAMERA_HEIGHT = 1150;
const FIELD_OF_VIEW = 100;
const CAMERA_DEPTH = 1 / Math.tan(((FIELD_OF_VIEW / 2) * Math.PI) / 180);

type Proj = { x: number; y: number; w: number; scale: number };

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

function drawCharacter(
  ctx: CanvasRenderingContext2D,
  cx: number,
  groundY: number,
  scale: number,
  racer: Racer,
  label: string | null,
  place: number,
) {
  const h = Math.max(10, scale);
  const w = h * 0.78;
  const hop = Math.abs(Math.sin(racer.bob)) * h * 0.14;
  const y = groundY - hop;

  ctx.save();
  // shadow
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(cx, groundY, w * 0.5, h * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();

  // body
  const grad = ctx.createLinearGradient(cx, y - h, cx, y);
  grad.addColorStop(0, "#ffffff55");
  grad.addColorStop(0.25, racer.color);
  grad.addColorStop(1, "#00000033");
  ctx.fillStyle = racer.color;
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.5, y);
  ctx.quadraticCurveTo(cx - w * 0.58, y - h * 0.72, cx, y - h);
  ctx.quadraticCurveTo(cx + w * 0.58, y - h * 0.72, cx + w * 0.5, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = grad;
  ctx.fill();

  // legs
  const swing = Math.sin(racer.bob) * h * 0.16;
  ctx.strokeStyle = racer.color;
  ctx.lineWidth = Math.max(1, h * 0.11);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.18, y - h * 0.05);
  ctx.lineTo(cx - w * 0.18 + swing, y + h * 0.14);
  ctx.moveTo(cx + w * 0.18, y - h * 0.05);
  ctx.lineTo(cx + w * 0.18 - swing, y + h * 0.14);
  ctx.stroke();

  // eyes
  if (h > 22) {
    ctx.fillStyle = "#1b1b1b";
    const ey = y - h * 0.62;
    ctx.beginPath();
    ctx.ellipse(cx - w * 0.16, ey, h * 0.05, h * 0.07, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + w * 0.16, ey, h * 0.05, h * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  if (label) {
    const fs = Math.max(11, Math.min(26, h * 0.42));
    ctx.font = `800 ${fs}px "Baloo 2", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.lineWidth = fs * 0.28;
    ctx.strokeStyle = "rgba(0,0,0,0.65)";
    ctx.strokeText(label, cx, y - h * 1.18);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, cx, y - h * 1.18);
    ctx.font = `800 ${fs * 0.8}px "Baloo 2", system-ui, sans-serif`;
    ctx.strokeText(`${place}`, cx, y - h * 1.18 - fs);
    ctx.fillStyle = "#ffe066";
    ctx.fillText(`${place}`, cx, y - h * 1.18 - fs);
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
      // finish line band
      if (z2 >= state.trackLength && prevZ < state.trackLength) {
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
    return { x: sx + offsetX * w, y: sy, scale: scale * height * 0.9 };
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

  for (const r of state.racers) {
    if (r.isPlayer) continue;
    const s = spriteAt(r.z, r.x);
    if (!s) continue;
    draws.push({
      z: r.z,
      fn: () => drawCharacter(ctx, s.x, s.y, s.scale * 0.5, r, null, r.place),
    });
  }

  draws.sort((a, b) => b.z - a.z);
  for (const d of draws) d.fn();

  // player is camera-locked: always centered, fixed size, rock steady
  drawCharacter(ctx, width / 2, height * 0.88, height * 0.19, player, "YOU", player.place);

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
  ctx.fillStyle = "#12513a";
  for (let i = -2; i < 8; i++) {
    const cx = ((i * width) / 3 - shift * 0.15 + width * 4) % (width * 2) - width * 0.5;
    const r = width * 0.22;
    ctx.beginPath();
    ctx.ellipse(cx, horizonY + 2, r, r * 0.42, 0, Math.PI, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#0e3f2e";
  for (let i = -2; i < 10; i++) {
    const cx = ((i * width) / 4 - shift * 0.28 + width * 4) % (width * 2) - width * 0.5;
    const r = width * 0.13;
    ctx.beginPath();
    ctx.ellipse(cx, horizonY + 4, r, r * 0.55, 0, Math.PI, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
