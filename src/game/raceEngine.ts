/**
 * Pseudo-3D racing simulation. Pure state + delta-time updates, no rendering,
 * no DOM. All movement is frame-rate independent.
 */

import type { Question } from "./mathEngine";

export const SEG_LENGTH = 200;
export const ROAD_WIDTH = 2200;
export const LANES = 4;
export const GATE_DRAW_SEGMENTS = 250;

const TOTAL_SEGMENTS = 3400;
export const BASE_SPEED = 9200;

const LANE_FOLLOW = 11;
const LANE_HOLD_REPEAT = 0.12;
const GATE_HIT_RADIUS = 0.2;
const MIN_LOOKAHEAD_Z = 14000;
const MAX_VISIBLE_Z = (GATE_DRAW_SEGMENTS - 25) * SEG_LENGTH;
const MIN_GATE_GAP = 9000;
const FINISH_MARGIN = SEG_LENGTH * 50;
const ITEM_CLEAR_RANGE = SEG_LENGTH * 32;

export type EnvironmentZone = "suburb" | "tropical" | "town" | "highway";

export type RoadsideKind =
  "tree" | "palm" | "bush" | "rock" | "lamp" | "sign" | "house" | "stall" | "fence" | "pole";

export type RoadsideProp = {
  kind: RoadsideKind;
  side: -1 | 1;
  offset: number;
  /** Visual variant (e.g. house 0..2). */
  variant?: number;
};

export type Segment = {
  index: number;
  curve: number;
  y1: number;
  y2: number;
  zone: EnvironmentZone;
  props: RoadsideProp[];
};

export type ItemKind = "+1" | "+5" | "x2" | "-2" | "/2";

export type TrackItem = {
  z: number;
  x: number;
  kind: ItemKind;
  taken: boolean;
};

export type GateState = "idle" | "hit-correct" | "hit-wrong" | "fading";

export type AnswerGate = {
  z: number;
  lane: 0 | 1 | 2 | 3;
  x: number;
  value: number;
  correct: boolean;
  state: GateState;
  fade: number;
};

export type Challenge = {
  question: Question;
  spawnedAt: number;
  spawnZ: number;
  gates: [AnswerGate, AnswerGate, AnswerGate, AnswerGate];
  resolved: boolean;
  approachTime: number;
  correctTime: number;
};

export type Burst = {
  x: number;
  z: number;
  life: number;
  good: boolean;
};

export type Racer = {
  id: number;
  name: string;
  color: string;
  z: number;
  x: number;
  targetX: number;
  lane: number;
  speed: number;
  isPlayer: boolean;
  place: number;
  finishTime: number | null;
  bob: number;
  stumble: number;
  ai: { accuracy: number; interval: number; timer: number; boost: number } | null;
};

export type Pop = { text: string; good: boolean; life: number; x: number; y: number };

export type MathResolve = {
  correct: boolean;
  seconds: number;
};

export type RaceState = {
  segments: Segment[];
  items: TrackItem[];
  racers: Racer[];
  trackLength: number;
  player: Racer;
  boost: number;
  /** Stacks on wrong/miss only; slows speed without changing max boost when cleared. */
  wrongDrag: number;
  multiplier: number;
  multiplierTimer: number;
  score: number;
  combo: number;
  elapsed: number;
  pops: Pop[];
  bursts: Burst[];
  fxGates: AnswerGate[];
  challenge: Challenge | null;
  lastGateZ: number;
  lastResolve: MathResolve | null;
  laneHoldTimer: number;
  laneHoldArmed: boolean;
  spawnClosed: boolean;
  finished: boolean;
};

const rnd = (min: number, max: number) => Math.random() * (max - min) + min;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
/** Lane midpoints in road-x [-1,1], matching renderer dividers at -1+(2*l)/LANES. */
const laneX = (lane: number) => -1 + (2 * lane + 1) / LANES;

const PALETTE = ["#ffd23f", "#3a86ff", "#ff5c8a", "#2ec4b6", "#ff8c42"];
const NAMES = ["Zip", "Bolt", "Nova", "Pixel"];

