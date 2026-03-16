import type { JSX } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { AudioEngine } from "./audio/AudioEngine";
import { DrumMachine, type TrackDefinition } from "./audio/DrumMachine";
import { MasterTransport } from "./audio/MasterTransport";
import { SynthMachine, type SynthRate, type SynthWaveform } from "./audio/SynthMachine";
import { Knob } from "./components/Knob";

const DRUM_STEP_COUNT = 16;
const SYNTH_STEP_COUNT = 8;
const TEMPO_MIN = 80;
const TEMPO_MAX = 140;
const DEFAULT_TEMPO = 108;
const NOTE_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const SYNTH_WAVEFORMS: SynthWaveform[] = ["sine", "triangle", "sawtooth", "square"];
const SYNTH_RATES: SynthRate[] = ["half", "normal", "double", "quad"];
const SYNTH_RATE_LABELS: Record<SynthRate, string> = {
  half: "1/2x",
  normal: "1x",
  double: "2x",
  quad: "4x",
};
type TriStateLevel = 0 | 1 | 2;
type SynthScalePreset = "happy" | "sad" | "major";
type ModeControl = "hold" | "release" | "glide" | "accent" | "delay" | "crush" | "detune";
const SYNTH_SCALE_PRESETS: Record<SynthScalePreset, { label: string; emoji: string; offsets: number[] }> = {
  happy: {
    label: "Happy",
    emoji: "😊",
    offsets: [0, 2, 4, 7, 9, 12, 14, 16, 19, 21],
  },
  sad: {
    label: "Sad",
    emoji: "🌙",
    offsets: [0, 3, 5, 7, 10, 12, 15, 17, 19, 22],
  },
  major: {
    label: "Major",
    emoji: "🎼",
    offsets: [0, 2, 4, 5, 7, 9, 11, 12, 14, 16],
  },
};
const DEFAULT_SYNTH_SCALE: SynthScalePreset = "sad";
const SYNTH_SCALE_LENGTH = SYNTH_SCALE_PRESETS[DEFAULT_SYNTH_SCALE].offsets.length;
const DRUM_DIAL_SIZE = 472;
const SYNTH_DIAL_SIZE = 372;
const SYNTH_SEQUENCE_RADIUS = 108;
const MODE_VALUES: Record<ModeControl, readonly [number, number, number]> = {
  hold: [0, 0.35, 0.7],
  release: [0, 0.5, 1.0],
  glide: [0, 0.08, 0.38],
  accent: [0, 0.24, 0.48],
  delay: [0, 0.22, 0.58],
  crush: [0, 0.18, 0.8],
  detune: [0, 0.4, 1.0],
};
const SYNTH_NOTE_COLORS = [
  { color: "#ff8d7a", accent: "#ffd8cf" },
  { color: "#ffb347", accent: "#ffe8bd" },
  { color: "#ffd84d", accent: "#fff4be" },
  { color: "#9ad95f", accent: "#e0f5c6" },
  { color: "#56c9a2", accent: "#d1f4e8" },
  { color: "#59b8ff", accent: "#d8efff" },
  { color: "#6f9cff", accent: "#dfe8ff" },
  { color: "#9a7cff", accent: "#ece2ff" },
  { color: "#d97cff", accent: "#f5ddff" },
  { color: "#ff88bc", accent: "#ffddec" },
] as const;

const TRACKS: TrackDefinition[] = [
  {
    id: "kick",
    label: "Kick",
    color: "#ffb347",
    accentColor: "#fff0ce",
    radius: 206,
  },
  {
    id: "snare",
    label: "Snare",
    color: "#ff7f66",
    accentColor: "#ffd9d0",
    radius: 166,
  },
  {
    id: "hat",
    label: "Hat",
    color: "#56c9a2",
    accentColor: "#daf8ee",
    radius: 126,
  },
  {
    id: "perc",
    label: "Clack",
    color: "#6db7ff",
    accentColor: "#dff0ff",
    radius: 90,
  },
];

type StepButtonStyle = JSX.CSSProperties & {
  "--step-color": string;
  "--step-accent": string;
};

type NoteToneStyle = JSX.CSSProperties & {
  "--note-color": string;
  "--note-accent": string;
};

