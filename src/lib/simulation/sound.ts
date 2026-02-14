/**
 * Procedural sound system using Web Audio API.
 * Zero audio files - all sounds generated programmatically.
 */

let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let muted = false;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    try {
      audioCtx = new AudioContext();
      masterGain = audioCtx.createGain();
      masterGain.connect(audioCtx.destination);
      masterGain.gain.value = 0.3;
    } catch {
      return null;
    }
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

function getGain(): GainNode | null {
  getCtx();
  return masterGain;
}

function playTone(
  freq: number,
  duration: number,
  type: OscillatorType = "sine",
  volume = 0.3,
  rampDown = true,
) {
  const ctx = getCtx();
  const dest = getGain();
  if (!ctx || !dest || muted) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.value = volume;
  if (rampDown) {
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  }
  osc.connect(gain);
  gain.connect(dest);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
}

function playNoise(duration: number, volume = 0.1) {
  const ctx = getCtx();
  const dest = getGain();
  if (!ctx || !dest || muted) return;

  const bufferSize = ctx.sampleRate * duration;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * volume;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.value = 1;
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  source.connect(gain);
  gain.connect(dest);
  source.start();
}

type SFXName =
  | "click"
  | "success"
  | "fail"
  | "launch"
  | "collision"
  | "tick"
  | "powerup"
  | "whoosh"
  | "drop"
  | "pop"
  | "correct"
  | "incorrect";

export function playSFX(name: SFXName) {
  if (muted) return;
  switch (name) {
    case "click":
      playTone(800, 0.05, "square", 0.1);
      break;
    case "success":
      playTone(523, 0.1, "sine", 0.2);
      setTimeout(() => playTone(659, 0.1, "sine", 0.2), 100);
      setTimeout(() => playTone(784, 0.15, "sine", 0.25), 200);
      break;
    case "correct":
      playTone(880, 0.12, "sine", 0.2);
      setTimeout(() => playTone(1100, 0.15, "sine", 0.2), 80);
      break;
    case "fail":
      playTone(300, 0.2, "sawtooth", 0.15);
      setTimeout(() => playTone(200, 0.3, "sawtooth", 0.12), 150);
      break;
    case "incorrect":
      playTone(250, 0.15, "square", 0.1);
      setTimeout(() => playTone(200, 0.2, "square", 0.08), 100);
      break;
    case "launch":
      playNoise(0.15, 0.2);
      playTone(150, 0.2, "sawtooth", 0.15);
      break;
    case "collision":
      playNoise(0.08, 0.3);
      playTone(200, 0.1, "triangle", 0.2);
      break;
    case "tick":
      playTone(1000, 0.03, "sine", 0.08);
      break;
    case "powerup":
      for (let i = 0; i < 5; i++) {
        setTimeout(() => playTone(400 + i * 100, 0.08, "sine", 0.15), i * 50);
      }
      break;
    case "whoosh":
      playTone(400, 0.2, "sine", 0.1, false);
      setTimeout(() => playTone(200, 0.15, "sine", 0.05), 50);
      break;
    case "drop":
      playTone(600, 0.15, "sine", 0.15);
      setTimeout(() => playTone(300, 0.2, "sine", 0.1), 80);
      break;
    case "pop":
      playTone(1200, 0.05, "sine", 0.15);
      break;
  }
}

/** Play ascending tones proportional to points scored */
export function playScore(points: number) {
  if (muted) return;
  const tones = Math.min(points, 5);
  for (let i = 0; i < tones; i++) {
    setTimeout(() => playTone(440 + i * 110, 0.1, "sine", 0.2), i * 80);
  }
}
