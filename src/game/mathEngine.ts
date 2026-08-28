/**
 * Adaptive mental-math question engine.
 * Difficulty is a continuous value (1..12) nudged by accuracy + response speed.
 */

export type Question = {
  text: string;
  answer: number;
  choices: number[];
  level: number;
};

const ri = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = <T>(arr: T[]): T => arr[ri(0, arr.length - 1)] as T;

type Raw = { text: string; answer: number };

/** Parenthesize negatives so `5 + (-2)` stays readable on the HUD. */
function parens(n: number): string {
  return n < 0 ? `(${n})` : `${n}`;
}

function integerAddSub(): Raw {
  const pos = ri(1, 9);
  const neg = ri(-9, -1);
  const kind = ri(0, 2);
  if (kind === 0) return { text: `${neg} + ${pos}`, answer: neg + pos };
  if (kind === 1) return { text: `${pos} + ${parens(neg)}`, answer: pos + neg };
  return { text: `${pos} − ${parens(neg)}`, answer: pos - neg };
}

function build(level: number): Raw {
  const tier = Math.max(1, Math.min(12, Math.round(level)));
  switch (tier) {
    case 1: {
      const roll = Math.random();
      if (roll < 0.4) {
        const a = ri(1, 9);
        const b = ri(1, 9);
        return { text: `${a} + ${b}`, answer: a + b };
      }
      if (roll < 0.75) {
        const a = ri(1, 9);
        const b = ri(1, 9);
        return { text: `${Math.max(a, b)} − ${Math.min(a, b)}`, answer: Math.abs(a - b) };
      }
      if (roll < 0.9) {
        const a = ri(1, 9);
        return { text: `${a} + ${a}`, answer: a + a };
      }
      const a = ri(1, 9);
      return { text: `${a} + ${10 - a}`, answer: 10 };
    }
    case 2: {
      if (Math.random() < 0.55) return integerAddSub();
      const a = ri(5, 20);
      const b = ri(2, 12);
      return Math.random() < 0.5
        ? { text: `${a} + ${b}`, answer: a + b }
        : { text: `${a} − ${b}`, answer: a - b };
    }
    case 3: {
      const roll = Math.random();
      if (roll < 0.5) {
        const a = ri(2, 5);
        const b = ri(2, 9);
        return { text: `${a} × ${b}`, answer: a * b };
      }
      if (roll < 0.85) {
        const a = ri(1, 8);
        const b = ri(2, 5);
        const c = ri(2, 6);
        return Math.random() < 0.5
          ? { text: `${a} + ${b} × ${c}`, answer: a + b * c }
          : { text: `${b} × ${c} + ${a}`, answer: b * c + a };
      }
      const a = ri(20, 60);
      const b = ri(5, 30);
      return { text: `${a} + ${b}`, answer: a + b };
    }
    case 4: {
      const roll = Math.random();
      if (roll < 0.35) {
        const a = ri(2, 9);
        const b = ri(2, 9);
        return { text: `${a} × ${b}`, answer: a * b };
      }
      if (roll < 0.65) {
        const a = ri(2, 9);
        const b = ri(2, 9);
        return { text: `${a * b} ÷ ${b}`, answer: a };
      }
      const a = ri(2, 6);
      const b = ri(1, 8);
      const c = ri(1, 8);
      return { text: `${a}(${b} + ${c})`, answer: a * (b + c) };
    }
    case 5: {
      if (Math.random() < 0.5) {
        const a = ri(21, 89);
        const b = ri(11, 49);
        return Math.random() < 0.5
          ? { text: `${a} + ${b}`, answer: a + b }
          : { text: `${a + b} − ${b}`, answer: a };
      }
      const a = ri(3, 12);
      const b = ri(3, 12);
      return { text: `${a} × ${b}`, answer: a * b };
    }
    case 6: {
      if (Math.random() < 0.5) {
        const p = pick([10, 20, 25, 50]);
        const n = pick([40, 60, 80, 120, 200]);
        return { text: `${p}% of ${n}`, answer: (p * n) / 100 };
      }
      const b = ri(3, 12);
      const a = ri(4, 12);
      return { text: `${a * b} ÷ ${b}`, answer: a };
    }
    case 7: {
      if (Math.random() < 0.5) {
        const n = ri(4, 13);
        return { text: `${n}²`, answer: n * n };
      }
      const d = pick([2, 3, 4, 5]);
      const whole = ri(2, 9) * d;
      return { text: `${d === 2 ? "1/2" : `1/${d}`} of ${whole}`, answer: whole / d };
    }
    case 8: {
      if (Math.random() < 0.5) {
        const a = ri(-15, -2);
        const b = ri(3, 18);
        return { text: `${a} + ${b}`, answer: a + b };
      }
      const a = ri(2, 12);
      const b = ri(2, 9);
      return { text: `${a} × ${b} − ${b}`, answer: a * b - b };
    }
    case 9: {
      const x = ri(2, 12);
      const b = ri(3, 20);
      return Math.random() < 0.5
        ? { text: `x + ${b} = ${x + b},  x = ?`, answer: x }
        : { text: `3x = ${3 * x},  x = ?`, answer: x };
    }
    case 10: {
      if (Math.random() < 0.5) {
        const a = ri(6, 15);
        const b = ri(6, 15);
        return { text: `${a} × ${b}`, answer: a * b };
      }
      const p = pick([15, 30, 35, 60, 75]);
      const n = pick([20, 40, 80, 200]);
      return { text: `${p}% of ${n}`, answer: (p * n) / 100 };
    }
    case 11: {
      const x = ri(2, 12);
      const a = ri(2, 6);
      const b = ri(2, 15);
      return { text: `${a}x + ${b} = ${a * x + b},  x = ?`, answer: x };
    }
    default: {
      const n = ri(4, 12);
      if (Math.random() < 0.5) return { text: `${n}³`, answer: n * n * n };
      const a = ri(12, 25);
      const b = ri(6, 15);
      return { text: `${a} × ${b}`, answer: a * b };
    }
  }
}

