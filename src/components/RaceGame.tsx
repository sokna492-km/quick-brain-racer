import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";

import { AdaptiveMath } from "@/game/mathEngine";
import {
  createRace,
  ordinal,
  progress,
  shiftLane,
  spawnChallenge,
  update,
  type RaceState,
} from "@/game/raceEngine";
import { render } from "@/game/renderer";
import MarathonHUD from "@/components/MarathonHUD";

type Phase = "home" | "countdown" | "racing" | "results";
type Mode = "home" | "live";

type Hud = {
  place: number;
  score: number;
  combo: number;
  boost: number;
  progress: number;
  time: number;
  question: string | null;
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

const emptyHud: Hud = {
  place: 1,
  score: 0,
  combo: 0,
  boost: 0,
  progress: 0,
  time: 0,
  question: null,
};

function formatRaceTime(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, "0")}`;
}

function placeAccent(place: number) {
  if (place === 1) return { border: "border-gold/55", ordinal: "text-gold" };
  if (place <= 3) return { border: "border-cream/35", ordinal: "text-cream" };
  return { border: "border-cream/20", ordinal: "text-cream/85" };
}

const SWIPE_PX = 48;

export function RaceGame({ mode }: { mode: Mode }) {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const raceRef = useRef<RaceState | null>(null);
  const mathRef = useRef<AdaptiveMath>(new AdaptiveMath());
  const steerRef = useRef<number>(0);
  const phaseRef = useRef<Phase>(mode === "live" ? "countdown" : "home");
  const pointerOrigin = useRef<{ x: number; swiped: boolean; edge: -1 | 0 | 1 } | null>(null);
  const startedLive = useRef(false);

  const [phase, setPhase] = useState<Phase>(mode === "live" ? "countdown" : "home");
  const [countdown, setCountdown] = useState<string>("3");
  const [hud, setHud] = useState<Hud>(emptyHud);
  const [result, setResult] = useState<Result | null>(null);
  const [scoreTick, setScoreTick] = useState(0);
  const prevScoreRef = useRef(0);

  const setPhaseBoth = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
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
    let lastQuestion: string | null | undefined;

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
        if (state.lastResolve) {
          mathRef.current.record(state.lastResolve.correct, state.lastResolve.seconds);
          state.lastResolve = null;
        }
        if (!state.finished && !state.challenge && !state.spawnClosed) {
          spawnChallenge(state, mathRef.current.next());
        }
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
          phaseRef.current = "results";
          setPhase("results");
        }
      } else if (phaseRef.current === "countdown" || phaseRef.current === "home") {
        state.elapsed += dt;
        for (const r of state.racers) r.bob += dt * 2;
      }

      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      render(ctx, state, canvas.width / dpr, canvas.height / dpr);
      ctx.restore();

      hudAcc += dt;
      const question = state.challenge?.question.text ?? null;
      if (hudAcc > 0.08) {
        hudAcc = 0;
        lastQuestion = question;
        setHud({
          place: state.player.place,
          score: state.score,
          combo: state.combo,
          boost: state.boost,
          progress: progress(state),
          time: state.elapsed,
          question,
        });
      } else if (question !== lastQuestion) {
        lastQuestion = question;
        setHud((h) => ({ ...h, question }));
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
        e.preventDefault();
        steerRef.current = -1;
      } else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
        e.preventDefault();
        steerRef.current = 1;
      }
    };
    const up = (e: KeyboardEvent) => {
      if (["ArrowLeft", "ArrowRight", "a", "A", "d", "D"].includes(e.key)) steerRef.current = 0;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const startRace = useCallback(() => {
    raceRef.current = createRace();
    mathRef.current = new AdaptiveMath();
    steerRef.current = 0;
    setResult(null);
    setHud(emptyHud);
    prevScoreRef.current = 0;
    setScoreTick(0);
    setCountdown("3");
    setPhaseBoth("countdown");
    const steps = ["3", "2", "1", "GO!"];
    steps.forEach((label, i) => {
      window.setTimeout(() => setCountdown(label), i * 700);
    });
    window.setTimeout(() => {
      const state = raceRef.current;
      if (state) spawnChallenge(state, mathRef.current.next());
      setPhaseBoth("racing");
    }, 2800);
  }, [setPhaseBoth]);

  // Live route: auto-start countdown on mount
  useEffect(() => {
    if (mode !== "live" || startedLive.current) return;
    startedLive.current = true;
    startRace();
  }, [mode, startRace]);

  const goPlay = useCallback(() => {
    void navigate({ to: "/quick-brain-racer/live" });
  }, [navigate]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (phaseRef.current !== "racing") return;
    const canvas = canvasRef.current;
    const x = e.clientX;
    let edge: -1 | 0 | 1 = 0;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      const nx = (x - rect.left) / rect.width;
      if (nx < 0.34) edge = -1;
      else if (nx > 0.66) edge = 1;
    }
    pointerOrigin.current = { x, swiped: false, edge };
    steerRef.current = edge;
    canvas?.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const origin = pointerOrigin.current;
    const state = raceRef.current;
    if (!origin || origin.swiped || !state) return;
    const dx = e.clientX - origin.x;
    if (Math.abs(dx) >= SWIPE_PX && origin.edge === 0) {
      origin.swiped = true;
      shiftLane(state, dx < 0 ? -1 : 1);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointerOrigin.current = null;
    steerRef.current = 0;
    canvasRef.current?.releasePointerCapture(e.pointerId);
  };

  const boostPct = Math.round(Math.max(0, hud.boost) * 100);
  const placeStyle = placeAccent(hud.place);

  useEffect(() => {
    if (hud.score > prevScoreRef.current) {
      setScoreTick((n) => n + 1);
    }
    prevScoreRef.current = hud.score;
  }, [hud.score]);

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-arena select-none">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />

      {phase === "racing" && (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[110px] bg-hud-vignette sm:h-[120px]" />

          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between pt-[max(0.75rem,env(safe-area-inset-top))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] sm:pl-[max(1.25rem,env(safe-area-inset-left))] sm:pr-[max(1.25rem,env(safe-area-inset-right))]">
            <div
              key={hud.place}
              className={`animate-scale-in relative grid h-16 w-16 place-items-center rounded-full border bg-glass shadow-pop backdrop-blur-sm sm:h-[4.5rem] sm:w-[4.5rem] ${placeStyle.border}`}
            >
              <div
                className="absolute inset-[3px] rounded-full opacity-70"
                style={{
                  background: `conic-gradient(currentColor ${(1 - (hud.place - 1) / 4) * 360}deg, transparent 0deg)`,
                  color: hud.place === 1 ? "var(--gold)" : "var(--cream)",
                  maskImage: "radial-gradient(closest-side, transparent 78%, #000 79%)",
                  WebkitMaskImage: "radial-gradient(closest-side, transparent 78%, #000 79%)",
                }}
              />
              <div className="flex items-start leading-none">
                <span className={`font-display text-3xl sm:text-4xl ${placeStyle.ordinal}`}>
                  {ordinal(hud.place).replace(/\D+$/, "")}
                </span>
                <span className={`mt-0.5 font-display text-[10px] sm:text-xs ${placeStyle.ordinal}`}>
                  {ordinal(hud.place).replace(/^\d+/, "")}
                </span>
              </div>
            </div>

            <div className="flex flex-col items-end gap-1.5">
              <div className="min-w-[7.5rem] overflow-hidden rounded-2xl border border-cream/15 bg-glass text-right shadow-pop backdrop-blur-sm">
                <div className="flex items-center justify-end gap-1.5 border-b border-cream/10 bg-gold/15 px-3 py-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-gold" />
                  <span className="font-khmer text-[10px] font-semibold tracking-wide text-cream/75">
                    ពិន្ទុ
                  </span>
                </div>
                <div className="px-3 py-1.5">
                  <div
                    key={scoreTick}
                    className={`font-display text-3xl leading-none tabular-nums text-cream sm:text-4xl ${scoreTick > 0 ? "animate-hud-tick" : ""}`}
                  >
                    {hud.score}
                  </div>
                  <div className="mt-1 font-display text-[11px] tabular-nums text-cream/50">
                    ⏱ {formatRaceTime(hud.time)}
                  </div>
                </div>
              </div>
              {hud.combo > 1 && (
                <div className="animate-scale-in rounded-full bg-gold px-2.5 py-0.5 font-display text-xs text-arena-ink shadow-pop sm:text-sm">
                  ×{hud.combo}
                </div>
              )}
            </div>

          </div>

          <MarathonHUD progress={hud.progress} />

          <div className="pointer-events-none absolute bottom-0 left-0 pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] sm:pl-[max(1.25rem,env(safe-area-inset-left))]">
  <div className="flex items-end gap-1.5">
    <div className="flex h-44 flex-col justify-between py-1">
      {[1, 2, 3, 4, 5].map((tick) => (
        <span
          key={tick}
          className="h-px w-1.5 bg-cream/25"
        />
      ))}
    </div>

    <div className="flex flex-col items-center gap-1.5">
      <div className="relative h-44 w-3 overflow-hidden rounded-full border border-cream/20 bg-arena-ink/45 shadow-pop backdrop-blur-sm sm:h-52 sm:w-3.5">
        <div
          className="absolute inset-x-0 bottom-0 rounded-full bg-boost transition-[height] duration-100"
          style={{ height: `${boostPct}%` }}
        />
      </div>

      <span className="font-khmer text-[9px] font-semibold tracking-wide text-cream/70 sm:text-[10px]">
        ល្បឿន
      </span>
    </div>
  </div>
</div>

          {hud.question && (
            <div className="pointer-events-none absolute inset-x-0 top-[148px] flex justify-center px-3 sm:top-44">
              <div className="rounded-2xl bg-glass px-4 py-2 text-center shadow-pop backdrop-blur-sm">
                <div className="font-display text-2xl leading-none text-cream sm:text-3xl">
                  {hud.question} = ?
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {phase === "countdown" && (
        <div className="absolute inset-0 flex items-center justify-center bg-arena-veil">
          <div key={countdown} className="animate-scale-in font-display text-8xl text-gold drop-shadow-lg sm:text-9xl">
            {countdown}
          </div>
        </div>
      )}

      {mode === "home" && phase === "home" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-8 bg-arena-veil px-6 text-center">
          <div>
            <p className="font-display text-base tracking-wide text-white sm:text-lg">
              KruMath Interactive
            </p>
            <h1 className="mt-2 font-display text-5xl leading-none text-cream sm:text-7xl">
              MATH RACER
            </h1>
            <p className="font-khmer mx-auto mt-4 max-w-xs text-sm text-cream/80 sm:text-base">
              មើលលំហាត់ រត់រកចម្លើយដែលត្រឹមត្រូវ
            </p>
          </div>
          <button
            onClick={goPlay}
            className="rounded-full bg-boost px-14 py-5 font-khmer text-3xl font-bold text-arena-ink shadow-pop transition-transform hover:scale-105 active:scale-95 sm:text-4xl"
          >
            ចូលលេង
          </button>
        </div>
      )}

      {phase === "results" && result && (
        <div className="absolute inset-0 flex items-center justify-center bg-arena-veil px-5">
          <div className="w-full max-w-sm rounded-3xl bg-glass p-6 text-center shadow-pop backdrop-blur-md">
            <div className="font-display text-6xl text-gold">{ordinal(result.place)}</div>
            <p className="font-khmer mt-1 text-base font-bold text-cream/70 sm:text-lg">
              {result.place === 1 ? "you won the race" : "ការរត់ប្រណាំងបានបញ្ចប់"}
            </p>
            <dl className="mt-6 grid grid-cols-2 gap-3 text-left">
              <Stat label="ពិន្ទុ" value={`${result.score}`} />
              <Stat label="រយៈពេល" value={`${result.time.toFixed(1)} វិនាទី`} />
              <Stat label="ភាពត្រឹមត្រូវ" value={`${Math.round(result.accuracy * 100)}%`} />
              <Stat label="ឆ្លើយត្រូវជាប់ៗគ្នា" value={`×${result.bestCombo}`} />
              <Stat label="លំហាត់" value={`${result.asked}`} />
              <Stat label="កម្រិតពិបាក" value={`${result.level}`} />
            </dl>
            <button
              onClick={startRace}
              className="mt-6 w-full rounded-2xl bg-boost py-4 font-khmer text-2xl font-bold text-arena-ink shadow-pop transition-transform active:scale-95"
            >
              លេងម្ដងទៀត
            </button>
            <Link
              to="/quick-brain-racer"
              className="font-khmer mt-3 inline-block text-base font-semibold text-cream/70 transition-colors hover:text-cream"
            >
              ត្រលប់
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-arena-ink/40 px-3 py-2">
      <dt className="font-khmer text-xs text-cream/60">{label}</dt>
      <dd className="font-khmer text-xl font-bold text-cream">{value}</dd>
    </div>
  );
}
