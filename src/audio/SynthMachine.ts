import { AudioEngine } from "./AudioEngine";
import { MasterTransport } from "./MasterTransport";

interface SynthMachineOptions {
  stepCount: number;
  engine: AudioEngine;
  transport: MasterTransport;
  onStepChange?: (step: number) => void;
}

export type SynthWaveform = OscillatorType;
export type SynthRate = "half" | "normal" | "double" | "quad";

interface ActiveVoice {
  ampGain: GainNode;
  cleanupTimerId: number;
  oscA: OscillatorNode;
  oscB: OscillatorNode;
}

const SCALE_OFFSETS = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const midiToFrequency = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

export class SynthMachine {
  private readonly stepCount: number;
  private readonly engine: AudioEngine;
  private readonly transport: MasterTransport;
  private readonly onStepChange?: (step: number) => void;

  private audioContext: AudioContext | null = null;
  private dryGainNode: GainNode | null = null;
  private wetGainNode: GainNode | null = null;
  private delayNode: DelayNode | null = null;
  private feedbackGainNode: GainNode | null = null;
  private crusherNode: AudioWorkletNode | null = null;
  private masterGainNode: GainNode | null = null;
  private compressorNode: DynamicsCompressorNode | null = null;

  private currentStep = 0;
  private engaged = false;
  private pendingStart = false;
  private running = false;
  private startTransportStep = 0;
  private lastFrequency = midiToFrequency(60);
  private synthStepSerial = 0;
  private lastScheduledStepSerial: number | null = null;
  private unsubscribe: (() => void) | null = null;
  private sequence: number[];
  private activeVoices = new Set<ActiveVoice>();

  private tempo = 108;
  private transpose = 0;
  private waveform: SynthWaveform = "triangle";
  private rate: SynthRate = "normal";
  private filterAmount = 0.58;
  private release = 0.26;
  private glide = 0.08;
  private accent = 0.24;
  private delay = 0;
  private crush = 0;
  private detune = 0.08;

  constructor(options: SynthMachineOptions) {
    this.stepCount = options.stepCount;
    this.engine = options.engine;
    this.transport = options.transport;
    this.onStepChange = options.onStepChange;
    this.sequence = Array.from({ length: options.stepCount }, () => -1);
    this.unsubscribe = this.transport.subscribe((event) =>
      this.handleTransportTick(event.transportStep, event.barStart, event.time),
    );
  }

  setSequence(sequence: number[]) {
    this.sequence = sequence.map((value) => value);
  }

  setTempo(tempo: number) {
    this.tempo = tempo;
    this.transport.setTempo(tempo);

    if (this.delayNode) {
      this.delayNode.delayTime.setTargetAtTime(this.getDelayTime(), this.audioContext?.currentTime ?? 0, 0.02);
    }
  }

  setTranspose(semitones: number) {
    this.transpose = semitones;
  }

  setWaveform(waveform: SynthWaveform) {
    this.waveform = waveform;
  }

  setRate(rate: SynthRate) {
    this.rate = rate;
  }

  setFilter(amount: number) {
    this.filterAmount = amount;
  }

  setRelease(amount: number) {
    this.release = amount;
  }

  setGlide(amount: number) {
    this.glide = amount;
  }

  setAccent(amount: number) {
    this.accent = amount;
  }

  setDelay(amount: number) {
    this.delay = amount;

    if (!this.delayNode || !this.feedbackGainNode || !this.wetGainNode) {
      return;
    }

    const now = this.audioContext?.currentTime ?? 0;
    this.delayNode.delayTime.setTargetAtTime(this.getDelayTime(), now, 0.02);
    this.feedbackGainNode.gain.setTargetAtTime(amount < 0.02 ? 0 : 0.06 + amount * 0.34, now, 0.03);
    this.wetGainNode.gain.setTargetAtTime(amount < 0.02 ? 0 : amount * 0.26, now, 0.03);
  }

  setCrush(amount: number) {
    this.crush = amount;

    if (!this.crusherNode) {
      return;
    }

    const now = this.audioContext?.currentTime ?? 0;
    this.crusherNode.parameters.get("bits")?.setValueAtTime(16 - amount * 11, now);
    this.crusherNode.parameters.get("normfreq")?.setValueAtTime(Math.max(0.08, 1 - amount * 0.92), now);
  }

