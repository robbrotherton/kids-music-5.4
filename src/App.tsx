import type { JSX } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { AudioEngine } from "./audio/AudioEngine";
import { DrumMachine, type TrackDefinition } from "./audio/DrumMachine";
import { MasterTransport } from "./audio/MasterTransport";
import { SynthMachine, type SynthRate, type SynthWaveform } from "./audio/SynthMachine";
import { Knob } from "./components/Knob";

const DRUM_STEP_COUNT = 16;
const SYNTH_STEP_COUNT = 8;
const SYNTH_SCALE_LENGTH = 10;
const NOTE_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const MINOR_PENTATONIC = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22];
const SYNTH_WAVEFORMS: SynthWaveform[] = ["sine", "triangle", "sawtooth", "square"];
const SYNTH_RATES: SynthRate[] = ["half", "normal", "double", "quad"];
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
    radius: 254,
  },
  {
    id: "snare",
    label: "Snare",
    color: "#ff7f66",
    accentColor: "#ffd9d0",
    radius: 206,
  },
  {
    id: "hat",
    label: "Hat",
    color: "#56c9a2",
    accentColor: "#daf8ee",
    radius: 158,
  },
  {
    id: "perc",
    label: "Clack",
    color: "#6db7ff",
    accentColor: "#dff0ff",
    radius: 110,
  },
];

type Panel = "drums" | "synth";

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

function randomizeSynthSequence() {
  return Array.from({ length: SYNTH_STEP_COUNT }, (_, stepIndex) => {
    if (stepIndex === 0 || stepIndex === 4) {
      return [0, 2, 4, 7][Math.floor(Math.random() * 4)];
    }

    return Math.random() > 0.25 ? Math.floor(Math.random() * SYNTH_SCALE_LENGTH) : -1;
  });
}

function getKeyName(transpose: number) {
  const rootIndex = ((transpose % 12) + 12) % 12;
  return NOTE_NAMES[rootIndex];
}

function getScaleNoteLabel(noteIndex: number, transpose: number) {
  if (noteIndex < 0) {
    return "Rest";
  }

  const semitone = MINOR_PENTATONIC[noteIndex] + transpose;
  const noteName = NOTE_NAMES[((semitone % 12) + 12) % 12];
  return noteIndex >= 5 ? `${noteName}↑` : noteName;
}