type ModeButtonStyle = JSX.CSSProperties & {
  "--mode-accent": string;
};

function createInitialDrumPattern() {
  return [
    [true, false, false, false, true, false, false, false, true, false, true, false, true, false, false, false],
    [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, true],
    [true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false],
    [false, false, false, true, false, false, true, false, false, true, false, false, false, false, true, false],
  ];
}

function randomizeDrumPattern() {
  return TRACKS.map((track, trackIndex) =>
    Array.from({ length: DRUM_STEP_COUNT }, (_, stepIndex) => {
      if (track.id === "kick") {
        return stepIndex % 4 === 0 || (stepIndex % 8 === 6 && Math.random() > 0.35);
      }

      if (track.id === "snare") {
        return stepIndex === 4 || stepIndex === 12 || Math.random() > 0.92;
      }

      if (track.id === "hat") {
        return Math.random() > (trackIndex === 2 ? 0.45 : 0.7);
      }

      return Math.random() > 0.82;
    }),
  );
}

function createInitialSynthSequence() {
  return [0, 2, 4, -1, 7, 4, 2, -1];
}

function randomizeSynthSequence(scaleLength: number) {
  const safeScaleLength = Math.max(1, scaleLength);
  const anchorChoices = [0, Math.min(2, safeScaleLength - 1), Math.min(4, safeScaleLength - 1), Math.min(7, safeScaleLength - 1)];

  return Array.from({ length: SYNTH_STEP_COUNT }, (_, stepIndex) => {
    if (stepIndex === 0 || stepIndex === 4) {
      return anchorChoices[Math.floor(Math.random() * anchorChoices.length)];
    }

    return Math.random() > 0.25 ? Math.floor(Math.random() * safeScaleLength) : -1;
  });
}

function getScaleNoteLabel(noteIndex: number, transpose: number, scaleOffsets: readonly number[]) {
  if (noteIndex < 0) {
    return "Rest";
  }

  const safeIndex = Math.max(0, Math.min(noteIndex, scaleOffsets.length - 1));
  const scaleOffset = scaleOffsets[safeIndex] ?? 0;
  const semitone = scaleOffset + transpose;
  const noteName = NOTE_NAMES[((semitone % 12) + 12) % 12];
  return scaleOffset >= 12 ? `${noteName}↑` : noteName;
}

function getNoteTone(noteIndex: number) {
  if (noteIndex < 0) {
    return { color: "#f0e7dc", accent: "#faf4ec" };
  }

  return SYNTH_NOTE_COLORS[noteIndex % SYNTH_NOTE_COLORS.length];
}

function normalizeTempo(tempo: number) {
  return (tempo - TEMPO_MIN) / (TEMPO_MAX - TEMPO_MIN);
}

function denormalizeTempo(value: number) {
  return Math.round(TEMPO_MIN + value * (TEMPO_MAX - TEMPO_MIN));
}

function normalizeSynthRate(rate: SynthRate) {
  return SYNTH_RATES.indexOf(rate) / (SYNTH_RATES.length - 1);
}

function getTriStateLevel(value: number, values: readonly [number, number, number]): TriStateLevel {
  const matches = values.findIndex((candidate) => Math.abs(candidate - value) < 0.001);
  return (matches >= 0 ? matches : 0) as TriStateLevel;
}

function getNextTriStateValue(value: number, values: readonly [number, number, number]) {
  const nextLevel = (getTriStateLevel(value, values) + 1) % values.length;
  return values[nextLevel] ?? values[0];
}

function dialOffsetToPercent(offset: number, dialSize: number) {
  return `${((offset + dialSize / 2) / dialSize) * 100}%`;
}

function dialLengthToPercent(length: number, dialSize: number) {
  return `${(length / dialSize) * 100}%`;
}

interface ActionOrbProps {
  label: string;
  kind: "spark" | "clear";
  onClick: () => void;
}

