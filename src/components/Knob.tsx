import type { JSX } from "preact";
import { useEffect, useRef } from "preact/hooks";

interface KnobProps {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  hue: number;
  valueText?: string;
  ariaValueText?: string;
  resetValue?: number;
  size?: "default" | "compact";
  step?: number;
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));

type KnobPointerEvent = JSX.TargetedPointerEvent<HTMLButtonElement>;
type KnobStyle = JSX.CSSProperties & {
  "--knob-hue": string;
  "--knob-progress": string;
};

export function Knob({
  id,
  label,
  value,
  onChange,
  hue,
  valueText,
  ariaValueText,
  resetValue,
  size = "default",
  step,
}: KnobProps) {
  const dragValue = useRef(value);
  const startValue = useRef(value);
  const startY = useRef(0);
  const pointerId = useRef<number | null>(null);

  const quantize = (nextValue: number) => {
    const clamped = clamp(nextValue);

    if (!step || step <= 0) {
      return clamped;
    }

    return clamp(Math.round(clamped / step) * step);
  };

  const updateValue = (nextValue: number) => {
    const quantized = quantize(nextValue);
    dragValue.current = quantized;
    onChange(quantized);
  };

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
    updateValue(startValue.current + delta);
  };

  const handlePointerUp = (event: KnobPointerEvent) => {
    if (pointerId.current !== event.pointerId) {
      return;
    }

    pointerId.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const handleKeyDown = (event: JSX.TargetedKeyboardEvent<HTMLButtonElement>) => {
    const keyboardStep = step ?? 0.01;
    const largeStep = keyboardStep * 4;

    if (event.key === "ArrowUp" || event.key === "ArrowRight") {
      event.preventDefault();
      updateValue(dragValue.current + keyboardStep);
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
      event.preventDefault();
      updateValue(dragValue.current - keyboardStep);
      return;
    }

    if (event.key === "PageUp") {
      event.preventDefault();
      updateValue(dragValue.current + largeStep);
      return;
    }

    if (event.key === "PageDown") {
      event.preventDefault();
      updateValue(dragValue.current - largeStep);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      updateValue(0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      updateValue(1);
    }
  };

  const angle = 180 + value * 360;
  const percentage = Math.round(value * 100);
  const displayValue = valueText ?? `${percentage}%`;
  const spokenValue = ariaValueText ?? displayValue;
  const blockClassName = `knob-block ${size === "compact" ? "knob-block--compact" : ""}`;

  return (
    <div class={blockClassName}>
      <button
        type="button"
        id={id}
        class="knob"
        style={{ "--knob-hue": `${hue}`, "--knob-progress": `${percentage}%` } as KnobStyle}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleKeyDown}
        onDblClick={() => updateValue(resetValue ?? 0.5)}
        role="slider"
        aria-label={label}
        aria-orientation="vertical"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percentage}
        aria-valuetext={spokenValue}
      >
        <span class="knob__track" />
        <span class="knob__indicator" style={{ transform: `translateX(-50%) rotate(${angle}deg)` }} />
        <span class="knob__cap" />
      </button>
      <span class="knob-block__label">{label}</span>
      <span class="knob-block__value">{displayValue}</span>
    </div>
  );
}