function makeChoices(answer: number, level: number): number[] {
  const spread = Math.max(2, Math.round(Math.abs(answer) * 0.15) + Math.round(level / 3));
  const set = new Set<number>([answer]);
  let guard = 0;
  while (set.size < 4 && guard++ < 80) {
    const delta = ri(1, spread) * (Math.random() < 0.5 ? -1 : 1);
    const candidate = answer + delta;
    if (candidate !== answer) set.add(candidate);
  }
  while (set.size < 4) set.add(answer + set.size * 3 + 1);
  const arr = [...set];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = ri(0, i);
    const tmp = arr[i] as number;
    arr[i] = arr[j] as number;
    arr[j] = tmp;
  }
  return arr;
}

function makeQuestion(level: number): Question {
  const raw = build(level);
  return { text: raw.text, answer: raw.answer, choices: makeChoices(raw.answer, level), level };
}

const SKILL_LEVEL_KEY = "krumath-math-racer-level";
const DEFAULT_LEVEL = 2;

export function softStartLevel(saved: number): number {
  return Math.max(DEFAULT_LEVEL, Math.min(12, saved - 0.5));
}

export function loadSkillLevel(): number {
  try {
    if (typeof localStorage === "undefined") return DEFAULT_LEVEL;
    const raw = localStorage.getItem(SKILL_LEVEL_KEY);
    if (raw == null) return DEFAULT_LEVEL;
    const n = Number(raw);
    if (!Number.isFinite(n)) return DEFAULT_LEVEL;
    return Math.max(1, Math.min(12, n));
  } catch {
    return DEFAULT_LEVEL;
  }
}

export function saveSkillLevel(level: number): void {
  try {
    if (typeof localStorage === "undefined") return;
    const clamped = Math.max(1, Math.min(12, level));
    localStorage.setItem(SKILL_LEVEL_KEY, String(clamped));
  } catch {
    // private mode / quota — ignore
  }
}

export class AdaptiveMath {
  level: number;
  streak = 0;
  best = 0;
  correct = 0;
  asked = 0;

  constructor(startLevel = DEFAULT_LEVEL) {
    this.level = Math.max(1, Math.min(12, startLevel));
  }

  next(): Question {
    return makeQuestion(this.level);
  }

  /** returns the difficulty delta applied */
  record(isCorrect: boolean, seconds: number): number {
    this.asked++;
    let delta: number;
    if (isCorrect) {
      this.correct++;
      this.streak++;
      this.best = Math.max(this.best, this.streak);
      const fast = seconds < 2.2;
      const okay = seconds < 4.5;
      delta = fast ? 0.55 : okay ? 0.28 : 0.08;
      if (this.streak >= 3) delta += 0.2;
    } else {
      this.streak = 0;
      delta = -0.75;
    }
    this.level = Math.max(1, Math.min(12, this.level + delta));
    return delta;
  }

  get accuracy(): number {
    return this.asked === 0 ? 0 : this.correct / this.asked;
  }
}
