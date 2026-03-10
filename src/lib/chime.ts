/**
 * Plays a subtle two-tone chime using the Web Audio API.
 * No external files or dependencies required.
 * Safe to call even when the browser has no audio context support.
 */
export function playTruckDownChime(): void {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

    const play = (freq: number, startTime: number, duration: number, gain: number) => {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      // Soft attack → sustain → fade out
      env.gain.setValueAtTime(0, startTime);
      env.gain.linearRampToValueAtTime(gain, startTime + 0.04);
      env.gain.setValueAtTime(gain, startTime + duration * 0.4);
      env.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      osc.connect(env);
      env.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration + 0.05);
    };

    const now = ctx.currentTime;
    // Two descending notes: E5 → C5 — recognisable but not jarring
    play(659.25, now,        0.55, 0.18);  // E5
    play(523.25, now + 0.28, 0.70, 0.14);  // C5

    // Close the context after playback to free resources
    setTimeout(() => ctx.close(), 1500);
  } catch {
    // Audio not available — fail silently
  }
}
