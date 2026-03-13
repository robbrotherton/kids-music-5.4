import type { JSX } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { AudioEngine } from "./audio/AudioEngine";
import { DrumMachine, type TrackDefinition } from "./audio/DrumMachine";
import { SynthMachine, type SynthWaveform } from "./audio/SynthMachine";
import { Knob } from "./components/Knob";

const DRUM_STEP_COUNT = 16;
const SYNTH_STEP_COUNT = 8;
const SYNTH_SCALE_LENGTH = 10;
const NOTE_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const MINOR_PENTATONIC = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22];
const SYNTH_WAVEFORMS: SynthWaveform[] = ["sine", "triangle", "sawtooth", "square"];

const TRACKS: TrackDefinition[] = [
  {
    id: "kick",
    label: "Kick",
    color: "#ffb347",
    accentColor: "#fff0ce",
    radius: 212,
  },
  {
    id: "snare",
    label: "Snare",
    color: "#ff7f66",
    accentColor: "#ffd9d0",
    radius: 164,
  },
  {
    id: "hat",
    label: "Hat",
    color: "#56c9a2",
    accentColor: "#daf8ee",
    radius: 116,
  },
  {
    id: "perc",
    label: "Clack",
    color: "#6db7ff",
    accentColor: "#dff0ff",
    radius: 68,
  },
];

type Panel = "drums" | "synth";

