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
type SynthScalePreset = "happy" | "sad" | "major";
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
  const [drumHoldAmount, setDrumHoldAmount] = useState(0.35);
  const [drumCrushAmount, setDrumCrushAmount] = useState(0.12);

  const [synthSequence, setSynthSequence] = useState<number[]>(() => createInitialSynthSequence());
  const [selectedSynthStep, setSelectedSynthStep] = useState(0);
  const [currentSynthStep, setCurrentSynthStep] = useState(0);
  const [isSynthPlaying, setIsSynthPlaying] = useState(false);
  const [synthTranspose, setSynthTranspose] = useState(0);
  const [synthScalePreset, setSynthScalePreset] = useState<SynthScalePreset>(DEFAULT_SYNTH_SCALE);
  const [synthWaveform, setSynthWaveform] = useState<SynthWaveform>("triangle");
  const [synthRate, setSynthRate] = useState<SynthRate>("normal");
  const [synthFilter, setSynthFilter] = useState(0.58);
  const [synthRelease, setSynthRelease] = useState(0.26);
  const [synthGlide, setSynthGlide] = useState(0.08);
  const [synthAccent, setSynthAccent] = useState(0.24);
  const [synthDelay, setSynthDelay] = useState(0);
  const [synthCrush, setSynthCrush] = useState(0);
  const [synthDetune, setSynthDetune] = useState(0.08);
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
              <Knob
                id="hold"
                label="Hold"
                value={drumHoldAmount}
                onChange={setDrumHoldAmount}
                hue={155}
                size="mini"
              />
              <Knob
                id="crusher"
                label="Crusher"
                value={drumCrushAmount}
                onChange={setDrumCrushAmount}
                hue={208}
                size="mini"
              />
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
              <Knob
                id="release"
                label="Release"
                value={synthRelease}
                onChange={setSynthRelease}
                hue={128}
                size="mini"
              />
              <Knob id="glide" label="Glide" value={synthGlide} onChange={setSynthGlide} hue={265} size="mini" />
              <Knob id="accent" label="Accent" value={synthAccent} onChange={setSynthAccent} hue={18} size="mini" />
              <Knob id="delay" label="Delay" value={synthDelay} onChange={setSynthDelay} hue={210} size="mini" />
              <Knob id="crush-2" label="Crush" value={synthCrush} onChange={setSynthCrush} hue={334} size="mini" />
              <Knob id="detune" label="Detune" value={synthDetune} onChange={setSynthDetune} hue={78} size="mini" />
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
