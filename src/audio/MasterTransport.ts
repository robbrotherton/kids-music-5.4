import { AudioEngine } from "./AudioEngine";

interface TransportEvent {
  barStart: boolean;
  barStep: number;
  time: number;
  transportStep: number;
}

type TransportListener = (event: TransportEvent) => void;

const LOOK_AHEAD_MS = 25;
const SCHEDULE_AHEAD_TIME = 0.12;
const BAR_STEPS = 16;

export class MasterTransport {
  private readonly engine: AudioEngine;
  private readonly listeners = new Set<TransportListener>();

  private audioContext: AudioContext | null = null;
  private timerId: number | null = null;
  private nextNoteTime = 0;
  private transportStep = 0;
  private claimCount = 0;
  private tempo = 108;

  constructor(engine: AudioEngine) {
    this.engine = engine;
  }

  subscribe(listener: TransportListener) {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  setTempo(tempo: number) {
    this.tempo = tempo;
  }

  isRunning() {
    return this.timerId !== null;
  }

  async acquire() {
    const wasRunning = this.isRunning();
    this.claimCount += 1;

    if (wasRunning) {
      await this.engine.resume();
      return;
    }

    this.audioContext = await this.engine.resume();
    this.transportStep = 0;
    this.nextNoteTime = this.audioContext.currentTime;
    this.timerId = window.setInterval(() => this.scheduler(), LOOK_AHEAD_MS);
  }

  release() {
    if (this.claimCount > 0) {
      this.claimCount -= 1;
    }

    if (this.claimCount === 0) {
      this.stop();
    }
  }

  private stop() {
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }

    this.transportStep = 0;
    this.nextNoteTime = 0;
  }

  private scheduler() {
    if (!this.audioContext) {
      return;
    }

    while (this.nextNoteTime < this.audioContext.currentTime + SCHEDULE_AHEAD_TIME) {
      const barStep = this.transportStep % BAR_STEPS;
      const event: TransportEvent = {
        barStart: barStep === 0,
        barStep,
        time: this.nextNoteTime,
        transportStep: this.transportStep,
      };

      for (const listener of this.listeners) {
        listener(event);
      }

      const secondsPerBeat = 60 / this.tempo;
      this.nextNoteTime += 0.25 * secondsPerBeat;
      this.transportStep += 1;
    }
  }
}