  setDetune(amount: number) {
    this.detune = amount;
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

    this.stopActiveVoices();
    this.engaged = false;
    this.pendingStart = false;
    this.running = false;
    this.currentStep = 0;
    this.synthStepSerial = 0;
    this.lastScheduledStepSerial = null;
    this.onStepChange?.(this.currentStep);
  }

  async previewStep(noteIndex: number) {
    await this.ensureAudio();
    await this.engine.resume();

    if (!this.audioContext) {
      return;
    }

    this.scheduleNote(noteIndex, this.audioContext.currentTime + 0.01, true, false);
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

    this.crusherNode = await this.engine.createBitcrusherNode();
    this.dryGainNode = this.audioContext.createGain();
    this.wetGainNode = this.audioContext.createGain();
    this.delayNode = this.audioContext.createDelay(1.5);
    this.feedbackGainNode = this.audioContext.createGain();
    this.masterGainNode = this.audioContext.createGain();
    this.masterGainNode.gain.value = 0.42;
    this.compressorNode = this.audioContext.createDynamicsCompressor();
    this.compressorNode.threshold.value = -16;
    this.compressorNode.knee.value = 8;
    this.compressorNode.ratio.value = 2.8;
    this.compressorNode.attack.value = 0.003;
    this.compressorNode.release.value = 0.18;

    this.crusherNode.connect(this.dryGainNode);
    this.crusherNode.connect(this.delayNode);
    this.delayNode.connect(this.feedbackGainNode);
    this.feedbackGainNode.connect(this.delayNode);
    this.delayNode.connect(this.wetGainNode);
    this.dryGainNode.connect(this.masterGainNode);
    this.wetGainNode.connect(this.masterGainNode);
    this.masterGainNode.connect(this.compressorNode);
    this.compressorNode.connect(this.audioContext.destination);

    this.setDelay(this.delay);
    this.setCrush(this.crush);
  }

  private handleTransportTick(transportStep: number, barStart: boolean, time: number) {
    if (!this.engaged) {
      return;
    }

    if (this.pendingStart && barStart) {
      this.pendingStart = false;
      this.running = true;
      this.currentStep = 0;
      this.startTransportStep = transportStep;
      this.synthStepSerial = 0;
      this.lastScheduledStepSerial = null;
    }

    if (!this.running) {
      return;
    }

    if (this.rate === "quad") {
      this.advanceSynthStep(time, transportStep);
      this.advanceSynthStep(time + this.getThirtySecondDuration(), transportStep);
      return;
    }

    const interval = this.getStepInterval();
    if ((transportStep - this.startTransportStep) % interval !== 0) {
      return;
    }

    this.advanceSynthStep(time, transportStep);
  }

  private advanceSynthStep(time: number, transportStep: number) {
    const step = this.currentStep;
    const noteIndex = this.sequence[step];
    const canGlide = this.lastScheduledStepSerial === this.synthStepSerial - 1;

    if (noteIndex >= 0) {
      this.scheduleNote(noteIndex, time, false, canGlide);
      this.lastScheduledStepSerial = this.synthStepSerial;
    } else {
      this.lastScheduledStepSerial = null;
    }

    const uiDelay = Math.max(0, time - (this.audioContext?.currentTime ?? 0)) * 1000;
    window.setTimeout(() => this.onStepChange?.(step), uiDelay);
    this.currentStep = (this.currentStep + 1) % this.stepCount;
    this.synthStepSerial += 1;
  }

