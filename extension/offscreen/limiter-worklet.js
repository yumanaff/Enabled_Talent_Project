// Ease sound limiter (runs on the audio thread).
// A "peak limiter": the sound can never go above the ceiling.
//
// For every sample:
//   1. "envelope" follows the loudest recent sample. It jumps up at once (no delay),
//      and falls back slowly (release), so the sound does not "pump".
//   2. If the envelope is above the ceiling, we turn the sound down by exactly that much.
// Because the envelope jumps up at once, no sample can get past the ceiling.
// Left and right are turned down together, so the sound does not move to one side.
//
// Then "level" makes everything quieter (A bit quieter ... Very quiet).

const CEILING = 0.25; // -12 dB. Loud parts (ads, screams, explosions) are pressed down to this.
const RELEASE_SECONDS = 0.3;

class EaseLimiter extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: "level", defaultValue: 0.25, minValue: 0, maxValue: 1, automationRate: "k-rate" }];
  }

  constructor() {
    super();
    this.envelope = 0;
    this.release = Math.exp(-1 / (RELEASE_SECONDS * sampleRate));
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    const level = parameters.level[0];
    if (!input || !input.length) {
      return true; // no sound right now: keep running
    }
    const frames = input[0].length;
    for (let i = 0; i < frames; i++) {
      let peak = 0;
      for (let c = 0; c < input.length; c++) {
        const value = Math.abs(input[c][i]);
        if (value > peak) {
          peak = value;
        }
      }
      this.envelope = Math.max(peak, this.envelope * this.release);
      const gain = (this.envelope > CEILING ? CEILING / this.envelope : 1) * level;
      for (let c = 0; c < output.length; c++) {
        const channel = input[c] || input[0];
        output[c][i] = channel[i] * gain;
      }
    }
    return true;
  }
}

registerProcessor("ease-limiter", EaseLimiter);
