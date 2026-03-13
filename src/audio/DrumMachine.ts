import { AudioEngine } from "./AudioEngine";
import { MasterTransport } from "./MasterTransport";

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
  engine: AudioEngine;
  transport: MasterTransport;
  onStepChange?: (step: number) => void;
}

export class DrumMachine {
  private readonly stepCount: number;
  private readonly tracks: TrackDefinition[];
  private readonly engine: AudioEngine;
  private readonly transport: MasterTransport;
  private readonly onStepChange?: (step: number) => void;

  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private filterNode: BiquadFilterNode | null = null;
  private crusherNode: AudioWorkletNode | null = null;
  private compressorNode: DynamicsCompressorNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private currentStep = 0;
  private engaged = false;
  private pendingStart = false;
  private running = false;
  private unsubscribe: (() => void) | null = null;
  private tempo = 108;
  private volume = 0.68;
  private hold = 0.35;
  private filterAmount = 0.78;
  private crushAmount = 0.12;
  private pattern: boolean[][];

  constructor(options: DrumMachineOptions) {
    this.stepCount = options.stepCount;
    this.tracks = options.tracks;
    this.engine = options.engine;
    this.transport = options.transport;
    this.onStepChange = options.onStepChange;
    this.pattern = options.tracks.map(() => Array.from({ length: options.stepCount }, () => false));
    this.unsubscribe = this.transport.subscribe((event) => this.handleTransportTick(event.barStep, event.barStart, event.time));
  }

  setPattern(pattern: boolean[][]) {
    this.pattern = pattern.map((row) => [...row]);
  }

  setTempo(tempo: number) {
    this.tempo = tempo;
    this.transport.setTempo(tempo);
  }

  setHold(amount: number) {
    this.hold = amount;
  }

  setVolume(amount: number) {
    this.volume = amount;

    if (!this.masterGain) {
      return;
    }

    const gain = amount;
    this.masterGain.gain.setTargetAtTime(gain, this.audioContext?.currentTime ?? 0, 0.02);
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
    return this.engaged;
  }

  async start() {
    await this.ensureAudio();

    if (this.engaged) {
      return;
    }

    await this.transport.acquire();
    this.engaged = true;
    this.pendingStart = true;
  }

  stop() {
    if (this.engaged) {
      this.transport.release();
    }

    this.engaged = false;
    this.pendingStart = false;
    this.running = false;
    this.currentStep = 0;
    this.onStepChange?.(this.currentStep);
  }

  async dispose() {
    this.stop();
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private async ensureAudio() {
    if (this.audioContext) {
      return;
    }

    this.audioContext = await this.engine.getContext();
    this.masterGain = this.audioContext.createGain();
    this.masterGain.gain.value = this.volume;

    this.filterNode = this.audioContext.createBiquadFilter();
    this.filterNode.type = "lowpass";

    this.compressorNode = this.audioContext.createDynamicsCompressor();
    this.compressorNode.threshold.value = -18;
    this.compressorNode.knee.value = 12;
    this.compressorNode.ratio.value = 3;
    this.compressorNode.attack.value = 0.002;
    this.compressorNode.release.value = 0.16;

    this.crusherNode = await this.engine.createBitcrusherNode();

    this.filterNode.connect(this.crusherNode);
    this.crusherNode.connect(this.masterGain);
    this.masterGain.connect(this.compressorNode);
    this.compressorNode.connect(this.audioContext.destination);

    this.noiseBuffer = this.createNoiseBuffer(this.audioContext);
    this.setVolume(this.volume);
    this.setFilter(this.filterAmount);
    this.setCrush(this.crushAmount);
  }

  private handleTransportTick(step: number, barStart: boolean, time: number) {
    if (!this.engaged) {
      return;
    }

    if (this.pendingStart && barStart) {
      this.pendingStart = false;
      this.running = true;
      this.currentStep = 0;
    }

    if (!this.running) {
      return;
    }

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