  private scheduleNote(noteIndex: number, time: number, isPreview: boolean, canGlide: boolean) {
    if (!this.audioContext || !this.crusherNode) {
      return;
    }

    const offset = SCALE_OFFSETS[clamp(noteIndex, 0, SCALE_OFFSETS.length - 1)];
    const midi = 60 + this.transpose + offset;
    const frequency = midiToFrequency(midi);
    const releaseTime = (isPreview ? 0.18 : 0.09) + this.release * 0.34;
    const peak = 0.12 + this.accent * 0.16;
    const baseFilter = this.getBaseFilterFrequency();
    const accentLift = 1.12 + this.accent * 1.3;
    const detuneCurve = Math.pow(this.detune, 1.2);
    const detuneAmount = detuneCurve * 46;
    const glideTime = canGlide ? 0.002 + this.glide * 0.06 : 0;
    const attackTime = time + 0.01;

    const oscA = this.audioContext.createOscillator();
    const oscB = this.audioContext.createOscillator();
    const mixA = this.audioContext.createGain();
    const mixB = this.audioContext.createGain();
    const filterNode = this.audioContext.createBiquadFilter();
    const ampGain = this.audioContext.createGain();

    oscA.type = this.waveform;
    oscB.type = this.waveform;
    filterNode.type = "lowpass";

    mixA.gain.value = 0.8;
    mixB.gain.value = 0.2 + detuneCurve * 0.24;
    oscB.detune.value = detuneAmount;

    oscA.connect(mixA);
    oscB.connect(mixB);
    mixA.connect(filterNode);
    mixB.connect(filterNode);
    filterNode.connect(ampGain);
    ampGain.connect(this.crusherNode);

    const startFrequency = glideTime > 0 ? this.lastFrequency : frequency;
    oscA.frequency.setValueAtTime(startFrequency, time);
    oscB.frequency.setValueAtTime(startFrequency, time);

    if (glideTime > 0) {
      oscA.frequency.linearRampToValueAtTime(frequency, time + glideTime);
      oscB.frequency.linearRampToValueAtTime(frequency, time + glideTime);
    } else {
      oscA.frequency.setValueAtTime(frequency, time);
      oscB.frequency.setValueAtTime(frequency, time);
    }

    filterNode.Q.setValueAtTime(0.55 + this.filterAmount * 2.3, time);
    filterNode.frequency.setValueAtTime(baseFilter * 0.8, time);
    filterNode.frequency.linearRampToValueAtTime(Math.min(12000, baseFilter * accentLift), attackTime);
    filterNode.frequency.exponentialRampToValueAtTime(Math.max(160, baseFilter), time + releaseTime);

    ampGain.gain.setValueAtTime(0.0001, time);
    ampGain.gain.linearRampToValueAtTime(peak, attackTime);
    ampGain.gain.exponentialRampToValueAtTime(0.0001, time + releaseTime);

    oscA.start(time);
    oscB.start(time);

    const stopTime = time + releaseTime + 0.04;
    oscA.stop(stopTime);
    oscB.stop(stopTime);
    this.lastFrequency = frequency;

    const activeVoice: ActiveVoice = {
      ampGain,
      cleanupTimerId: 0,
      oscA,
      oscB,
    };

    activeVoice.cleanupTimerId = window.setTimeout(() => {
      oscA.disconnect();
      oscB.disconnect();
      mixA.disconnect();
      mixB.disconnect();
      filterNode.disconnect();
      ampGain.disconnect();
      this.activeVoices.delete(activeVoice);
    }, Math.max(0, stopTime - this.audioContext.currentTime) * 1000 + 60);

    this.activeVoices.add(activeVoice);
  }

  private stopActiveVoices() {
    if (!this.audioContext) {
      return;
    }

    const now = this.audioContext.currentTime;

    for (const voice of this.activeVoices) {
      window.clearTimeout(voice.cleanupTimerId);
      voice.ampGain.gain.cancelScheduledValues(now);
      voice.ampGain.gain.setTargetAtTime(0.0001, now, 0.015);
      try {
        voice.oscA.stop(now + 0.05);
      } catch {}
      try {
        voice.oscB.stop(now + 0.05);
      } catch {}
      window.setTimeout(() => {
        voice.oscA.disconnect();
        voice.oscB.disconnect();
        voice.ampGain.disconnect();
      }, 80);
    }

    this.activeVoices.clear();
  }

  private getBaseFilterFrequency() {
    return 220 + Math.pow(this.filterAmount, 2.1) * 5200;
  }

  private getDelayTime() {
    const beat = 60 / this.tempo;
    return beat * (0.18 + this.delay * 0.42);
  }

  private getStepInterval() {
    if (this.rate === "half") {
      return 4;
    }

    if (this.rate === "double") {
      return 1;
    }

    return 2;
  }

  private getThirtySecondDuration() {
    const secondsPerBeat = 60 / this.tempo;
    return secondsPerBeat * 0.125;
  }
}
