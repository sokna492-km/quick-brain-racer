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
const pick = <T,>(arr: T[]): T => arr[ri(0, arr.length - 1)] as T;

type Raw = { text: string; answer: number };

function build(level: number): Raw {
  const tier = Math.max(1, Math.min(12, Math.round(level)));
  switch (tier) {
    case 1: {
      const a = ri(1, 9);
      const b = ri(1, 9);
      return Math.random() < 0.5
        ? { text: `${a} + ${b}`, answer: a + b }
        : { text: `${Math.max(a, b)} − ${Math.min(a, b)}`, answer: Math.abs(a - b) };
    }
    case 2: {
      const a = ri(5, 20);
      const b = ri(2, 12);
      return Math.random() < 0.5
        ? { text: `${a} + ${b}`, answer: a + b }
        : { text: `${a} − ${b}`, answer: a - b };
    }
    case 3: {
      const a = ri(2, 5);
      const b = ri(2, 9);
      return Math.random() < 0.6
        ? { text: `${a} × ${b}`, answer: a * b }
        : { text: `${ri(20, 60)} + ${ri(5, 30)}`, answer: 0 };
    }
    case 4: {
      const a = ri(2, 9);
      const b = ri(2, 9);
      return Math.random() < 0.5
        ? { text: `${a} × ${b}`, answer: a * b }
        : { text: `${a * b} ÷ ${b}`, answer: a };
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
  let raw = build(level);
  // guard for the placeholder branch in tier 3
  if (raw.answer === 0 && raw.text.includes("+")) {
    const parts = raw.text.split(" + ").map(Number);
    raw = { text: raw.text, answer: (parts[0] ?? 0) + (parts[1] ?? 0) };
  }
  return { text: raw.text, answer: raw.answer, choices: makeChoices(raw.answer, level), level };
}

export class AdaptiveMath {
  level = 2;
  streak = 0;
  best = 0;
  correct = 0;
  asked = 0;

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