function ActionOrb({ label, kind, onClick }: ActionOrbProps) {
  return (
    <button
      type="button"
      class={`action-orb action-orb--${kind}`}
      onClick={onClick}
      aria-label={label}
    >
      <span class="action-orb__icon" aria-hidden="true">
        {kind === "spark" ? (
          <svg viewBox="0 0 16 16" fill="currentColor">
            <path d="M7.5.5a.5.5 0 0 1 .46.696L6.674 4.5h2.576a.5.5 0 0 1 .39.813L5.71 10.16l1.18-3.66H4.5a.5.5 0 0 1-.457-.703l2.99-4.99A.5.5 0 0 1 7.5.5Z" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" fill="currentColor">
            <path d="M8.086 1.207a1.5 1.5 0 0 1 2.121 0l4.586 4.586a1.5 1.5 0 0 1 0 2.121L9.914 12.793A1.5 1.5 0 0 1 8.854 13H3.5a.5.5 0 0 1-.354-.146l-2-2a.5.5 0 0 1 0-.708l6.94-6.939Zm1.414.707a.5.5 0 0 0-.707 0L2.207 8.5 3.707 10h4.94a.5.5 0 0 0 .353-.146l4.793-4.793a.5.5 0 0 0 0-.707L9.5 1.914ZM11.646 14.854a.5.5 0 0 0 .708 0l2-2a.5.5 0 0 0-.708-.708L12 13.793l-1.646-1.647a.5.5 0 0 0-.708.708l2 2Z" />
          </svg>
        )}
      </span>
    </button>
  );
}

interface TransportIconButtonProps {
  isPlaying: boolean;
  onClick: () => void;
  playLabel: string;
  pauseLabel: string;
}

function TransportIconButton({ isPlaying, onClick, playLabel, pauseLabel }: TransportIconButtonProps) {
  return (
    <button
      class={`dial-center-button ${isPlaying ? "is-live" : ""}`}
      type="button"
      onClick={onClick}
      aria-label={isPlaying ? pauseLabel : playLabel}
    >
      <span class="transport-icon" aria-hidden="true">
        {isPlaying ? (
          <svg viewBox="0 0 16 16" fill="currentColor">
            <path d="M5.5 3A1.5 1.5 0 0 1 7 4.5v7A1.5 1.5 0 0 1 5.5 13h-1A1.5 1.5 0 0 1 3 11.5v-7A1.5 1.5 0 0 1 4.5 3h1Zm6 0A1.5 1.5 0 0 1 13 4.5v7a1.5 1.5 0 0 1-1.5 1.5h-1A1.5 1.5 0 0 1 9 11.5v-7A1.5 1.5 0 0 1 10.5 3h1Z" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" fill="currentColor">
            <path d="M11.596 8.697 6.233 11.89A1 1 0 0 1 4.75 11.03V4.97a1 1 0 0 1 1.483-.86l5.363 3.193a.75.75 0 0 1 0 1.394Z" />
          </svg>
        )}
      </span>
    </button>
  );
}

interface TriStateModeButtonProps {
  control: ModeControl;
  value: number;
  onChange: (value: number) => void;
}

