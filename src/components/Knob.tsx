import type { JSX } from "preact";
import { useEffect, useRef } from "preact/hooks";

interface KnobProps {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  hue: number;
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));

type KnobPointerEvent = JSX.TargetedPointerEvent<HTMLButtonElement>;
type KnobStyle = JSX.CSSProperties & {
  "--knob-hue": string;
  "--knob-progress": string;
};

export function Knob({ id, label, value, onChange, hue }: KnobProps) {
  const dragValue = useRef(value);
  const startValue = useRef(value);
  const startY = useRef(0);
  const pointerId = useRef<number | null>(null);

  useEffect(() => {
    dragValue.current = value;
  }, [value]);

  const handlePointerDown = (event: KnobPointerEvent) => {
    pointerId.current = event.pointerId;
    startY.current = event.clientY;
    startValue.current = dragValue.current;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: KnobPointerEvent) => {
    if (pointerId.current !== event.pointerId) {
      return;
    }

    const delta = (startY.current - event.clientY) / 160;
    const next = clamp(startValue.current + delta);
    dragValue.current = next;
    onChange(next);
  };

  const handlePointerUp = (event: KnobPointerEvent) => {
    if (pointerId.current !== event.pointerId) {
      return;
    }

    pointerId.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const angle = 180 + value * 360;
  const percentage = Math.round(value * 100);

  return (
    <div class="knob-block">
      <button
        type="button"
        id={id}
        class="knob"
        style={{ "--knob-hue": `${hue}`, "--knob-progress": `${percentage}%` } as KnobStyle}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDblClick={() => onChange(0.5)}
        aria-label={`${label} ${percentage}%`}
      >
        <span class="knob__track" />
        <span class="knob__indicator" style={{ transform: `translateX(-50%) rotate(${angle}deg)` }} />
        <span class="knob__cap" />
      </button>
      <span class="knob-block__label">{label}</span>
      <span class="knob-block__value">{percentage}%</span>
    </div>
  );
}
