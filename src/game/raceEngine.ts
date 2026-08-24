/**
 * Pseudo-3D racing simulation. Pure state + delta-time updates, no rendering,
 * no DOM. All movement is frame-rate independent.
 */

export const SEG_LENGTH = 200;
export const ROAD_WIDTH = 2200;
export const LANES = 4;
export const TOTAL_SEGMENTS = 3400;
export const BASE_SPEED = 9200;

export type Segment = {
  index: number;
  curve: number;
  y1: number;
  y2: number;
};

export type ItemKind = "+1" | "+5" | "x2" | "-2" | "/2";

export type TrackItem = {
  z: number;
  x: number;
  kind: ItemKind;
  taken: boolean;
};

export type Racer = {
  id: number;
  name: string;
  color: string;
  z: number;
  x: number;
  targetX: number;
  speed: number;
  isPlayer: boolean;
  place: number;
  finishTime: number | null;
  bob: number;
  ai: { accuracy: number; interval: number; timer: number; boost: number } | null;
};

export type Pop = { text: string; good: boolean; life: number; x: number; y: number };

export type RaceState = {
  segments: Segment[];
  items: TrackItem[];
  racers: Racer[];
  trackLength: number;
  player: Racer;
  boost: number;
  multiplier: number;
  multiplierTimer: number;
  score: number;
  combo: number;
  elapsed: number;
  pops: Pop[];
  finished: boolean;
};

const rnd = (min: number, max: number) => Math.random() * (max - min) + min;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const laneX = (lane: number) => -0.6 + (lane * 1.2) / (LANES - 1);

const PALETTE = ["#ffd23f", "#3a86ff", "#ff5c8a", "#2ec4b6", "#ff8c42"];
const NAMES = ["Zip", "Bolt", "Nova", "Pixel"];

function buildTrack(): Segment[] {
  const segments: Segment[] = [];
  let curve = 0;
  let targetCurve = 0;
  let hold = 0;
  let y = 0;
  let hillDir = rnd(-1, 1);
  for (let i = 0; i < TOTAL_SEGMENTS; i++) {
    if (hold-- <= 0) {
      hold = Math.floor(rnd(90, 260));
      targetCurve = Math.random() < 0.25 ? 0 : rnd(-3.6, 3.6);
      hillDir = rnd(-1, 1);
    }
    curve += (targetCurve - curve) * 0.02;
    const prevY = y;
    y += hillDir * 7;
    y = clamp(y, -1400, 1400);
    segments.push({ index: i, curve, y1: prevY, y2: y });
  }
  return segments;
}

function buildItems(trackLength: number): TrackItem[] {
  const items: TrackItem[] = [];
  const kinds: ItemKind[] = ["+1", "+1", "+5", "x2", "-2", "/2"];
  for (let z = SEG_LENGTH * 90; z < trackLength - SEG_LENGTH * 60; z += rnd(4200, 9000)) {
    const kind = kinds[Math.floor(Math.random() * kinds.length)] as ItemKind;
    items.push({ z, x: laneX(Math.floor(rnd(0, LANES))), kind, taken: false });
  }
  return items;
}

export function createRace(): RaceState {
  const segments = buildTrack();
  const trackLength = TOTAL_SEGMENTS * SEG_LENGTH;
  const racers: Racer[] = [];

  const playerLane = 1;
  const player: Racer = {
    id: 0,
    name: "YOU",
    color: "#ffffff",
    z: 0,
    x: laneX(playerLane),
    targetX: laneX(playerLane),
    speed: BASE_SPEED,
    isPlayer: true,
    place: 1,
    finishTime: null,
    bob: 0,
    ai: null,
  };
  racers.push(player);

  const lanes = [0, 2, 3, Math.random() < 0.5 ? 0 : 3];
  for (let i = 0; i < 4; i++) {
    const skill = rnd(0.45, 0.95);
    racers.push({
      id: i + 1,
      name: NAMES[i] as string,
      color: PALETTE[i] as string,
      z: rnd(-400, 400),
      x: laneX(lanes[i] as number) + rnd(-0.08, 0.08),
      targetX: laneX(lanes[i] as number),
      speed: BASE_SPEED,
      isPlayer: false,
      place: 1,
      finishTime: null,
      bob: 0,
      ai: { accuracy: skill, interval: rnd(2.0, 4.2), timer: rnd(0, 2), boost: 0 },
    });
  }

  return {
    segments,
    items: buildItems(trackLength),
    racers,
    trackLength,
    player,
    boost: 0,
    multiplier: 1,
    multiplierTimer: 0,
    score: 0,
    combo: 0,
    elapsed: 0,
    pops: [],
    finished: false,
  };
}

export function addPop(state: RaceState, text: string, good: boolean) {
  state.pops.push({ text, good, life: 1, x: rnd(-0.15, 0.15), y: 0 });
  if (state.pops.length > 6) state.pops.shift();
}

/** Correct answer -> boost. seconds = response time. */
export function applyCorrect(state: RaceState, seconds: number, level: number) {
  const fast = seconds < 2.0;
  const gain = fast ? 0.5 : seconds < 4 ? 0.34 : 0.2;
  state.boost = Math.min(1, state.boost + gain);
  state.combo += 1;
  const base = 50 + Math.round(level * 12);
  const speedBonus = Math.max(0, Math.round((5 - seconds) * 20));
  const comboBonus = Math.min(200, state.combo * 15);
  state.score += Math.round((base + speedBonus + comboBonus) * state.multiplier);
  addPop(state, fast ? "✓ TURBO" : "✓ +BOOST", true);
}