function TriStateModeButton({ control, value, onChange }: TriStateModeButtonProps) {
  const values = MODE_VALUES[control];
  const level = getTriStateLevel(value, values);
  const label =
    control === "hold"
      ? "Hold"
      : control === "release"
      ? "Release"
      : control === "glide"
        ? "Glide"
        : control === "accent"
          ? "Accent"
        : control === "delay"
          ? "Delay"
          : control === "crush"
            ? "Crush"
            : "Detune";
  const accent =
    control === "hold"
      ? "#3fdd9b"
      : control === "release"
      ? "#39d84a"
      : control === "glide"
        ? "#8b4dff"
        : control === "accent"
          ? "#ff9f2f"
        : control === "delay"
          ? "#3f8fff"
          : control === "crush"
            ? "#ff4f9f"
            : "#a8e533";

  return (
    <button
      type="button"
      class={`mode-button mode-button--${control} mode-button--level-${level}`}
      style={{ "--mode-accent": accent } as ModeButtonStyle}
      onClick={() => onChange(getNextTriStateValue(value, values))}
      aria-label={`${label} ${level === 0 ? "off" : level === 1 ? "low" : "high"}`}
      title={`${label}: ${level === 0 ? "Off" : level === 1 ? "Low" : "High"}`}
    >
      <span class="mode-button__icon" aria-hidden="true">
        {control === "hold" || control === "release" ? (
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 2h8L9.3 6.2a2 2 0 0 0 0 2.2L12 12H4l2.7-3.6a2 2 0 0 0 0-2.2Z" />
          </svg>
        ) : control === "glide" ? (
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M2 10c2.2 0 2.8-4 5-4s2.8 4 5 4 2.8-4 2.8-4" />
          </svg>
        ) : control === "accent" ? (
          <svg viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1.2 9.4 5l3.8 1.4-3.8 1.4L8 11.6 6.6 7.8 2.8 6.4 6.6 5 8 1.2Zm4.3 8.1.8 2.1 2.1.8-2.1.8-.8 2.1-.8-2.1-2.1-.8 2.1-.8.8-2.1Z" />
          </svg>
        ) : control === "delay" ? (
          <svg viewBox="0 0 16 16" fill="currentColor" style={{ transform: "scaleX(-1)" }}>
            <path d="M13.5 3.2h-1.9v9.6h1.9V3.2Zm-4.1 1.8H7.5v6h1.9V5Zm-4.1 2H3.4v2h1.9V7Z" />
          </svg>
        ) : control === "crush" ? (
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4.2" width="10" height="7.8" rx="2.2" />
            <path d="M6 2.5v1.7M10 2.5v1.7M3 8H1.8M14.2 8H13" />
            <circle cx="6.2" cy="7.7" r=".7" fill="currentColor" stroke="none" />
            <circle cx="9.8" cy="7.7" r=".7" fill="currentColor" stroke="none" />
            <path d="M6.1 10h3.8" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 3v10M11 3v10" />
            <path d="M3 6.2 5 4.6l2 1.6M9 11.4 11 9.8l2 1.6" />
          </svg>
        )}
      </span>
      <span class="mode-button__dots" aria-hidden="true">
        {([0, 1, 2] as const).map((dotLevel) => (
          <span key={dotLevel} class={`mode-button__dot ${dotLevel <= level ? "is-active" : ""}`} />
        ))}
      </span>
    </button>
  );
}

