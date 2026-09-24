import { getAudioContext, playTone } from './audioEngine.js';

export function playCheonsuSfx(type, enabled = true, volume = 1) {
  if (typeof document !== 'undefined' && document.hidden) return;
  if (!enabled || !Number.isFinite(Number(volume)) || Number(volume) <= 0) return;

  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  const presets = {
    step: [{ freq: 105, duration: .045, type: 'triangle', gain: .038 }, { freq: 64, start: .012, duration: .04, type: 'sine', gain: .028 }],
    arrow: [{ freq: 920, duration: .11, type: 'sawtooth', gain: .023 }, { freq: 240, start: .075, duration: .045, type: 'triangle', gain: .036 }],
    thrust: [{ freq: 640, duration: .06, type: 'sawtooth', gain: .032 }, { freq: 190, start: .04, duration: .09, type: 'triangle', gain: .036 }],
    heavy: [{ freq: 78, duration: .18, type: 'triangle', gain: .065 }, { freq: 165, duration: .08, type: 'sawtooth', gain: .035 }],
    lightning: [{ freq: 85, duration: .17, type: 'sawtooth', gain: .038 }, { freq: 1450, duration: .055, type: 'square', gain: .018 }, { freq: 700, start: .07, duration: .085, type: 'sawtooth', gain: .022 }],
    holy: [{ freq: 659, duration: .19, type: 'sine', gain: .03 }, { freq: 988, start: .06, duration: .22, type: 'sine', gain: .026 }],
    confirm: [
      { freq: 520, start: 0, duration: 0.055, type: "triangle", gain: 0.032 },
      { freq: 780, start: 0.055, duration: 0.075, type: "triangle", gain: 0.028 },
    ],
    save: [
      { freq: 660, start: 0, duration: 0.06, type: "sine", gain: 0.026 },
      { freq: 880, start: 0.06, duration: 0.10, type: "sine", gain: 0.022 },
    ],
    start: [
      { freq: 196, start: 0, duration: 0.12, type: "sawtooth", gain: 0.022 },
      { freq: 392, start: 0.08, duration: 0.12, type: "triangle", gain: 0.025 },
      { freq: 784, start: 0.16, duration: 0.16, type: "triangle", gain: 0.022 },
    ],
    turn: [
      { freq: 330, start: 0, duration: 0.08, type: "triangle", gain: 0.022 },
      { freq: 440, start: 0.07, duration: 0.08, type: "triangle", gain: 0.020 },
    ],
    slash: [
      { freq: 220, start: 0, duration: 0.055, type: "sawtooth", gain: 0.035 },
      { freq: 110, start: 0.035, duration: 0.065, type: "square", gain: 0.020 },
    ],
    counter: [
      { freq: 180, start: 0, duration: 0.055, type: "square", gain: 0.030 },
      { freq: 360, start: 0.04, duration: 0.075, type: "triangle", gain: 0.024 },
    ],
    fire: [
      { freq: 130, start: 0, duration: 0.13, type: "sawtooth", gain: 0.027 },
      { freq: 520, start: 0.035, duration: 0.12, type: "triangle", gain: 0.024 },
      { freq: 780, start: 0.075, duration: 0.10, type: "sine", gain: 0.018 },
    ],
    ice: [
      { freq: 980, start: 0, duration: 0.075, type: "sine", gain: 0.022 },
      { freq: 1240, start: 0.055, duration: 0.10, type: "triangle", gain: 0.018 },
    ],
    magic: [
      { freq: 440, start: 0, duration: 0.08, type: "triangle", gain: 0.020 },
      { freq: 660, start: 0.05, duration: 0.10, type: "triangle", gain: 0.022 },
      { freq: 990, start: 0.11, duration: 0.11, type: "sine", gain: 0.018 },
    ],
    shadow: [
      { freq: 90, start: 0, duration: 0.15, type: "sawtooth", gain: 0.030 },
      { freq: 180, start: 0.06, duration: 0.14, type: "square", gain: 0.018 },
    ],
    crit: [
      { freq: 160, start: 0, duration: 0.055, type: "square", gain: 0.040 },
      { freq: 720, start: 0.045, duration: 0.105, type: "sawtooth", gain: 0.030 },
      { freq: 1080, start: 0.095, duration: 0.11, type: "triangle", gain: 0.024 },
    ],
    miss: [
      { freq: 260, start: 0, duration: 0.06, type: "sine", gain: 0.016, detune: -40 },
      { freq: 210, start: 0.045, duration: 0.07, type: "sine", gain: 0.014, detune: -120 },
    ],
    heal: [
      { freq: 523, start: 0, duration: 0.08, type: "sine", gain: 0.022 },
      { freq: 659, start: 0.06, duration: 0.08, type: "sine", gain: 0.021 },
      { freq: 784, start: 0.12, duration: 0.12, type: "sine", gain: 0.018 },
    ],
    guard: [
      { freq: 150, start: 0, duration: 0.08, type: "square", gain: 0.028 },
      { freq: 300, start: 0.05, duration: 0.08, type: "triangle", gain: 0.020 },
    ],
    hazard: [
      { freq: 80, start: 0, duration: 0.18, type: "sawtooth", gain: 0.036 },
      { freq: 160, start: 0.055, duration: 0.14, type: "square", gain: 0.026 },
      { freq: 60, start: 0.12, duration: 0.20, type: "sawtooth", gain: 0.030 },
    ],
    phase: [
      { freq: 70, start: 0, duration: 0.22, type: "sawtooth", gain: 0.034 },
      { freq: 140, start: 0.10, duration: 0.20, type: "square", gain: 0.028 },
      { freq: 280, start: 0.22, duration: 0.18, type: "sawtooth", gain: 0.022 },
    ],
    boss: [
      { freq: 55, start: 0, duration: 0.26, type: "sawtooth", gain: 0.038 },
      { freq: 110, start: 0.12, duration: 0.22, type: "square", gain: 0.030 },
      { freq: 220, start: 0.28, duration: 0.18, type: "triangle", gain: 0.024 },
    ],
    equip: [
      { freq: 420, start: 0, duration: 0.05, type: "triangle", gain: 0.024 },
      { freq: 630, start: 0.05, duration: 0.07, type: "triangle", gain: 0.022 },
      { freq: 315, start: 0.10, duration: 0.08, type: "sine", gain: 0.018 },
    ],
    item: [
      { freq: 560, start: 0, duration: 0.06, type: "sine", gain: 0.022 },
      { freq: 700, start: 0.06, duration: 0.08, type: "sine", gain: 0.020 },
    ],
    loot: [
      { freq: 660, start: 0, duration: 0.06, type: "triangle", gain: 0.024 },
      { freq: 990, start: 0.07, duration: 0.08, type: "triangle", gain: 0.024 },
      { freq: 1320, start: 0.15, duration: 0.12, type: "sine", gain: 0.018 },
    ],
    finish: [
      { freq: 130, start: 0, duration: 0.06, type: "square", gain: 0.040 },
      { freq: 520, start: 0.055, duration: 0.10, type: "sawtooth", gain: 0.032 },
      { freq: 1040, start: 0.14, duration: 0.16, type: "triangle", gain: 0.026 },
    ],
    levelup: [
      { freq: 523, start: 0, duration: 0.06, type: "triangle", gain: 0.024 },
      { freq: 659, start: 0.06, duration: 0.06, type: "triangle", gain: 0.024 },
      { freq: 784, start: 0.12, duration: 0.08, type: "triangle", gain: 0.024 },
      { freq: 1046, start: 0.20, duration: 0.14, type: "sine", gain: 0.020 },
    ],
    menu: [
      { freq: 392, start: 0, duration: 0.045, type: "sine", gain: 0.018 },
      { freq: 494, start: 0.045, duration: 0.055, type: "sine", gain: 0.016 },
    ],
    victory: [
      { freq: 392, start: 0, duration: 0.10, type: "triangle", gain: 0.026 },
      { freq: 523, start: 0.09, duration: 0.10, type: "triangle", gain: 0.026 },
      { freq: 784, start: 0.18, duration: 0.18, type: "triangle", gain: 0.024 },
    ],
    defeat: [
      { freq: 220, start: 0, duration: 0.12, type: "triangle", gain: 0.024 },
      { freq: 165, start: 0.10, duration: 0.14, type: "triangle", gain: 0.022 },
      { freq: 110, start: 0.22, duration: 0.22, type: "sine", gain: 0.020 },
    ],
  };

  const sequence = presets[type] || presets.confirm;
  const safeVolume = Math.max(0, Math.min(1, Number(volume) || 0));
  sequence.forEach((tone) =>
    playTone(ctx, {
      ...tone,
      gain: (tone.gain || 0.02) * safeVolume,
    })
  );
}