const TRACK_PATTERNS: { curve: number; length: number; hill: number }[] = [
  { curve: 0, length: 180, hill: 0 },
  { curve: 1.2, length: 120, hill: 0 },
  { curve: 2.8, length: 180, hill: 0 },
  { curve: 0, length: 100, hill: 420 },
  { curve: -1.8, length: 140, hill: 0 },
  { curve: -3.0, length: 160, hill: 0 },
  { curve: 0, length: 150, hill: 0 },
  { curve: 2.2, length: 130, hill: 280 },
  { curve: 0, length: 90, hill: 0 },
  { curve: -1.2, length: 110, hill: 0 },
  { curve: -2.6, length: 170, hill: 0 },
  { curve: 0, length: 200, hill: 520 },
];

function getEnvironmentZone(index: number): EnvironmentZone {
  const progress = index / TOTAL_SEGMENTS;
  if (progress < 0.25) return "suburb";
  if (progress < 0.5) return "tropical";
  if (progress < 0.75) return "town";
  return "highway";
}

/** Stable 0..1 hash from segment index (no Math.random at draw time). */
function segNoise(i: number, salt = 0): number {
  const n = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function zoneProps(zone: EnvironmentZone, index: number): RoadsideProp[] {
  const density = zone === "town" ? 5 : zone === "tropical" ? 7 : zone === "suburb" ? 9 : 14;
  if (Math.floor(segNoise(index, 1) * density) !== 0) return [];

  const side: -1 | 1 = segNoise(index, 2) < 0.5 ? -1 : 1;
  // Keep sprites clear of the asphalt (wide houses need more clearance)
  const offset = 1.85 + segNoise(index, 3) * 1.15;
  const roll = segNoise(index, 4);
  let kind: RoadsideKind = "tree";
  let variant: number | undefined;

  if (zone === "suburb") {
    kind = roll < 0.35 ? "tree" : roll < 0.55 ? "fence" : roll < 0.75 ? "house" : "bush";
  } else if (zone === "tropical") {
    kind = roll < 0.4 ? "palm" : roll < 0.6 ? "stall" : roll < 0.8 ? "bush" : "tree";
  } else if (zone === "town") {
    kind =
      roll < 0.25
        ? "lamp"
        : roll < 0.45
          ? "pole"
          : roll < 0.65
            ? "sign"
            : roll < 0.85
              ? "house"
              : "stall";
  } else {
    kind = roll < 0.45 ? "rock" : roll < 0.75 ? "tree" : "bush";
  }

  if (kind === "house") {
    variant = Math.floor(segNoise(index, 12) * 3);
    // Extra push out so wide facades don't spill onto the lane
  }

  const props: RoadsideProp[] = [
    kind === "house"
      ? { kind, side, offset: offset + 0.35, variant: variant ?? 0 }
      : { kind, side, offset },
  ];
  // Occasional second prop on the opposite side
  if (segNoise(index, 5) < 0.28 && zone !== "highway") {
    props.push({
      kind: zone === "tropical" ? "bush" : zone === "town" ? "pole" : "tree",
      side: side === -1 ? 1 : -1,
      offset: 1.9 + segNoise(index, 6) * 0.8,
    });
  }
  return props;
}

function buildTrack(): Segment[] {
  // Shuffle pattern order once per race for variety while keeping designed shapes.
  const order = TRACK_PATTERNS.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rnd(0, i + 1));
    const tmp = order[i] as number;
    order[i] = order[j] as number;
    order[j] = tmp;
  }

  type Step = { targetCurve: number; hillDelta: number };
  const steps: Step[] = [];
  let pi = 0;
  while (steps.length < TOTAL_SEGMENTS) {
    const pat = TRACK_PATTERNS[
      order[pi % order.length] as number
    ] as (typeof TRACK_PATTERNS)[number];
    pi++;
    const len = Math.min(pat.length, TOTAL_SEGMENTS - steps.length);
    let prevHill = 0;
    for (let k = 0; k < len; k++) {
      const t = len <= 1 ? 0 : k / (len - 1);
      const hillY = pat.hill > 0 ? Math.sin(t * Math.PI) * pat.hill : 0;
      steps.push({ targetCurve: pat.curve, hillDelta: hillY - prevHill });
      prevHill = hillY;
    }
  }

  const segments: Segment[] = [];
  let curve = 0;
  let y = 0;
  for (let i = 0; i < TOTAL_SEGMENTS; i++) {
    const step = steps[i] as Step;
    curve += (step.targetCurve - curve) * 0.045;
    const prevY = y;
    y += step.hillDelta;
    y = clamp(y, -1400, 1400);
    const zone = getEnvironmentZone(i);
    segments.push({
      index: i,
      curve,
      y1: prevY,
      y2: y,
      zone,
      props: zoneProps(zone, i),
    });
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
    lane: playerLane,
    speed: BASE_SPEED,
    isPlayer: true,
    place: 1,
    finishTime: null,
    bob: 0,
    stumble: 0,
    ai: null,
  };
  racers.push(player);

  // 4 AI on the 3 lanes that are not the player's — never share the player's
  // start lane (camera-locked YOU + a same-lane rival at z≈0 looks glued together).
  const rivalLanes = [0, 1, 2, 3].filter((l) => l !== playerLane);
  // lane pattern for 4 rivals across 3 free lanes: e.g. 0,2,3,0
  const aiLaneOrder = [
    rivalLanes[0] as number,
    rivalLanes[1] as number,
    rivalLanes[2] as number,
    rivalLanes[0] as number,
  ];
  for (let i = 0; i < 4; i++) {
    const skill = rnd(0.45, 0.95);
    const lane = aiLaneOrder[i] as number;
    // Spread in Z so shared-lane rivals (4th vs 1st) are not stacked
    const zSpread = i === 3 ? rnd(900, 1600) : rnd(200, 700) * (i % 2 === 0 ? 1 : -0.35);
    racers.push({
      id: i + 1,
      name: NAMES[i] as string,
      color: PALETTE[i] as string,
      z: zSpread,
      x: laneX(lane) + rnd(-0.04, 0.04),
      targetX: laneX(lane),
      lane,
      speed: BASE_SPEED,
      isPlayer: false,
      place: 1,
      finishTime: null,
      bob: 0,
      stumble: 0,
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
    wrongDrag: 0,
    multiplier: 1,
    multiplierTimer: 0,
    score: 0,
    combo: 0,
    elapsed: 0,
    pops: [],
    bursts: [],
    fxGates: [],
    challenge: null,
    lastGateZ: 0,
    lastResolve: null,
    laneHoldTimer: 0,
    laneHoldArmed: true,
    spawnClosed: false,
    finished: false,
  };
}

function addPop(state: RaceState, text: string, good: boolean) {
  state.pops.push({ text, good, life: 1, x: rnd(-0.15, 0.15), y: 0 });
  if (state.pops.length > 6) state.pops.shift();
}

export function shiftLane(state: RaceState, dir: -1 | 1) {
  const p = state.player;
  p.lane = clamp(Math.round(p.lane + dir), 0, LANES - 1);
  p.targetX = laneX(p.lane);
}

function reactionSeconds(level: number) {
  const t = clamp((level - 1) / 11, 0, 1);
  return 3.3 - t * 1.3;
}

function clearItemsNear(state: RaceState, z: number) {
  for (const item of state.items) {
    if (Math.abs(item.z - z) < ITEM_CLEAR_RANGE) item.taken = true;
  }
}

export function spawnChallenge(state: RaceState, question: Question): boolean {
  const p = state.player;
  if (p.finishTime !== null) return false;

  const lookAhead = clamp(
    p.speed * reactionSeconds(question.level),
    MIN_LOOKAHEAD_Z,
    MAX_VISIBLE_Z,
  );
  let gateZ = p.z + lookAhead;
  if (state.lastGateZ > 0) gateZ = Math.max(gateZ, state.lastGateZ + MIN_GATE_GAP);
  if (gateZ >= state.trackLength - FINISH_MARGIN) {
    state.spawnClosed = true;
    return false;
  }

  const choices = question.choices.slice(0, 4);
  while (choices.length < 4) choices.push(question.answer + choices.length);
  const gates = [0, 1, 2, 3].map((lane) => {
    const value = choices[lane] as number;
    return {
      z: gateZ,
      lane: lane as 0 | 1 | 2 | 3,
      x: laneX(lane),
      value,
      correct: value === question.answer,
      state: "idle" as const,
      fade: 0,
    };
  }) as [AnswerGate, AnswerGate, AnswerGate, AnswerGate];

  state.challenge = {
    question,
    spawnedAt: state.elapsed,
    spawnZ: gateZ,
    gates,
    resolved: false,
    approachTime: 0,
    correctTime: 0,
  };
  state.lastGateZ = gateZ;
  clearItemsNear(state, gateZ);
  return true;
}

/** Correct answer -> boost. seconds is a commitment-mapped response time. */
function applyCorrect(state: RaceState, seconds: number, level: number) {
  const fast = seconds < 2.0;
  const gain = fast ? 0.5 : seconds < 4 ? 0.34 : 0.2;
  state.boost = Math.min(1, state.boost + gain);
  state.wrongDrag = Math.max(0, state.wrongDrag - 0.22);
  state.combo += 1;
  const base = 50 + Math.round(level * 12);
  const speedBonus = Math.max(0, Math.round((5 - seconds) * 20));
  const comboBonus = Math.min(200, state.combo * 15);
  state.score += Math.round((base + speedBonus + comboBonus) * state.multiplier);
  addPop(state, fast ? "✓ TURBO" : "✓ +BOOST", true);
}

function applyWrong(state: RaceState, missed = false) {
  state.wrongDrag = Math.min(0.55, state.wrongDrag + 0.14);
  const floor = -0.42 - state.wrongDrag;
  state.boost = Math.max(floor, state.boost - 0.55);
  state.combo = 0;
  state.score = Math.max(0, state.score - 20);
  state.player.stumble = 0.28;
  addPop(state, missed ? "✕ MISSED" : "✕ SLOW DOWN", false);
}

function segmentAt(state: RaceState, z: number): Segment {
  const i = clamp(Math.floor(z / SEG_LENGTH), 0, state.segments.length - 1);
  return state.segments[i] as Segment;
}

function retireChallenge(state: RaceState) {
  const ch = state.challenge;
  if (!ch) return;
  state.fxGates.push(...ch.gates);
  state.challenge = null;
}

function resolveHit(state: RaceState, gate: AnswerGate) {
  const ch = state.challenge;
  if (!ch || ch.resolved) return;

  ch.resolved = true;
  const good = gate.correct;
  gate.state = good ? "hit-correct" : "hit-wrong";
  gate.fade = 0.5;
  for (const other of ch.gates) {
    if (other === gate) continue;
    other.state = "fading";
    other.fade = 0.35;
  }
  state.bursts.push({ x: gate.x, z: gate.z, life: 1, good });

  if (good) {
    const confidence = ch.approachTime > 0.04 ? clamp(ch.correctTime / ch.approachTime, 0, 1) : 0;
    const seconds = 5.2 - confidence * 4.2;
    applyCorrect(state, seconds, ch.question.level);
    state.lastResolve = { correct: true, seconds };
  } else {
    applyWrong(state, false);
    state.lastResolve = { correct: false, seconds: ch.approachTime };
  }
  retireChallenge(state);
}

function resolveMiss(state: RaceState) {
  const ch = state.challenge;
  if (!ch || ch.resolved) return;
  ch.resolved = true;
  for (const gate of ch.gates) {
    gate.state = "fading";
    gate.fade = 0.4;
  }
  applyWrong(state, true);
  state.lastResolve = { correct: false, seconds: ch.approachTime };
  retireChallenge(state);
}

export function update(state: RaceState, dt: number, steer: number) {
  state.elapsed += dt;

  // While wrong-drag is active, recover toward neutral more slowly so stacked
  // crashes keep the player slow until they answer correctly.
  const boostRecover = state.wrongDrag > 0 ? 0.28 : 0.55;
  state.boost += (0 - state.boost) * Math.min(1, dt * boostRecover);
  if (Math.abs(state.boost) < 0.002) state.boost = 0;

  if (state.multiplierTimer > 0) {
    state.multiplierTimer = Math.max(0, state.multiplierTimer - dt);
    if (state.multiplierTimer === 0) state.multiplier = 1;
  }

  const p = state.player;

  const targetSpeed = BASE_SPEED * (1 + state.boost * 0.62 - state.wrongDrag);
  p.speed += (targetSpeed - p.speed) * Math.min(1, dt * 3.2);

  // Discrete 4-lane steering with hold-to-repeat. x only ever chases the target lane.
  if (steer === 0) {
    state.laneHoldTimer = 0;
    state.laneHoldArmed = true;
  } else {
    const dir = steer < 0 ? -1 : 1;
    if (state.laneHoldArmed) {
      shiftLane(state, dir);
      state.laneHoldArmed = false;
      state.laneHoldTimer = LANE_HOLD_REPEAT;
    } else {
      state.laneHoldTimer -= dt;
      if (state.laneHoldTimer <= 0) {
        shiftLane(state, dir);
        state.laneHoldTimer = LANE_HOLD_REPEAT;
      }
    }
  }

  p.targetX = laneX(p.lane);
  const curve = segmentAt(state, p.z).curve;
  const lean = -curve * (p.speed / BASE_SPEED) * 0.012;
  const desired = clamp(p.targetX + lean, -0.92, 0.92);
  p.x += (desired - p.x) * Math.min(1, dt * LANE_FOLLOW);
  p.bob += dt * (p.speed / BASE_SPEED) * 9;
  if (p.stumble > 0) {
    p.stumble = Math.max(0, p.stumble - dt);
    p.bob += dt * 28;
  }

  if (p.finishTime === null) {
    p.z += p.speed * dt;
    if (p.z >= state.trackLength) {
      p.z = state.trackLength;
      p.finishTime = state.elapsed;
    }
  }

  const ch = state.challenge;
  if (ch && !ch.resolved && p.finishTime === null) {
    ch.approachTime += dt;
    const correctGate = ch.gates.find((g) => g.correct);
    if (correctGate && p.lane === correctGate.lane) ch.correctTime += dt;

    const prevZ = p.z - p.speed * dt;
    const gateZ = ch.spawnZ;
    if (p.z > gateZ && prevZ <= gateZ + 1) {
      let hit: AnswerGate | null = null;
      for (const gate of ch.gates) {
        if (Math.abs(p.x - gate.x) < GATE_HIT_RADIUS) {
          hit = gate;
          break;
        }
      }
      if (hit) resolveHit(state, hit);
      else resolveMiss(state);
    }
  }

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

  for (const r of state.racers) {
    if (!r.ai) continue;
    r.ai.timer -= dt;
    if (r.ai.timer <= 0) {
      r.ai.timer = r.ai.interval * rnd(0.75, 1.3);
      const success = Math.random() < r.ai.accuracy;
      r.ai.boost = clamp(r.ai.boost + (success ? rnd(0.2, 0.45) : -rnd(0.15, 0.4)), -0.35, 0.85);
      if (Math.random() < 0.25) {
        // Prefer not to occupy the player's lane when nearby (avoids glued sprites)
        let lane = Math.floor(rnd(0, LANES));
        if (lane === state.player.lane && Math.abs(r.z - state.player.z) < SEG_LENGTH * 8) {
          lane = (lane + 1 + Math.floor(rnd(0, LANES - 1))) % LANES;
        }
        r.lane = lane;
        r.targetX = laneX(r.lane);
      }
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

  const order = [...state.racers].sort((a, b) => {
    if (a.finishTime !== null && b.finishTime !== null) return a.finishTime - b.finishTime;
    if (a.finishTime !== null) return -1;
    if (b.finishTime !== null) return 1;
    return b.z - a.z;
  });
  order.forEach((r, i) => (r.place = i + 1));

  for (const pop of state.pops) {
    pop.life -= dt * 0.9;
    pop.y += dt * 0.5;
  }
  state.pops = state.pops.filter((pop) => pop.life > 0);

  for (const burst of state.bursts) burst.life -= dt * 1.8;
  state.bursts = state.bursts.filter((burst) => burst.life > 0);

  for (const gate of state.fxGates) gate.fade -= dt;
  state.fxGates = state.fxGates.filter((gate) => gate.fade > 0);

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
