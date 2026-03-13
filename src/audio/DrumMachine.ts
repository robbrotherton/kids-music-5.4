export interface TrackDefinition {
  id: string;
  label: string;
  color: string;
  accentColor: string;
  radius: number;
}

interface DrumMachineOptions {
  stepCount: number;
  tracks: TrackDefinition[];
  onStepChange?: (step: number) => void;
}

const LOOK_AHEAD_MS = 25;
const SCHEDULE_AHEAD_TIME = 0.12;

export class DrumMachine {
  private readonly stepCount: number;
  private readonly tracks: TrackDefinition[];
  private readonly onStepChange?: (step: number) => void;

  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private filterNode: BiquadFilterNode | null = null;
  private crusherNode: AudioWorkletNode | null = null;
  private compressorNode: DynamicsCompressorNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private timerId: number | null = null;
  private nextNoteTime = 0;
  private currentStep = 0;
  private workletReady = false;

  private tempo = 108;
  private hold = 0.35;
  private filterAmount = 0.78;
  private crushAmount = 0.12;
  private pattern: boolean[][];

  constructor(options: DrumMachineOptions) {
    this.stepCount = options.stepCount;
    this.tracks = options.tracks;
    this.onStepChange = options.onStepChange;
    this.pattern = options.tracks.map(() => Array.from({ length: options.stepCount }, () => false));
  }

  setPattern(pattern: boolean[][]) {
    this.pattern = pattern.map((row) => [...row]);
  }

  setTempo(tempo: number) {
    this.tempo = tempo;
  }

  setHold(amount: number) {
    this.hold = amount;
  }

  setFilter(amount: number) {
    this.filterAmount = amount;

    if (!this.filterNode) {
      return;
    }

    const frequency = 220 + Math.pow(amount, 2.2) * 14000;
    this.filterNode.frequency.setTargetAtTime(
      frequency,
      this.audioContext?.currentTime ?? 0,
      0.02,
    );
    this.filterNode.Q.setTargetAtTime(0.8 + amount * 7, this.audioContext?.currentTime ?? 0, 0.02);
  }

  setCrush(amount: number) {
    this.crushAmount = amount;

    if (!this.crusherNode) {
      return;
    }

    const bits = 16 - amount * 10;
    const normfreq = Math.max(0.08, 1 - amount * 0.9);
    this.crusherNode.parameters.get("bits")?.setValueAtTime(bits, this.audioContext?.currentTime ?? 0);
    this.crusherNode.parameters.get("normfreq")?.setValueAtTime(
      normfreq,
      this.audioContext?.currentTime ?? 0,
    );
  }

  getCurrentStep() {
    return this.currentStep;
  }

  isRunning() {
    return this.timerId !== null;
  }

  async start() {
    await this.ensureAudio();

    if (!this.audioContext || this.timerId !== null) {
      return;
    }

    await this.audioContext.resume();
    this.nextNoteTime = this.audioContext.currentTime;
    this.currentStep = 0;
    this.onStepChange?.(this.currentStep);
    this.timerId = window.setInterval(() => this.scheduler(), LOOK_AHEAD_MS);
  }

  stop() {
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }

    this.currentStep = 0;
    this.onStepChange?.(this.currentStep);
  }

  async dispose() {
    this.stop();

    if (this.audioContext) {
      await this.audioContext.close();
    }
  }

  private async ensureAudio() {
    if (this.audioContext) {
      return;
    }

    this.audioContext = new AudioContext({ latencyHint: "interactive" });
    this.masterGain = this.audioContext.createGain();
    this.masterGain.gain.value = 0.78;

    this.filterNode = this.audioContext.createBiquadFilter();
    this.filterNode.type = "lowpass";

    this.compressorNode = this.audioContext.createDynamicsCompressor();
    this.compressorNode.threshold.value = -18;
    this.compressorNode.knee.value = 12;
    this.compressorNode.ratio.value = 3;
    this.compressorNode.attack.value = 0.002;
    this.compressorNode.release.value = 0.16;

    if (!this.workletReady) {
      await this.audioContext.audioWorklet.addModule("/audio/bitcrusher-worklet.js");
      this.workletReady = true;
    }

    this.crusherNode = new AudioWorkletNode(this.audioContext, "bitcrusher", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });

    this.filterNode.connect(this.crusherNode);
    this.crusherNode.connect(this.masterGain);
    this.masterGain.connect(this.compressorNode);
    this.compressorNode.connect(this.audioContext.destination);

    this.noiseBuffer = this.createNoiseBuffer(this.audioContext);
    this.setFilter(this.filterAmount);
    this.setCrush(this.crushAmount);
  }

  private scheduler() {
    if (!this.audioContext) {
      return;
    }

    while (this.nextNoteTime < this.audioContext.currentTime + SCHEDULE_AHEAD_TIME) {
      this.scheduleStep(this.currentStep, this.nextNoteTime);
      this.advanceStep();
    }
  }

  private scheduleStep(step: number, time: number) {
    for (let trackIndex = 0; trackIndex < this.tracks.length; trackIndex += 1) {
      if (!this.pattern[trackIndex]?.[step]) {
        continue;
      }

      const trackId = this.tracks[trackIndex].id;

      if (trackId === "kick") {
        this.playKick(time);
      } else if (trackId === "snare") {
        this.playSnare(time);
      } else if (trackId === "hat") {
        this.playHat(time);
      } else {
        this.playPerc(time);
      }
    }

    const uiDelay = Math.max(0, time - (this.audioContext?.currentTime ?? 0)) * 1000;
    window.setTimeout(() => this.onStepChange?.(step), uiDelay);
  }

  private advanceStep() {
    const secondsPerBeat = 60 / this.tempo;
    this.nextNoteTime += 0.25 * secondsPerBeat;
    this.currentStep = (this.currentStep + 1) % this.stepCount;
  }

  private playKick(time: number) {
    if (!this.audioContext || !this.filterNode) {
      return;
    }

    const length = 0.16 + this.hold * 0.42;
    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(150, time);
    oscillator.frequency.exponentialRampToValueAtTime(42, time + length);

    gainNode.gain.setValueAtTime(0.0001, time);
    gainNode.gain.exponentialRampToValueAtTime(1, time + 0.004);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, time + length);

    oscillator.connect(gainNode);
    gainNode.connect(this.filterNode);

    oscillator.start(time);
    oscillator.stop(time + length + 0.05);
  }

  private playSnare(time: number) {
    if (!this.audioContext || !this.filterNode || !this.noiseBuffer) {
      return;
    }

    const noise = this.audioContext.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const noiseFilter = this.audioContext.createBiquadFilter();
    noiseFilter.type = "highpass";
    noiseFilter.frequency.value = 1400;

    const noiseGain = this.audioContext.createGain();
    const noiseLength = 0.12 + this.hold * 0.24;
    noiseGain.gain.setValueAtTime(0.0001, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.56, time + 0.002);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, time + noiseLength);

    const tone = this.audioContext.createOscillator();
    tone.type = "triangle";
    tone.frequency.setValueAtTime(220, time);
    tone.frequency.exponentialRampToValueAtTime(110, time + 0.08);

    const toneGain = this.audioContext.createGain();
    toneGain.gain.setValueAtTime(0.0001, time);
    toneGain.gain.exponentialRampToValueAtTime(0.28, time + 0.002);
    toneGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.1 + this.hold * 0.14);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.filterNode);

    tone.connect(toneGain);
    toneGain.connect(this.filterNode);

    noise.start(time);
    noise.stop(time + noiseLength + 0.03);
    tone.start(time);
    tone.stop(time + 0.16 + this.hold * 0.12);
  }

  private playHat(time: number) {
    if (!this.audioContext || !this.filterNode || !this.noiseBuffer) {
      return;
    }

    const noise = this.audioContext.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const highpass = this.audioContext.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 6400;

    const bandpass = this.audioContext.createBiquadFilter();
    bandpass.type = "bandpass";
    bandpass.frequency.value = 9600;
    bandpass.Q.value = 0.9;

    const gainNode = this.audioContext.createGain();
    const length = 0.04 + this.hold * 0.12;
    gainNode.gain.setValueAtTime(0.0001, time);
    gainNode.gain.exponentialRampToValueAtTime(0.28, time + 0.001);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, time + length);

    noise.connect(highpass);
    highpass.connect(bandpass);
    bandpass.connect(gainNode);
    gainNode.connect(this.filterNode);

    noise.start(time);
    noise.stop(time + length + 0.03);
  }

  private playPerc(time: number) {
    if (!this.audioContext || !this.filterNode || !this.noiseBuffer) {
      return;
    }

    const oscillator = this.audioContext.createOscillator();
    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(420, time);
    oscillator.frequency.exponentialRampToValueAtTime(180, time + 0.08 + this.hold * 0.1);

    const bandpass = this.audioContext.createBiquadFilter();
    bandpass.type = "bandpass";
    bandpass.frequency.value = 2000;
    bandpass.Q.value = 2.4;

    const gainNode = this.audioContext.createGain();
    const length = 0.08 + this.hold * 0.18;
    gainNode.gain.setValueAtTime(0.0001, time);
    gainNode.gain.exponentialRampToValueAtTime(0.22, time + 0.001);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, time + length);

    oscillator.connect(bandpass);
    bandpass.connect(gainNode);
    gainNode.connect(this.filterNode);

    oscillator.start(time);
    oscillator.stop(time + length + 0.03);
  }

  private createNoiseBuffer(audioContext: AudioContext) {
    const buffer = audioContext.createBuffer(1, audioContext.sampleRate, audioContext.sampleRate);
    const channel = buffer.getChannelData(0);

    for (let index = 0; index < channel.length; index += 1) {
      channel[index] = Math.random() * 2 - 1;
    }

    return buffer;
  }
}