export function applyWrong(state: RaceState) {
  state.boost = Math.max(-0.42, state.boost - 0.55);
  state.combo = 0;
  state.score = Math.max(0, state.score - 20);
  addPop(state, "✕ SLOW DOWN", false);
}

function segmentAt(state: RaceState, z: number): Segment {
  const i = clamp(Math.floor(z / SEG_LENGTH), 0, state.segments.length - 1);
  return state.segments[i] as Segment;
}

export function update(state: RaceState, dt: number, steer: number) {
  state.elapsed += dt;

  // boost decays smoothly back to neutral
  state.boost += (0 - state.boost) * Math.min(1, dt * 0.55);
  if (Math.abs(state.boost) < 0.002) state.boost = 0;

  if (state.multiplierTimer > 0) {
    state.multiplierTimer = Math.max(0, state.multiplierTimer - dt);
    if (state.multiplierTimer === 0) state.multiplier = 1;
  }

  const p = state.player;

  // ---- player longitudinal ----
  const targetSpeed = BASE_SPEED * (1 + state.boost * 0.62);
  p.speed += (targetSpeed - p.speed) * Math.min(1, dt * 3.2);

  // ---- player lateral (smooth, no jitter) ----
  p.targetX = clamp(p.targetX + steer * dt * 1.5, -0.92, 0.92);
  const curve = segmentAt(state, p.z).curve;
  const centrifugal = -curve * (p.speed / BASE_SPEED) * 0.09;
  const desired = clamp(p.targetX + centrifugal * dt * 6, -0.98, 0.98);
  p.x += (desired - p.x) * Math.min(1, dt * 8);
  p.bob += dt * (p.speed / BASE_SPEED) * 9;

  if (p.finishTime === null) {
    p.z += p.speed * dt;
    if (p.z >= state.trackLength) {
      p.z = state.trackLength;
      p.finishTime = state.elapsed;
    }
  }

  // ---- track items ----
  for (const item of state.items) {
    if (item.taken) continue;
    if (p.z > item.z && p.z - p.speed * dt <= item.z + 1) {
      if (Math.abs(p.x - item.x) < 0.28) {
        item.taken = true;
        applyItem(state, item.kind);
      }
    } else if (p.z > item.z + SEG_LENGTH * 3) {
      item.taken = true;
    }
  }

  // ---- AI ----
  for (const r of state.racers) {
    if (!r.ai) continue;
    r.ai.timer -= dt;
    if (r.ai.timer <= 0) {
      r.ai.timer = r.ai.interval * rnd(0.75, 1.3);
      const success = Math.random() < r.ai.accuracy;
      r.ai.boost = clamp(r.ai.boost + (success ? rnd(0.2, 0.45) : -rnd(0.15, 0.4)), -0.35, 0.85);
      if (Math.random() < 0.25) r.targetX = laneX(Math.floor(rnd(0, LANES)));
    }
    r.ai.boost += (0 - r.ai.boost) * Math.min(1, dt * 0.5);
    const t = BASE_SPEED * (0.94 + r.ai.boost * 0.55);
    r.speed += (t - r.speed) * Math.min(1, dt * 2.4);
    r.x += (r.targetX - r.x) * Math.min(1, dt * 2.2);
    r.bob += dt * (r.speed / BASE_SPEED) * 9;
    if (r.finishTime === null) {
      r.z += r.speed * dt;
      if (r.z >= state.trackLength) {
        r.z = state.trackLength;
        r.finishTime = state.elapsed;
      }
    }
  }

  // ---- placements ----
  const order = [...state.racers].sort((a, b) => {
    if (a.finishTime !== null && b.finishTime !== null) return a.finishTime - b.finishTime;
    if (a.finishTime !== null) return -1;
    if (b.finishTime !== null) return 1;
    return b.z - a.z;
  });
  order.forEach((r, i) => (r.place = i + 1));

  // ---- pops ----
  for (const pop of state.pops) {
    pop.life -= dt * 0.9;
    pop.y += dt * 0.5;
  }
  state.pops = state.pops.filter((pop) => pop.life > 0);

  if (p.finishTime !== null) state.finished = true;
}

function applyItem(state: RaceState, kind: ItemKind) {
  switch (kind) {
    case "+1":
      state.score += Math.round(30 * state.multiplier);
      state.boost = Math.min(1, state.boost + 0.12);
      addPop(state, "+1", true);
      break;
    case "+5":
      state.score += Math.round(120 * state.multiplier);
      state.boost = Math.min(1, state.boost + 0.25);
      addPop(state, "+5", true);
      break;
    case "x2":
      state.multiplier = 2;
      state.multiplierTimer = 8;
      addPop(state, "×2 SCORE", true);
      break;
    case "-2":
      state.score = Math.max(0, state.score - 60);
      state.boost = Math.max(-0.35, state.boost - 0.22);
      addPop(state, "−2", false);
      break;
    case "/2":
      state.boost = state.boost > 0 ? state.boost / 2 : state.boost - 0.1;
      addPop(state, "÷2 BOOST", false);
      break;
  }
}

export const progress = (state: RaceState) => clamp(state.player.z / state.trackLength, 0, 1);
export const ordinal = (n: number) => ["1st", "2nd", "3rd", "4th", "5th"][n - 1] ?? `${n}th`;
