/** Shared looping BGM — survives route remounts; muted-autoplay fallback for /live. */

const BGM_SRC = `${import.meta.env.BASE_URL}bgm-fake-awake.mp3`;
const BGM_VOLUME = 0.4;
const BGM_MUTE_KEY = "qbr-bgm-muted";

let shared: HTMLAudioElement | null = null;
let wanted = false;
/** Unmute on next gesture after muted autoplay workaround. */
let pendingUnmute = false;

export function readBgmMuted() {
  try {
    return localStorage.getItem(BGM_MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeBgmMuted(muted: boolean) {
  try {
    localStorage.setItem(BGM_MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function ensureAudio() {
  if (typeof Audio === "undefined") return null;
  if (!shared) {
    shared = new Audio(BGM_SRC);
    shared.loop = true;
    shared.preload = "auto";
    shared.volume = BGM_VOLUME;
    shared.muted = readBgmMuted();
  }
  return shared;
}

export function setBgmWanted(next: boolean) {
  wanted = next;
  if (!next) {
    pendingUnmute = false;
    const audio = shared;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
  }
}

export function playBgm() {
  const audio = ensureAudio();
  if (!audio || !wanted) return;

  const userMuted = readBgmMuted();
  audio.muted = userMuted;

  void audio.play().catch(() => {
    if (userMuted) {
      // Still need a gesture to start even when user prefers mute
      pendingUnmute = false;
      return;
    }
    audio.muted = true;
    void audio
      .play()
      .then(() => {
        pendingUnmute = true;
      })
      .catch(() => {
        // Both plays blocked — don't leave element stuck muted; wait for gesture
        pendingUnmute = true;
        audio.muted = false;
      });
  });
}

/** Call from pointer/key handlers to unmute after muted autoplay. */
export function unlockBgmGesture() {
  const audio = ensureAudio();
  const userMuted = readBgmMuted();
  if (!audio || !wanted) return;

  // Always clear mute on gesture unless the user explicitly muted.
  // (Previously we only unmuted when pendingUnmute was set — but muted
  // autoplay can also fail with NotAllowedError, leaving muted stuck on.)
  if (!userMuted) {
    audio.muted = false;
    pendingUnmute = false;
  }

  if (audio.paused) {
    void audio.play().catch(() => {});
  }
}

export function setBgmMuted(muted: boolean) {
  const audio = ensureAudio();
  if (audio) audio.muted = muted;
  if (muted) pendingUnmute = false;
  writeBgmMuted(muted);
}

export function isBgmWanted() {
  return wanted;
}
