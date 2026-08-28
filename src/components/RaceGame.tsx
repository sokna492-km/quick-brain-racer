import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";

import { AdaptiveMath, loadSkillLevel, saveSkillLevel, softStartLevel } from "@/game/mathEngine";
import {
  createRace,
  ordinal,
  progress,
  spawnChallenge,
  update,
  type RaceState,
} from "@/game/raceEngine";
import { render } from "@/game/renderer";
import { disposeCharacters, ensureCharactersReady } from "@/game/character3d";
import MarathonHUD from "@/components/MarathonHUD";
import {
  isBgmWanted,
  playBgm as playSharedBgm,
  readBgmMuted,
  setBgmMuted,
  setBgmWanted,
  unlockBgmGesture,
} from "@/game/bgm";

type Phase = "home" | "countdown" | "racing" | "results";
type Mode = "home" | "live";

type Hud = {
  place: number;
  score: number;
  combo: number;
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

export function RaceGame({ mode }: { mode: Mode }) {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const raceRef = useRef<RaceState | null>(null);
  const mathRef = useRef<AdaptiveMath>(new AdaptiveMath());
  const steerRef = useRef<number>(0);
  const phaseRef = useRef<Phase>(mode === "live" ? "countdown" : "home");
  const startedLive = useRef(false);

  const [phase, setPhase] = useState<Phase>(mode === "live" ? "countdown" : "home");
  const [countdown, setCountdown] = useState<string>("3");
  const [hud, setHud] = useState<Hud>(emptyHud);
  const [result, setResult] = useState<Result | null>(null);
  const [scoreTick, setScoreTick] = useState(0);
  const [muted, setMuted] = useState(readBgmMuted);
  const prevScoreRef = useRef(0);

  const setPhaseBoth = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const playBgm = useCallback(() => {
    playSharedBgm();
  }, []);

  const stopBgm = useCallback(() => {
    setBgmWanted(false);
  }, []);

  useEffect(() => {
    setBgmMuted(muted);
  }, [muted]);

  // Unmute after muted-autoplay, or resume if still paused
  useEffect(() => {
    const unlock = () => {
      if (isBgmWanted()) unlockBgmGesture();
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
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

    void ensureCharactersReady();

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
          saveSkillLevel(m.level);
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
          setBgmWanted(false);
        }
      } else if (phaseRef.current === "countdown" || phaseRef.current === "home") {
        state.elapsed += dt;
        for (const r of state.racers) r.bob += dt * 2;
      }

      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      render(ctx, state, canvas.width / dpr, canvas.height / dpr, dt);
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
      disposeCharacters();
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
    mathRef.current = new AdaptiveMath(softStartLevel(loadSkillLevel()));
    steerRef.current = 0;
    setResult(null);
    setHud(emptyHud);
    prevScoreRef.current = 0;
    setScoreTick(0);
    setCountdown("3");
    setPhaseBoth("countdown");
    setBgmWanted(true);
    playBgm();
    const steps = ["3", "2", "1", "GO!"];
    steps.forEach((label, i) => {
      window.setTimeout(() => setCountdown(label), i * 700);
    });
    window.setTimeout(() => {
      const state = raceRef.current;
      if (state) spawnChallenge(state, mathRef.current.next());
      setPhaseBoth("racing");
    }, 2800);
  }, [mode, playBgm, setPhaseBoth]);

  // Live route: auto-start countdown on mount
  useEffect(() => {
    if (mode !== "live" || startedLive.current) return;
    startedLive.current = true;
    startRace();
  }, [mode, startRace]);

  const goPlay = useCallback(() => {
    // Unlock autoplay in the same user-gesture stack before remounting /live
    setBgmWanted(true);
    playSharedBgm();
    void navigate({ to: "/live" });
  }, [navigate]);

  const onSteerPadDown = (dir: -1 | 1) => (e: React.PointerEvent<HTMLButtonElement>) => {
    if (phaseRef.current !== "racing") return;
    e.preventDefault();
    e.stopPropagation();
    steerRef.current = dir;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onSteerPadUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    steerRef.current = 0;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const placeStyle = placeAccent(hud.place);

  useEffect(() => {
    if (hud.score > prevScoreRef.current) {
      setScoreTick((n) => n + 1);
    }
    prevScoreRef.current = hud.score;
  }, [hud.score]);

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-arena select-none">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      <button
        type="button"
        onClick={() => {
          setMuted((m) => !m);
          playBgm();
        }}
        className="absolute z-20 flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-slate-950/60 text-lg text-cream shadow-[0_8px_24px_rgba(0,0,0,0.28)] backdrop-blur-md transition-transform active:scale-95 bottom-[max(0.85rem,env(safe-area-inset-bottom))] right-[max(0.85rem,env(safe-area-inset-right))]"
        aria-label={muted ? "Unmute music" : "Mute music"}
        aria-pressed={muted}
      >
        {muted ? "🔇" : "🔊"}
      </button>

      {phase === "racing" && (
        <div className="pointer-events-none absolute inset-0 [--hud-top:118px] sm:[--hud-top:126px]">
          <div className="absolute inset-x-0 top-0 h-[125px] bg-gradient-to-b from-black/35 via-black/10 to-transparent sm:h-[135px]" />

          <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 pt-[max(0.75rem,env(safe-area-inset-top))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] sm:pl-[max(1.25rem,env(safe-area-inset-left))] sm:pr-[max(1.25rem,env(safe-area-inset-right))]">
            {/* Left — place */}
            <div
              className={`relative overflow-hidden rounded-2xl border border-white/15 bg-slate-950/55 shadow-[0_8px_30px_rgba(0,0,0,0.25)] backdrop-blur-md ${placeStyle.border}`}
              aria-label={`ទីតាំងទី ${hud.place}`}
            >
              <div
                className={`absolute left-0 top-0 h-full w-1 ${hud.place === 1 ? "bg-gold" : "bg-cream/45"}`}
              />

              <div className="flex items-center px-3 py-2 pl-4 sm:px-4 sm:py-2.5 sm:pl-5">
                <div className="flex min-w-[3.25rem] flex-col items-center gap-0 leading-none">
                  <span className="font-khmer text-xs font-semibold tracking-wide text-white sm:text-sm">
                    ទីតាំង
                  </span>
                  <div key={hud.place} className="animate-scale-in -mt-0.5 flex items-start">
                    <span className="font-display text-4xl leading-none tracking-tight text-white sm:text-5xl">
                      {ordinal(hud.place).replace(/\D+$/, "")}
                    </span>
                    <span className="mt-1 font-display text-xs leading-none text-white sm:text-sm">
                      {ordinal(hud.place).replace(/^\d+/, "")}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right — combo + score */}
            <div className="flex items-center gap-2">
              {hud.combo > 1 && (
                <div
                  key={hud.combo}
                  className={`combo-popup animate-combo-pop ${
                    hud.combo >= 10 ? "combo-popup--hot" : hud.combo >= 5 ? "combo-popup--warm" : ""
                  }`}
                  aria-label={`×${hud.combo}`}
                >
                  <span className="combo-popup__ring" aria-hidden />
                  <span className="font-display text-2xl leading-none tracking-tight text-arena-ink sm:text-3xl">
                    ×{hud.combo}
                  </span>
                </div>
              )}

              <div
                className="relative min-w-[7.5rem] overflow-hidden rounded-2xl border border-white/15 bg-slate-950/60 shadow-[0_8px_30px_rgba(0,0,0,0.28)] backdrop-blur-md sm:min-w-[8.5rem]"
                aria-label={`ពិន្ទុ ${hud.score}`}
              >
                <div className="absolute inset-x-0 top-0 h-0.5 bg-gold/80" />

                <div className="flex flex-col items-end gap-0 px-4 py-2 sm:px-5 sm:py-2.5">
                  <div className="flex items-baseline justify-end gap-1.5 leading-none">
                    <div
                      key={scoreTick}
                      className={`font-display text-4xl leading-none tracking-tight tabular-nums text-cream sm:text-5xl ${scoreTick > 0 ? "animate-hud-tick" : ""}`}
                    >
                      {hud.score}
                    </div>
                    <span className="font-khmer text-xs font-semibold tracking-wide text-white sm:text-sm">
                      ពិន្ទុ
                    </span>
                  </div>

                  <div className="-mt-0.5 font-display text-sm leading-none tabular-nums tracking-wide text-white sm:text-base">
                    {formatRaceTime(hud.time)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <MarathonHUD progress={hud.progress} />

          {hud.question && (
            <div className="absolute inset-x-0 top-[200px] flex justify-center px-3 sm:top-44 md:top-48">
              <div className="quiz-cloud">
                <div className="quiz-cloud-shape" aria-hidden />
                <div className="relative z-10 font-display text-xl leading-none text-arena-ink sm:text-2xl md:text-3xl">
                  {hud.question} = ?
                </div>
              </div>
            </div>
          )}

          {/* Steer pads only — no canvas / background touch steering */}
          <div className="steer-hint pointer-events-none absolute inset-x-0 bottom-[max(5.25rem,calc(env(safe-area-inset-bottom)+4.25rem))] z-10 flex items-end justify-between pl-[max(3.5rem,calc(env(safe-area-inset-left)+2.25rem))] pr-[max(3.5rem,calc(env(safe-area-inset-right)+2.25rem))] sm:hidden">
            <button
              type="button"
              className="steer-hint__pad pointer-events-auto"
              aria-label="Steer left"
              onPointerDown={onSteerPadDown(-1)}
              onPointerUp={onSteerPadUp}
              onPointerCancel={onSteerPadUp}
            >
              <svg
                className="steer-hint__arrow steer-hint__arrow--left"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden
              >
                <path
                  d="M14.5 6.5 9 12l5.5 5.5"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button
              type="button"
              className="steer-hint__pad pointer-events-auto"
              aria-label="Steer right"
              onPointerDown={onSteerPadDown(1)}
              onPointerUp={onSteerPadUp}
              onPointerCancel={onSteerPadUp}
            >
              <svg
                className="steer-hint__arrow steer-hint__arrow--right"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden
              >
                <path
                  d="M9.5 6.5 15 12l-5.5 5.5"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
      )}

      {phase === "countdown" && (
        <div className="absolute inset-0 flex items-center justify-center bg-arena-veil">
          <div
            key={countdown}
            className="animate-scale-in font-display text-8xl text-gold drop-shadow-lg sm:text-9xl"
          >
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
            <div className="font-khmer text-3xl font-bold leading-tight text-gold sm:text-4xl">
              ចំណាត់ថ្នាក់លេខ {result.place}
            </div>
            <dl className="mt-6 grid grid-cols-2 gap-3 text-left">
              <Stat label="ពិន្ទុសរុប" value={`${result.score}`} />
              <Stat label="រយៈពេល" value={`${formatRaceTime(result.time)} នាទី`} />
              <Stat label="ភាពត្រឹមត្រូវ" value={`${Math.round(result.accuracy * 100)}%`} />
              <Stat label="ឆ្លើយត្រូវជាប់ៗគ្នា" value={`×${result.bestCombo}`} />
              <Stat label="ចំនួនលំហាត់" value={`${result.asked}`} />
              <Stat label="កម្រិតពិបាក" value={result.level.toString().padStart(2, "0")} />
            </dl>
            <button
              onClick={startRace}
              className="mt-6 w-full rounded-2xl bg-boost py-4 font-khmer text-2xl font-bold text-arena-ink shadow-pop transition-transform active:scale-95"
            >
              លេងម្ដងទៀត
            </button>
            <Link
              to="/"
              onClick={stopBgm}
              className="font-khmer mt-3 inline-block text-lg font-semibold text-cream/70 transition-colors hover:text-cream"
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
      <dt className="font-khmer text-sm text-cream/60">{label}</dt>
      <dd className="font-khmer text-2xl font-bold text-cream">{value}</dd>
    </div>
  );
}
