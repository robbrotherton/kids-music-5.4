import type { JSX } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { DrumMachine, type TrackDefinition } from "./audio/DrumMachine";
import { Knob } from "./components/Knob";

const STEP_COUNT = 16;

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

type StepButtonStyle = JSX.CSSProperties & {
  "--step-color": string;
  "--step-accent": string;
};

function createInitialPattern() {
  return [
    [true, false, false, false, true, false, false, false, true, false, true, false, true, false, false, false],
    [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, true],
    [true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false],
    [false, false, false, true, false, false, true, false, false, true, false, false, false, false, true, false],
  ];
}

function randomizePattern() {
  return TRACKS.map((track, trackIndex) =>
    Array.from({ length: STEP_COUNT }, (_, stepIndex) => {
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

export function App() {
  const drumMachineRef = useRef<DrumMachine | null>(null);
  const [pattern, setPattern] = useState<boolean[][]>(() => createInitialPattern());
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [tempo, setTempo] = useState(108);
  const [filterAmount, setFilterAmount] = useState(0.78);
  const [holdAmount, setHoldAmount] = useState(0.35);
  const [crushAmount, setCrushAmount] = useState(0.12);

  useEffect(() => {
    const drumMachine = new DrumMachine({
      stepCount: STEP_COUNT,
      tracks: TRACKS,
      onStepChange: setCurrentStep,
    });

    drumMachine.setPattern(pattern);
    drumMachine.setTempo(tempo);
    drumMachine.setFilter(filterAmount);
    drumMachine.setHold(holdAmount);
    drumMachine.setCrush(crushAmount);
    drumMachineRef.current = drumMachine;

    return () => {
      void drumMachine.dispose();
      drumMachineRef.current = null;
    };
  }, []);

  useEffect(() => {
    drumMachineRef.current?.setPattern(pattern);
  }, [pattern]);

  useEffect(() => {
    drumMachineRef.current?.setTempo(tempo);
  }, [tempo]);

  useEffect(() => {
    drumMachineRef.current?.setFilter(filterAmount);
  }, [filterAmount]);

  useEffect(() => {
    drumMachineRef.current?.setHold(holdAmount);
  }, [holdAmount]);

  useEffect(() => {
    drumMachineRef.current?.setCrush(crushAmount);
  }, [crushAmount]);

  const stepButtons = useMemo(() => {
    return TRACKS.flatMap((track, trackIndex) =>
      pattern[trackIndex].map((isActive, stepIndex) => {
        const angle = (stepIndex / STEP_COUNT) * Math.PI * 2 - Math.PI / 2;
        const x = Math.cos(angle) * track.radius;
        const y = Math.sin(angle) * track.radius;
        const isCurrent = stepIndex === currentStep && isPlaying;

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
              setPattern((previous) =>
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
  }, [currentStep, isPlaying, pattern]);

  const togglePlayback = async () => {
    const drumMachine = drumMachineRef.current;

    if (!drumMachine) {
      return;
    }

    if (drumMachine.isRunning()) {
      drumMachine.stop();
      setIsPlaying(false);
      return;
    }

    await drumMachine.start();
    setIsPlaying(true);
  };

  return (
    <main class="app-shell">
      <header class="page-header">
        <p class="eyebrow">Orbit Drum Prototype</p>
        <h1>Drums first, with room for a synth panel next.</h1>
        <p class="subtitle">
          The drum section is now arranged as one self-contained instrument so the synth can arrive later
          as a clear second panel instead of sharing scattered controls.
        </p>
      </header>

      <section class="instrument-panel">
        <div class="instrument-panel__header">
          <div class="panel-intro">
            <p class="eyebrow">Drums</p>
            <h2>Tap the circles to make a loop.</h2>
            <p>
              Each ring is a different drum voice. The controls on the right only shape the drums, so
              the next synth panel can stay separate.
            </p>
          </div>

          <div class="transport-strip">
            <button class={`transport-button ${isPlaying ? "is-live" : ""}`} type="button" onClick={togglePlayback}>
              {isPlaying ? "Stop Drums" : "Play Drums"}
            </button>

            <div class="tempo-card">
              <div class="tempo-card__label">
                <span>Tempo</span>
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
          </div>
        </div>

        <div class="instrument-panel__body">
          <div class="sequencer-area">
            <div class="machine__dial" aria-label="Circular step sequencer">
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

              {stepButtons}

              <button
                class={`dial-center-button ${isPlaying ? "is-live" : ""}`}
                type="button"
                onClick={togglePlayback}
                aria-label={isPlaying ? "Pause drums" : "Play drums"}
              >
                {isPlaying ? "Pause" : "Play"}
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
                <button class="soft-button" type="button" onClick={() => setPattern(randomizePattern())}>
                  Spark
                </button>
                <button
                  class="soft-button soft-button--ghost"
                  type="button"
                  onClick={() => setPattern(TRACKS.map(() => Array.from({ length: STEP_COUNT }, () => false)))}
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
                <Knob id="filter" label="Filter" value={filterAmount} onChange={setFilterAmount} hue={35} />
                <Knob id="hold" label="Hold" value={holdAmount} onChange={setHoldAmount} hue={155} />
                <Knob id="crusher" label="Crusher" value={crushAmount} onChange={setCrushAmount} hue={208} />
              </div>
            </div>

            <div class="control-note">
              <p>
                The drum engine is still separate from the UI, so when the synth arrives we can give it
                its own panel and decide later whether transport is shared or split.
              </p>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