function getNoteTone(noteIndex: number) {
  if (noteIndex < 0) {
    return { color: "#f0e7dc", accent: "#faf4ec" };
  }

  return SYNTH_NOTE_COLORS[noteIndex % SYNTH_NOTE_COLORS.length];
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
  const swipeStartXRef = useRef<number | null>(null);

  const [activePanel, setActivePanel] = useState<Panel>("drums");
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
  const [synthWaveform, setSynthWaveform] = useState<SynthWaveform>("triangle");
  const [synthRate, setSynthRate] = useState<SynthRate>("normal");
  const [synthFilter, setSynthFilter] = useState(0.58);
  const [synthRelease, setSynthRelease] = useState(0.26);
  const [synthGlide, setSynthGlide] = useState(0.08);
  const [synthAccent, setSynthAccent] = useState(0.24);
  const [synthDelay, setSynthDelay] = useState(0);
  const [synthCrush, setSynthCrush] = useState(0);
  const [synthDetune, setSynthDetune] = useState(0.08);

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
              left: `calc(50% + ${x}px)`,
              top: `calc(50% + ${y}px)`,
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
      const x = Math.cos(angle) * 156;
      const y = Math.sin(angle) * 156;
      const isCurrent = stepIndex === currentSynthStep && isSynthPlaying;
      const isSelected = stepIndex === selectedSynthStep;
      const label = getScaleNoteLabel(noteIndex, synthTranspose);
      const tone = getNoteTone(noteIndex);

      return (
        <button
          key={`synth-step-${stepIndex}`}
          type="button"
          class={`note-step ${isCurrent ? "is-current" : ""} ${isSelected ? "is-selected" : ""} ${
            noteIndex >= 0 ? "has-note" : "is-rest"
          }`}
          style={{
            left: `calc(50% + ${x}px)`,
            top: `calc(50% + ${y}px)`,
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
  }, [currentSynthStep, isSynthPlaying, selectedSynthStep, synthSequence, synthTranspose]);

  const synthKeyboardButtons = useMemo(() => {
    return Array.from({ length: SYNTH_SCALE_LENGTH }, (_, noteIndex) => {
      const label = getScaleNoteLabel(noteIndex, synthTranspose);
      const isActive = synthSequence[selectedSynthStep] === noteIndex;
      const tone = getNoteTone(noteIndex);

      return (
        <button
          key={`key-${noteIndex}`}
          type="button"
          class={`key-button ${isActive ? "is-active" : ""}`}
          style={{ "--note-color": tone.color, "--note-accent": tone.accent } as NoteToneStyle}
          onClick={() => {
            setSynthSequence((previous) =>
              previous.map((value, stepIndex) => (stepIndex === selectedSynthStep ? noteIndex : value)),
            );
            void synthMachineRef.current?.previewStep(noteIndex);
          }}
        >
          <span>{label}</span>
        </button>
      );
    });
  }, [selectedSynthStep, synthSequence, synthTranspose]);

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

  const handleStagePointerDown = (event: JSX.TargetedPointerEvent<HTMLDivElement>) => {
    swipeStartXRef.current = event.clientX;
  };

  const handleStagePointerUp = (event: JSX.TargetedPointerEvent<HTMLDivElement>) => {
    if (swipeStartXRef.current === null) {
      return;
    }

    const delta = event.clientX - swipeStartXRef.current;
    swipeStartXRef.current = null;

    if (Math.abs(delta) < 56) {
      return;
    }

    setActivePanel(delta < 0 ? "synth" : "drums");
  };

  return (
    <main class="app-shell">
      <section class="workspace-bar">
        <div class="instrument-switcher" aria-label="Instrument panels">
          <button
            type="button"
            class={`switch-pill ${activePanel === "drums" ? "is-active" : ""}`}
            onClick={() => setActivePanel("drums")}
          >
            Drums
          </button>
          <button
            type="button"
            class={`switch-pill ${activePanel === "synth" ? "is-active" : ""}`}
            onClick={() => setActivePanel("synth")}
          >
            Synth
          </button>
        </div>

        <div class="tempo-card tempo-card--global">
          <div class="tempo-card__label">
            <span>Shared tempo</span>
            <strong>{tempo} BPM</strong>
          </div>
          <input
            class="tempo-slider"
            type="range"
            min="80"
            max="140"
            step="1"
            value={tempo}
            onInput={(event) => setTempo(Number((event.currentTarget as HTMLInputElement).value))}
            aria-label="Tempo"
          />
        </div>
      </section>

      <section
        class="instrument-stage"
        onPointerDown={handleStagePointerDown}
        onPointerUp={handleStagePointerUp}
        onPointerCancel={() => {
          swipeStartXRef.current = null;
        }}
      >
        <div
          class="instrument-stage__track"
          style={{ transform: `translateX(${activePanel === "drums" ? "0%" : "-50%"})` }}
        >
          <section class="instrument-panel">
            <div class="instrument-panel__body">
              <div class="sequencer-area">
                <div class="machine__dial" aria-label="Circular drum sequencer">
                  <div class="dial-rings">
                    {TRACKS.map((track) => (
                      <div
                        key={track.id}
                        class="dial-ring"
                        style={{
                          width: `${track.radius * 2 + 40}px`,
                          height: `${track.radius * 2 + 40}px`,
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

              <aside class="control-bank">
                <div class="control-cluster">
                  <div class="action-orb-row">
                    <ActionOrb label="Spark" kind="spark" onClick={() => setDrumPattern(randomizeDrumPattern())} />
                    <ActionOrb
                      label="Clear"
                      kind="clear"
                      onClick={() => setDrumPattern(TRACKS.map(() => Array.from({ length: DRUM_STEP_COUNT }, () => false)))}
                    />
                  </div>
                </div>

                <div class="control-cluster">
                  <div class="knob-grid">
                    <Knob id="drum-volume" label="Volume" value={drumVolumeAmount} onChange={setDrumVolumeAmount} hue={14} />
                    <Knob id="filter" label="Filter" value={drumFilterAmount} onChange={setDrumFilterAmount} hue={35} />
                    <Knob id="hold" label="Hold" value={drumHoldAmount} onChange={setDrumHoldAmount} hue={155} />
                    <Knob id="crusher" label="Crusher" value={drumCrushAmount} onChange={setDrumCrushAmount} hue={208} />
                  </div>
                </div>
              </aside>
            </div>
          </section>

          <section class="instrument-panel instrument-panel--synth">
            <div class="instrument-panel__header instrument-panel__header--minimal">
              <div class="pitch-strip">
                <button
                  type="button"
                  class="chip-button"
                  onClick={() => setSynthTranspose((previous) => Math.max(-12, previous - 1))}
                >
                  Key -
                </button>
                <div class="pitch-readout">
                  <span>Key</span>
                  <strong>{getKeyName(synthTranspose)} minor pentatonic</strong>
                </div>
                <button
                  type="button"
                  class="chip-button"
                  onClick={() => setSynthTranspose((previous) => Math.min(12, previous + 1))}
                >
                  Key +
                </button>
              </div>
            </div>

            <div class="instrument-panel__body">
              <div class="sequencer-area synth-sequencer-area">
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

                <div class="keyboard-panel">
                  <div class="keyboard-strip">{synthKeyboardButtons}</div>
                </div>
              </div>

              <aside class="control-bank">
                <div class="control-cluster">
                  <div class="action-orb-row">
                    <ActionOrb label="Spark" kind="spark" onClick={() => setSynthSequence(randomizeSynthSequence())} />
                    <ActionOrb
                      label="Clear"
                      kind="clear"
                      onClick={() => setSynthSequence(Array.from({ length: SYNTH_STEP_COUNT }, () => -1))}
                    />
                  </div>

                  <div class="action-row action-row--single">
                    <button
                      class="soft-button soft-button--ghost"
                      type="button"
                      onClick={() =>
                        setSynthSequence((previous) =>
                          previous.map((value, stepIndex) => (stepIndex === selectedSynthStep ? -1 : value)),
                        )
                      }
                    >
                      Rest Step
                    </button>
                  </div>

                  <div class="rate-selector" role="radiogroup" aria-label="Synth rate">
                    {SYNTH_RATES.map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        class={`rate-button ${synthRate === rate ? "is-active" : ""}`}
                        onClick={() => setSynthRate(rate)}
                        role="radio"
                        aria-checked={synthRate === rate}
                      >
                        {rate === "half" ? "1/2x" : rate === "double" ? "2x" : rate === "quad" ? "4x" : "1x"}
                      </button>
                    ))}
                  </div>
                </div>

                <div class="control-cluster">
                  <div class="wave-selector" role="radiogroup" aria-label="Wave shape">
                    {SYNTH_WAVEFORMS.map((waveform) => (
                      <button
                        key={waveform}
                        type="button"
                        class={`wave-button ${synthWaveform === waveform ? "is-active" : ""}`}
                        onClick={() => setSynthWaveform(waveform)}
                        role="radio"
                        aria-checked={synthWaveform === waveform}
                        aria-label={waveform === "sawtooth" ? "Saw" : waveform[0].toUpperCase() + waveform.slice(1)}
                      >
                        {waveform === "sawtooth" ? "Saw" : waveform[0].toUpperCase() + waveform.slice(1)}
                      </button>
                    ))}
                  </div>

                  <div class="knob-grid knob-grid--wide">
                    <Knob id="freq" label="Freq" value={synthFilter} onChange={setSynthFilter} hue={185} />
                    <Knob id="release" label="Release" value={synthRelease} onChange={setSynthRelease} hue={128} />
                    <Knob id="glide" label="Glide" value={synthGlide} onChange={setSynthGlide} hue={265} />
                    <Knob id="accent" label="Accent" value={synthAccent} onChange={setSynthAccent} hue={18} />
                    <Knob id="delay" label="Delay" value={synthDelay} onChange={setSynthDelay} hue={210} />
                    <Knob id="crush-2" label="Crush" value={synthCrush} onChange={setSynthCrush} hue={334} />
                    <Knob id="detune" label="Detune" value={synthDetune} onChange={setSynthDetune} hue={78} />
                  </div>
                </div>
              </aside>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
