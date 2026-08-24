import { useCallback, useEffect, useRef, useState } from "react";

import { AdaptiveMath, type Question } from "@/game/mathEngine";
import {
  applyCorrect,
  applyWrong,
  createRace,
  ordinal,
  progress,
  update,
  type RaceState,
} from "@/game/raceEngine";
import { render } from "@/game/renderer";

type Phase = "home" | "countdown" | "racing" | "results";

type Hud = {
  place: number;
  score: number;
  combo: number;
  boost: number;
  progress: number;
  time: number;
};

type Result = {
  place: number;
  score: number;
  time: number;
  accuracy: number;
  bestCombo: number;
  asked: number;
  level: number;
};

const emptyHud: Hud = { place: 1, score: 0, combo: 0, boost: 0, progress: 0, time: 0 };

export function RaceGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const raceRef = useRef<RaceState | null>(null);
  const mathRef = useRef<AdaptiveMath>(new AdaptiveMath());
  const askedAtRef = useRef<number>(0);
  const steerRef = useRef<number>(0);
  const phaseRef = useRef<Phase>("home");
  const lockRef = useRef<boolean>(false);

  const [phase, setPhase] = useState<Phase>("home");
  const [countdown, setCountdown] = useState<string>("3");
  const [question, setQuestion] = useState<Question | null>(null);
  const [feedback, setFeedback] = useState<{ index: number; correct: boolean } | null>(null);
  const [hud, setHud] = useState<Hud>(emptyHud);
  const [result, setResult] = useState<Result | null>(null);

  const setPhaseBoth = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const nextQuestion = useCallback(() => {
    const q = mathRef.current.next();
    askedAtRef.current = performance.now();
    setQuestion(q);
    setFeedback(null);
    lockRef.current = false;
  }, []);

  // ---- main loop: always running so the canvas stays alive on every screen ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let last = performance.now();
    let hudAcc = 0;
    let dpr = 1;

    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    if (!raceRef.current) raceRef.current = createRace();

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, Math.max(0.0005, (now - last) / 1000));
      last = now;

      const state = raceRef.current;
      if (!state) return;

      if (phaseRef.current === "racing") {
        update(state, dt, steerRef.current);
        if (state.finished) {
          const m = mathRef.current;
          setResult({
            place: state.player.place,
            score: state.score,
            time: state.player.finishTime ?? state.elapsed,
            accuracy: m.accuracy,
            bestCombo: m.best,
            asked: m.asked,
            level: Math.round(m.level),
          });
          setQuestion(null);
          phaseRef.current = "results";
          setPhase("results");
        }
      } else if (phaseRef.current === "countdown") {
        // idle drift so the scene feels alive
        state.elapsed += dt;
        for (const r of state.racers) r.bob += dt * 2;
      }

      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      render(ctx, state, canvas.width / dpr, canvas.height / dpr);
      ctx.restore();

      hudAcc += dt;
      if (hudAcc > 0.08) {
        hudAcc = 0;
        setHud({
          place: state.player.place,
          score: state.score,
          combo: state.combo,
          boost: state.boost,
          progress: progress(state),
          time: state.elapsed,
        });
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  const answer = useCallback(
    (index: number) => {
      if (lockRef.current) return;
      const state = raceRef.current;
      const q = question;
      if (!state || !q || phaseRef.current !== "racing") return;
      lockRef.current = true;
      const choice = q.choices[index];
      const seconds = (performance.now() - askedAtRef.current) / 1000;
      const correct = choice === q.answer;
      mathRef.current.record(correct, seconds);
      if (correct) applyCorrect(state, seconds, q.level);
      else applyWrong(state);
      setFeedback({ index, correct });
      window.setTimeout(() => {
        if (phaseRef.current === "racing") nextQuestion();
      }, correct ? 260 : 520);
    },
    [question, nextQuestion],
  );

  // ---- keyboard ----
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a") steerRef.current = -1;
      else if (e.key === "ArrowRight" || e.key === "d") steerRef.current = 1;
      else if (e.key >= "1" && e.key <= "3") answer(Number(e.key) - 1);
    };
    const up = (e: KeyboardEvent) => {
      if (["ArrowLeft", "ArrowRight", "a", "d"].includes(e.key)) steerRef.current = 0;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [answer]);

  const startRace = useCallback(() => {
    raceRef.current = createRace();
    mathRef.current = new AdaptiveMath();
    steerRef.current = 0;
    setResult(null);
    setHud(emptyHud);
    setPhaseBoth("countdown");
    const steps = ["3", "2", "1", "GO!"];
    steps.forEach((label, i) => {
      window.setTimeout(() => setCountdown(label), i * 700);
    });
    window.setTimeout(() => {
      setPhaseBoth("racing");
      nextQuestion();
    }, 2800);
  }, [nextQuestion, setPhaseBoth]);

  // ---- touch steering on the canvas ----
  const touchStart = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    touchStart.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const start = touchStart.current;
    const x = e.touches[0]?.clientX;
    if (start === null || x === undefined) return;
    const delta = (x - start) / 60;
    steerRef.current = Math.max(-1, Math.min(1, delta));
  };
  const onTouchEnd = () => {
    touchStart.current = null;
    steerRef.current = 0;
  };

  const boostPct = Math.round(Math.max(0, hud.boost) * 100);

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-arena select-none">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      />

      {/* ---------------- Racing HUD ---------------- */}
      {phase === "racing" && (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3 sm:p-5">
            <div className="rounded-2xl bg-glass px-3 py-2 shadow-pop backdrop-blur-sm">
              <div className="font-display text-3xl leading-none text-gold sm:text-4xl">
                {ordinal(hud.place)}
              </div>
              <div className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                position
              </div>
            </div>

            <div className="flex flex-col items-end gap-2">
              <div className="rounded-2xl bg-glass px-3 py-2 text-right shadow-pop backdrop-blur-sm">
                <div className="font-display text-xl leading-none text-foreground sm:text-2xl">
                  {hud.score}
                </div>
                <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  score
                </div>
              </div>
              {hud.combo > 1 && (
                <div className="animate-scale-in rounded-full bg-gold px-3 py-1 font-display text-sm text-arena-ink shadow-pop">
                  COMBO ×{hud.combo}
                </div>
              )}
            </div>
          </div>

          {/* progress + boost */}
          <div className="pointer-events-none absolute inset-x-0 top-[86px] px-3 sm:top-28 sm:px-5">
            <div className="h-2 w-full overflow-hidden rounded-full bg-glass">
              <div
                className="h-full rounded-full bg-track-progress transition-[width] duration-150"
                style={{ width: `${hud.progress * 100}%` }}
              />
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-cream">
                boost
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-glass">
                <div
                  className="h-full rounded-full bg-boost transition-[width] duration-100"
                  style={{ width: `${boostPct}%` }}
                />
              </div>
            </div>
          </div>

          {/* question */}
          {question && (
            <div className="absolute inset-x-0 bottom-0 p-3 pb-6 sm:p-6">
              <div className="mx-auto w-full max-w-md">
                <div className="mb-3 rounded-3xl bg-glass px-4 py-3 text-center shadow-pop backdrop-blur-sm">
                  <div className="font-display text-3xl text-cream sm:text-4xl">
                    {question.text} = ?
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  {question.choices.map((choice, i) => {
                    const state =
                      feedback && feedback.index === i
                        ? feedback.correct
                          ? "correct"
                          : "wrong"
                        : "idle";
                    return (
                      <button
                        key={`${question.text}-${choice}`}
                        onPointerDown={() => answer(i)}
                        className={`h-16 rounded-2xl font-display text-2xl shadow-pop transition-transform active:scale-95 sm:h-20 sm:text-3xl ${
                          state === "correct"
                            ? "bg-boost text-arena-ink"
                            : state === "wrong"
                              ? "bg-danger text-cream"
                              : "bg-answer text-arena-ink"
                        }`}
                      >
                        {choice}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ---------------- Countdown ---------------- */}
      {phase === "countdown" && (
        <div className="absolute inset-0 flex items-center justify-center bg-arena-veil">
          <div key={countdown} className="animate-scale-in font-display text-8xl text-gold drop-shadow-lg sm:text-9xl">
            {countdown}
          </div>
        </div>
      )}

      {/* ---------------- Home ---------------- */}
      {phase === "home" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-8 bg-arena-veil px-6 text-center">
          <div>
            <p className="font-display text-sm uppercase tracking-[0.4em] text-gold">KruMath</p>
            <h1 className="mt-2 font-display text-5xl leading-none text-cream sm:text-7xl">
              MATH RACER
            </h1>
            <p className="mx-auto mt-4 max-w-xs text-sm text-cream/80 sm:text-base">
              Solve fast, boost faster. Answer questions mid-race to outrun four rivals.
            </p>
          </div>
          <button
            onClick={startRace}
            className="rounded-full bg-boost px-14 py-5 font-display text-3xl text-arena-ink shadow-pop transition-transform hover:scale-105 active:scale-95 sm:text-4xl"
          >
            PLAY
          </button>
          <p className="text-xs text-cream/60">
            Tap answers · drag to steer · keys 1–3 and ← →
          </p>
        </div>
      )}

      {/* ---------------- Results ---------------- */}
      {phase === "results" && result && (
        <div className="absolute inset-0 flex items-center justify-center bg-arena-veil px-5">
          <div className="w-full max-w-sm rounded-3xl bg-glass p-6 text-center shadow-pop backdrop-blur-md">
            <div className="font-display text-6xl text-gold">{ordinal(result.place)}</div>
            <p className="mt-1 text-xs font-bold uppercase tracking-[0.3em] text-cream/70">
              {result.place === 1 ? "you won the race" : "race complete"}
            </p>
            <dl className="mt-6 grid grid-cols-2 gap-3 text-left">
              <Stat label="Score" value={`${result.score}`} />
              <Stat label="Time" value={`${result.time.toFixed(1)}s`} />
              <Stat label="Accuracy" value={`${Math.round(result.accuracy * 100)}%`} />
              <Stat label="Best combo" value={`×${result.bestCombo}`} />
              <Stat label="Questions" value={`${result.asked}`} />
              <Stat label="Math level" value={`${result.level}`} />
            </dl>
            <button
              onClick={startRace}
              className="mt-6 w-full rounded-2xl bg-boost py-4 font-display text-2xl text-arena-ink shadow-pop transition-transform active:scale-95"
            >
              PLAY AGAIN
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-arena-ink/40 px-3 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-widest text-cream/60">{label}</dt>
      <dd className="font-display text-xl text-cream">{value}</dd>
    </div>
  );
}