type StepButtonStyle = JSX.CSSProperties & {
  "--step-color": string;
  "--step-accent": string;
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
  const [drumFilterAmount, setDrumFilterAmount] = useState(0.78);
  const [drumHoldAmount, setDrumHoldAmount] = useState(0.35);
  const [drumCrushAmount, setDrumCrushAmount] = useState(0.12);

  const [synthSequence, setSynthSequence] = useState<number[]>(() => createInitialSynthSequence());
  const [selectedSynthStep, setSelectedSynthStep] = useState(0);
  const [currentSynthStep, setCurrentSynthStep] = useState(0);
  const [isSynthPlaying, setIsSynthPlaying] = useState(false);
  const [synthTranspose, setSynthTranspose] = useState(0);
  const [synthWaveform, setSynthWaveform] = useState<SynthWaveform>("triangle");
  const [synthFilter, setSynthFilter] = useState(0.58);
  const [synthRelease, setSynthRelease] = useState(0.26);
  const [synthGlide, setSynthGlide] = useState(0.08);
  const [synthAccent, setSynthAccent] = useState(0.24);
  const [synthDelay, setSynthDelay] = useState(0);
  const [synthCrush, setSynthCrush] = useState(0);
  const [synthDetune, setSynthDetune] = useState(0.08);

  useEffect(() => {
    const audioEngine = new AudioEngine();
    const drumMachine = new DrumMachine({
      stepCount: DRUM_STEP_COUNT,
      tracks: TRACKS,
      engine: audioEngine,
      onStepChange: setCurrentDrumStep,
    });
    const synthMachine = new SynthMachine({
      stepCount: SYNTH_STEP_COUNT,
      engine: audioEngine,
      onStepChange: setCurrentSynthStep,
    });

    audioEngineRef.current = audioEngine;
    drumMachineRef.current = drumMachine;
    synthMachineRef.current = synthMachine;

    drumMachine.setPattern(drumPattern);
    drumMachine.setTempo(tempo);
    drumMachine.setFilter(drumFilterAmount);
    drumMachine.setHold(drumHoldAmount);
    drumMachine.setCrush(drumCrushAmount);

    synthMachine.setSequence(synthSequence);
    synthMachine.setTempo(tempo);
    synthMachine.setTranspose(synthTranspose);
    synthMachine.setWaveform(synthWaveform);
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
          }}
          onClick={() => setSelectedSynthStep(stepIndex)}
          aria-label={`Synth step ${stepIndex + 1} ${label}`}
        >
          <small>{stepIndex + 1}</small>
          <strong>{noteIndex >= 0 ? label : "Rest"}</strong>
        </button>
      );
    });
  }, [currentSynthStep, isSynthPlaying, selectedSynthStep, synthSequence, synthTranspose]);

  const synthKeyboardButtons = useMemo(() => {
    return Array.from({ length: SYNTH_SCALE_LENGTH }, (_, noteIndex) => {
      const label = getScaleNoteLabel(noteIndex, synthTranspose);
      const isActive = synthSequence[selectedSynthStep] === noteIndex;

      return (
        <button
          key={`key-${noteIndex}`}
          type="button"
          class={`key-button ${isActive ? "is-active" : ""}`}
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
      <header class="page-header">
        <p class="eyebrow">Orbit Duo Prototype</p>
        <h1>Two instrument panels, one light browser synth toy.</h1>
        <p class="subtitle">
          This pass borrows the Dato Duo idea of a circular note sequencer, a keyboard lane underneath,
          and a separate performance-control side, while keeping the browser audio path as lean as
          possible.
        </p>
      </header>

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

      <p class="swipe-hint">Swipe sideways or tap the tabs to switch between drums and synth.</p>

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
            <div class="instrument-panel__header">
              <div class="panel-intro">
                <p class="eyebrow">Drums</p>
                <h2>Tap the circles to make a beat.</h2>
                <p>
                  The drum panel stays focused: touch the rings to build the loop, then shape the whole
                  kit with a few bold controls.
                </p>
              </div>
            </div>

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

                  <button
                    class={`dial-center-button ${isDrumPlaying ? "is-live" : ""}`}
                    type="button"
                    onClick={toggleDrumPlayback}
                    aria-label={isDrumPlaying ? "Pause drums" : "Play drums"}
                  >
                    {isDrumPlaying ? "Pause" : "Play"}
                  </button>
                </div>

                <div class="track-legend">
                  {TRACKS.map((track) => (
                    <div key={track.id} class="track-chip">
                      <span class="track-chip__swatch" style={{ backgroundColor: track.color }} />
                      <span>{track.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <aside class="control-bank">
                <div class="control-cluster">
                  <div class="control-cluster__header">
                    <p class="eyebrow">Pattern</p>
                    <h3>Quick actions</h3>
                    <p>Start with a groove, clear it, then tap your own pattern into the rings.</p>
                  </div>

                  <div class="action-row">
                    <button class="soft-button" type="button" onClick={() => setDrumPattern(randomizeDrumPattern())}>
                      Spark
                    </button>
                    <button
                      class="soft-button soft-button--ghost"
                      type="button"
                      onClick={() => setDrumPattern(TRACKS.map(() => Array.from({ length: DRUM_STEP_COUNT }, () => false)))}
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div class="control-cluster">
                  <div class="control-cluster__header">
                    <p class="eyebrow">Shape</p>
                    <h3>Drum sound</h3>
                    <p>Drag the dials up and down. Double-tap a dial to snap it back to the middle.</p>
                  </div>

                  <div class="knob-grid">
                    <Knob id="filter" label="Filter" value={drumFilterAmount} onChange={setDrumFilterAmount} hue={35} />
                    <Knob id="hold" label="Hold" value={drumHoldAmount} onChange={setDrumHoldAmount} hue={155} />
                    <Knob id="crusher" label="Crusher" value={drumCrushAmount} onChange={setDrumCrushAmount} hue={208} />
                  </div>
                </div>

                <div class="control-note">
                  <p>
                    Drums and synth now share the same browser audio context, which is the main efficiency
                    win for keeping playback smooth on weaker hardware.
                  </p>
                </div>
              </aside>
            </div>
          </section>

          <section class="instrument-panel instrument-panel--synth">
            <div class="instrument-panel__header">
              <div class="panel-intro">
                <p class="eyebrow">Synth</p>
                <h2>Pick notes below, then press play in the middle.</h2>
                <p>
                  This is a lightweight monophonic synth with an eight-step circular sequencer and a
                  minor-pentatonic keyboard so it stays musical quickly.
                </p>
              </div>

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

                  <button
                    class={`dial-center-button dial-center-button--synth ${isSynthPlaying ? "is-live" : ""}`}
                    type="button"
                    onClick={toggleSynthPlayback}
                    aria-label={isSynthPlaying ? "Pause synth" : "Play synth"}
                  >
                    {isSynthPlaying ? "Pause" : "Play"}
                  </button>
                </div>

                <div class="keyboard-panel">
                  <div class="keyboard-panel__header">
                    <span>Selected step</span>
                    <strong>
                      {selectedSynthStep + 1}: {getScaleNoteLabel(synthSequence[selectedSynthStep], synthTranspose)}
                    </strong>
                  </div>
                  <div class="keyboard-strip">{synthKeyboardButtons}</div>
                </div>
              </div>

              <aside class="control-bank">
                <div class="control-cluster">
                  <div class="control-cluster__header">
                    <p class="eyebrow">Pattern</p>
                    <h3>Line builder</h3>
                    <p>Select a step on the ring, then tap a key below to assign or preview that note.</p>
                  </div>

                  <div class="action-row action-row--triple">
                    <button class="soft-button" type="button" onClick={() => setSynthSequence(randomizeSynthSequence())}>
                      Spark
                    </button>
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
                    <button
                      class="soft-button soft-button--ghost"
                      type="button"
                      onClick={() => setSynthSequence(Array.from({ length: SYNTH_STEP_COUNT }, () => -1))}
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div class="control-cluster">
                  <div class="control-cluster__header">
                    <p class="eyebrow">Performance</p>
                    <h3>Voice controls</h3>
                    <p>
                      Pick a waveform first, then use detune to thicken it. Filter, release, glide, delay, crush, and
                      accent shape the movement around them.
                    </p>
                  </div>

                  <div class="wave-selector" role="radiogroup" aria-label="Wave shape">
                    {SYNTH_WAVEFORMS.map((waveform) => (
                      <button
                        key={waveform}
                        type="button"
                        class={`wave-button ${synthWaveform === waveform ? "is-active" : ""}`}
                        onClick={() => setSynthWaveform(waveform)}
                        role="radio"
                        aria-checked={synthWaveform === waveform}
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