export function App() {
  const audioEngineRef = useRef<AudioEngine | null>(null);
  const drumMachineRef = useRef<DrumMachine | null>(null);
  const synthMachineRef = useRef<SynthMachine | null>(null);

  const [tempo, setTempo] = useState(108);

  const [drumPattern, setDrumPattern] = useState<boolean[][]>(() => createInitialDrumPattern());
  const [currentDrumStep, setCurrentDrumStep] = useState(0);
  const [isDrumPlaying, setIsDrumPlaying] = useState(false);
  const [drumVolumeAmount, setDrumVolumeAmount] = useState(0.6);
  const [drumFilterAmount, setDrumFilterAmount] = useState(0.78);
  const [drumHoldAmount, setDrumHoldAmount] = useState(MODE_VALUES.hold[1]);
  const [drumCrushAmount, setDrumCrushAmount] = useState(MODE_VALUES.crush[1]);

  const [synthSequence, setSynthSequence] = useState<number[]>(() => createInitialSynthSequence());
  const [selectedSynthStep, setSelectedSynthStep] = useState(0);
  const [currentSynthStep, setCurrentSynthStep] = useState(0);
  const [isSynthPlaying, setIsSynthPlaying] = useState(false);
  const [synthTranspose, setSynthTranspose] = useState(0);
  const [synthScalePreset, setSynthScalePreset] = useState<SynthScalePreset>(DEFAULT_SYNTH_SCALE);
  const [synthWaveform, setSynthWaveform] = useState<SynthWaveform>("triangle");
  const [synthRate, setSynthRate] = useState<SynthRate>("normal");
  const [synthFilter, setSynthFilter] = useState(0.58);
  const [synthRelease, setSynthRelease] = useState(MODE_VALUES.release[1]);
  const [synthGlide, setSynthGlide] = useState(MODE_VALUES.glide[1]);
  const [synthAccent, setSynthAccent] = useState(MODE_VALUES.accent[1]);
  const [synthDelay, setSynthDelay] = useState(MODE_VALUES.delay[0]);
  const [synthCrush, setSynthCrush] = useState(MODE_VALUES.crush[0]);
  const [synthDetune, setSynthDetune] = useState(MODE_VALUES.detune[1]);
  const activeSynthScale = SYNTH_SCALE_PRESETS[synthScalePreset];

  useEffect(() => {
    const audioEngine = new AudioEngine();
    const masterTransport = new MasterTransport(audioEngine);
    const drumMachine = new DrumMachine({
      stepCount: DRUM_STEP_COUNT,
      tracks: TRACKS,
      engine: audioEngine,
      transport: masterTransport,
      onStepChange: setCurrentDrumStep,
    });
    const synthMachine = new SynthMachine({
      stepCount: SYNTH_STEP_COUNT,
      engine: audioEngine,
      transport: masterTransport,
      onStepChange: setCurrentSynthStep,
    });

    audioEngineRef.current = audioEngine;
    drumMachineRef.current = drumMachine;
    synthMachineRef.current = synthMachine;

    drumMachine.setPattern(drumPattern);
    drumMachine.setTempo(tempo);
    drumMachine.setVolume(drumVolumeAmount);
    drumMachine.setFilter(drumFilterAmount);
    drumMachine.setHold(drumHoldAmount);
    drumMachine.setCrush(drumCrushAmount);

    synthMachine.setSequence(synthSequence);
    synthMachine.setTempo(tempo);
    synthMachine.setTranspose(synthTranspose);
    synthMachine.setScaleOffsets(activeSynthScale.offsets);
    synthMachine.setWaveform(synthWaveform);
    synthMachine.setRate(synthRate);
    synthMachine.setFilter(synthFilter);
    synthMachine.setRelease(synthRelease);
    synthMachine.setGlide(synthGlide);
    synthMachine.setAccent(synthAccent);
    synthMachine.setDelay(synthDelay);
    synthMachine.setCrush(synthCrush);
    synthMachine.setDetune(synthDetune);

    return () => {
      void drumMachine.dispose();
      void synthMachine.dispose();
      void audioEngine.dispose();
      drumMachineRef.current = null;
      synthMachineRef.current = null;
      audioEngineRef.current = null;
    };
  }, []);

  useEffect(() => {
    drumMachineRef.current?.setPattern(drumPattern);
  }, [drumPattern]);

  useEffect(() => {
    synthMachineRef.current?.setSequence(synthSequence);
  }, [synthSequence]);

  useEffect(() => {
    drumMachineRef.current?.setTempo(tempo);
    synthMachineRef.current?.setTempo(tempo);
  }, [tempo]);

  useEffect(() => {
    drumMachineRef.current?.setVolume(drumVolumeAmount);
  }, [drumVolumeAmount]);

  useEffect(() => {
    drumMachineRef.current?.setFilter(drumFilterAmount);
  }, [drumFilterAmount]);

  useEffect(() => {
    drumMachineRef.current?.setHold(drumHoldAmount);
  }, [drumHoldAmount]);

  useEffect(() => {
    drumMachineRef.current?.setCrush(drumCrushAmount);
  }, [drumCrushAmount]);

  useEffect(() => {
    synthMachineRef.current?.setTranspose(synthTranspose);
  }, [synthTranspose]);

  useEffect(() => {
    synthMachineRef.current?.setScaleOffsets(activeSynthScale.offsets);
  }, [activeSynthScale]);

  useEffect(() => {
    synthMachineRef.current?.setWaveform(synthWaveform);
  }, [synthWaveform]);

  useEffect(() => {
    synthMachineRef.current?.setRate(synthRate);
  }, [synthRate]);

  useEffect(() => {
    synthMachineRef.current?.setFilter(synthFilter);
  }, [synthFilter]);

  useEffect(() => {
    synthMachineRef.current?.setRelease(synthRelease);
  }, [synthRelease]);

  useEffect(() => {
    synthMachineRef.current?.setGlide(synthGlide);
  }, [synthGlide]);

  useEffect(() => {
    synthMachineRef.current?.setAccent(synthAccent);
  }, [synthAccent]);

  useEffect(() => {
    synthMachineRef.current?.setDelay(synthDelay);
  }, [synthDelay]);

  useEffect(() => {
    synthMachineRef.current?.setCrush(synthCrush);
  }, [synthCrush]);

  useEffect(() => {
    synthMachineRef.current?.setDetune(synthDetune);
  }, [synthDetune]);

  const drumStepButtons = useMemo(() => {
    return TRACKS.flatMap((track, trackIndex) =>
      drumPattern[trackIndex].map((isActive, stepIndex) => {
        const angle = (stepIndex / DRUM_STEP_COUNT) * Math.PI * 2 - Math.PI / 2;
        const x = Math.cos(angle) * track.radius;
        const y = Math.sin(angle) * track.radius;
        const isCurrent = stepIndex === currentDrumStep && isDrumPlaying;

        return (
          <button
            key={`${track.id}-${stepIndex}`}
            type="button"
            class={`step-button ${isActive ? "is-active" : ""} ${isCurrent ? "is-current" : ""}`}
            style={{
              left: dialOffsetToPercent(x, DRUM_DIAL_SIZE),
              top: dialOffsetToPercent(y, DRUM_DIAL_SIZE),
              "--step-color": track.color,
              "--step-accent": track.accentColor,
            } as StepButtonStyle}
            onClick={() => {
              setDrumPattern((previous) =>
                previous.map((row, rowIndex) =>
                  rowIndex === trackIndex
                    ? row.map((cell, cellIndex) => (cellIndex === stepIndex ? !cell : cell))
                    : [...row],
                ),
              );
            }}
            aria-label={`${track.label} step ${stepIndex + 1}`}
          >
            <span class="step-button__dot" />
          </button>
        );
      }),
    );
  }, [currentDrumStep, drumPattern, isDrumPlaying]);

  const synthStepButtons = useMemo(() => {
    return synthSequence.map((noteIndex, stepIndex) => {
      const angle = (stepIndex / SYNTH_STEP_COUNT) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(angle) * SYNTH_SEQUENCE_RADIUS;
      const y = Math.sin(angle) * SYNTH_SEQUENCE_RADIUS;
      const isCurrent = stepIndex === currentSynthStep && isSynthPlaying;
      const isSelected = stepIndex === selectedSynthStep;
      const label = getScaleNoteLabel(noteIndex, synthTranspose, activeSynthScale.offsets);
      const tone = getNoteTone(noteIndex);

      return (
        <button
          key={`synth-step-${stepIndex}`}
          type="button"
          class={`note-step ${isCurrent ? "is-current" : ""} ${isSelected ? "is-selected" : ""} ${
            noteIndex >= 0 ? "has-note" : "is-rest"
          }`}
          style={{
            left: dialOffsetToPercent(x, SYNTH_DIAL_SIZE),
            top: dialOffsetToPercent(y, SYNTH_DIAL_SIZE),
            "--note-color": tone.color,
            "--note-accent": tone.accent,
          } as NoteToneStyle}
          onClick={() => setSelectedSynthStep(stepIndex)}
          aria-label={`Synth step ${stepIndex + 1} ${label}`}
        >
          <span class="note-step__label">{noteIndex >= 0 ? label : "•"}</span>
        </button>
      );
    });
  }, [activeSynthScale, currentSynthStep, isSynthPlaying, selectedSynthStep, synthSequence, synthTranspose]);

  const synthKeyboardButtons = useMemo(() => {
    const noteOptions = [-1, ...Array.from({ length: activeSynthScale.offsets.length }, (_, noteIndex) => noteIndex)];

    return noteOptions.map((noteIndex) => {
      const label = getScaleNoteLabel(noteIndex, synthTranspose, activeSynthScale.offsets);
      const isActive = synthSequence[selectedSynthStep] === noteIndex;
      const tone = getNoteTone(noteIndex);

      return (
        <button
          key={`key-${noteIndex}`}
          type="button"
          class={`key-button ${isActive ? "is-active" : ""} ${noteIndex < 0 ? "is-rest" : ""}`}
          style={{ "--note-color": tone.color, "--note-accent": tone.accent } as NoteToneStyle}
          onClick={() => {
            setSynthSequence((previous) =>
              previous.map((value, stepIndex) => (stepIndex === selectedSynthStep ? noteIndex : value)),
            );
            if (noteIndex >= 0) {
              void synthMachineRef.current?.previewStep(noteIndex);
            }
          }}
          aria-label={noteIndex < 0 ? "Rest" : label}
        >
          <span>{noteIndex < 0 ? "•" : label}</span>
        </button>
      );
    });
  }, [activeSynthScale, selectedSynthStep, synthSequence, synthTranspose]);

  const tempoKnobValue = normalizeTempo(tempo);
  const synthRateKnobValue = normalizeSynthRate(synthRate);

  const toggleDrumPlayback = async () => {
    const drumMachine = drumMachineRef.current;

    if (!drumMachine) {
      return;
    }

    if (drumMachine.isRunning()) {
      drumMachine.stop();
      setIsDrumPlaying(false);
      return;
    }

    await drumMachine.start();
    setIsDrumPlaying(true);
  };

  const toggleSynthPlayback = async () => {
    const synthMachine = synthMachineRef.current;

    if (!synthMachine) {
      return;
    }

    if (synthMachine.isRunning()) {
      synthMachine.stop();
      setIsSynthPlaying(false);
      return;
    }

    await synthMachine.start();
    setIsSynthPlaying(true);
  };

  const handleTempoChange = (value: number) => {
    setTempo(denormalizeTempo(value));
  };

  const handleSynthRateChange = (value: number) => {
    const nextIndex = Math.round(value * (SYNTH_RATES.length - 1));
    setSynthRate(SYNTH_RATES[nextIndex] ?? "normal");
  };

  return (
    <main class="app-shell">
      <section class="instrument-stage">
        <section class="instrument-panel instrument-panel--drum">
          <div class="instrument-layout">
            <div class="sequencer-toolbar">
              <div class="action-orb-row" role="group" aria-label="Drum pattern actions">
                <ActionOrb label="Spark" kind="spark" onClick={() => setDrumPattern(randomizeDrumPattern())} />
                <ActionOrb
                  label="Clear"
                  kind="clear"
                  onClick={() => setDrumPattern(TRACKS.map(() => Array.from({ length: DRUM_STEP_COUNT }, () => false)))}
                />
              </div>

              <Knob
                id="tempo"
                label="Tempo"
                value={tempoKnobValue}
                onChange={handleTempoChange}
                hue={35}
                valueText={`${tempo}`}
                ariaValueText={`${tempo} beats per minute`}
                resetValue={normalizeTempo(DEFAULT_TEMPO)}
                size="compact"
                step={1 / (TEMPO_MAX - TEMPO_MIN)}
              />
            </div>

            <div class="sequencer-area">
              <div class="sequencer-frame sequencer-frame--drum">
                <div class="dial-stage dial-stage--drum">
                  <div class="machine__dial" aria-label="Circular drum sequencer">
                    <div class="dial-rings">
                      {TRACKS.map((track) => (
                        <div
                          key={track.id}
                          class="dial-ring"
                          style={{
                            width: dialLengthToPercent(track.radius * 2 + 40, DRUM_DIAL_SIZE),
                            height: dialLengthToPercent(track.radius * 2 + 40, DRUM_DIAL_SIZE),
                            borderColor: `${track.color}66`,
                          }}
                        />
                      ))}
                    </div>

                    {drumStepButtons}

                    <TransportIconButton
                      isPlaying={isDrumPlaying}
                      onClick={toggleDrumPlayback}
                      playLabel="Play drums"
                      pauseLabel="Pause drums"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div class="control-row control-row--drum" role="group" aria-label="Drum controls">
              <Knob
                id="drum-volume"
                label="Volume"
                value={drumVolumeAmount}
                onChange={setDrumVolumeAmount}
                hue={14}
                size="mini"
              />
              <Knob
                id="filter"
                label="Filter"
                value={drumFilterAmount}
                onChange={setDrumFilterAmount}
                hue={35}
                size="mini"
              />
              <TriStateModeButton control="hold" value={drumHoldAmount} onChange={setDrumHoldAmount} />
              <TriStateModeButton control="crush" value={drumCrushAmount} onChange={setDrumCrushAmount} />
            </div>
          </div>
        </section>

        <section class="instrument-panel instrument-panel--synth">
          <div class="instrument-layout">
            <div class="sequencer-toolbar sequencer-toolbar--synth">
              <div class="action-orb-row" role="group" aria-label="Synth pattern actions">
                <ActionOrb
                  label="Spark"
                  kind="spark"
                  onClick={() => setSynthSequence(randomizeSynthSequence(activeSynthScale.offsets.length))}
                />
                <ActionOrb
                  label="Clear"
                  kind="clear"
                  onClick={() => setSynthSequence(Array.from({ length: SYNTH_STEP_COUNT }, () => -1))}
                />
              </div>

              <div class="selector-strip selector-strip--wave selector-strip--toolbar" role="radiogroup" aria-label="Wave shape">
                {SYNTH_WAVEFORMS.map((waveform) => (
                  <button
                    key={waveform}
                    type="button"
                    class={`selector-button ${synthWaveform === waveform ? "is-active" : ""}`}
                    onClick={() => setSynthWaveform(waveform)}
                    role="radio"
                    aria-checked={synthWaveform === waveform}
                    aria-label={waveform === "sawtooth" ? "Saw" : waveform[0].toUpperCase() + waveform.slice(1)}
                  >
                    {waveform === "sawtooth" ? "Saw" : waveform[0].toUpperCase() + waveform.slice(1)}
                  </button>
                ))}
              </div>

              <Knob
                id="pattern-speed"
                label="Speed"
                value={synthRateKnobValue}
                onChange={handleSynthRateChange}
                hue={210}
                valueText={SYNTH_RATE_LABELS[synthRate]}
                ariaValueText={`Pattern speed ${SYNTH_RATE_LABELS[synthRate]}`}
                resetValue={normalizeSynthRate("normal")}
                size="compact"
                step={1 / (SYNTH_RATES.length - 1)}
              />
            </div>

            <div class="sequencer-area synth-sequencer-area">
              <div class="sequencer-frame sequencer-frame--synth">
                <div class="dial-stage dial-stage--synth">
                  <div class="synth-dial" aria-label="Circular synth sequencer">
                    <div class="synth-dial__ring" />
                    {synthStepButtons}

                    <TransportIconButton
                      isPlaying={isSynthPlaying}
                      onClick={toggleSynthPlayback}
                      playLabel="Play synth"
                      pauseLabel="Pause synth"
                    />
                  </div>
                </div>
              </div>

              <div class="keyboard-panel">
                <div class="key-shift-row">
                  <button
                    type="button"
                    class="transpose-arrow transpose-arrow--left"
                    onClick={() => setSynthTranspose((previous) => Math.max(-12, previous - 1))}
                    aria-label="Lower key"
                  >
                    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                      <path d="M10.5 2.5 4.5 8l6 5.5v-11Z" />
                    </svg>
                  </button>

                  <div class="keyboard-strip">{synthKeyboardButtons}</div>

                  <button
                    type="button"
                    class="transpose-arrow transpose-arrow--right"
                    onClick={() => setSynthTranspose((previous) => Math.min(12, previous + 1))}
                    aria-label="Raise key"
                  >
                    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                      <path d="M5.5 2.5 11.5 8l-6 5.5v-11Z" />
                    </svg>
                  </button>
                </div>

                <div class="keyboard-scale-row">
                  <div class="selector-strip selector-strip--scale" role="radiogroup" aria-label="Scale mood">
                    {(Object.keys(SYNTH_SCALE_PRESETS) as SynthScalePreset[]).map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        class={`selector-button selector-button--emoji ${synthScalePreset === preset ? "is-active" : ""}`}
                        onClick={() => setSynthScalePreset(preset)}
                        role="radio"
                        aria-checked={synthScalePreset === preset}
                        aria-label={SYNTH_SCALE_PRESETS[preset].label}
                        title={SYNTH_SCALE_PRESETS[preset].label}
                      >
                        <span aria-hidden="true">{SYNTH_SCALE_PRESETS[preset].emoji}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div class="control-row control-row--synth" role="group" aria-label="Synth controls">
              <Knob id="freq" label="Freq" value={synthFilter} onChange={setSynthFilter} hue={185} size="mini" />
              <TriStateModeButton control="release" value={synthRelease} onChange={setSynthRelease} />
              <TriStateModeButton control="glide" value={synthGlide} onChange={setSynthGlide} />
              <TriStateModeButton control="accent" value={synthAccent} onChange={setSynthAccent} />
              <TriStateModeButton control="delay" value={synthDelay} onChange={setSynthDelay} />
              <TriStateModeButton control="crush" value={synthCrush} onChange={setSynthCrush} />
              <TriStateModeButton control="detune" value={synthDetune} onChange={setSynthDetune} />
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
