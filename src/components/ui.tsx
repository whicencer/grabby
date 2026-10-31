import { useEffect, useRef, useState } from "react";
import type { ButtonHTMLAttributes } from "react";
import { Check, ChevronDown, ImageOff } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { QualityOption } from "../types";

// Small shared primitives. Everything is monochrome: emphasis = inversion (bg-fg text-bg).

type ButtonVariant = "primary" | "secondary" | "ghost";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-fg text-bg hover:opacity-85",
  secondary: "bg-surface text-fg hover:bg-surface-hover",
  ghost: "text-muted hover:bg-surface hover:text-fg",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant };

export function Button({ variant = "secondary", className = "", ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={`inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition disabled:pointer-events-none disabled:opacity-40 ${buttonVariants[variant]} ${className}`}
      {...props}
    />
  );
}

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string };

export function IconButton({ icon: Icon, label, className = "", ...props }: IconButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={`inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-surface hover:text-fg ${className}`}
      {...props}
    >
      <Icon className="size-4" />
    </button>
  );
}

type SwitchProps = { checked: boolean; onChange: (checked: boolean) => void; label: string };

export function Switch({ checked, onChange, label }: SwitchProps) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2.5 text-sm">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition ${checked ? "bg-fg" : "bg-line"}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 size-4 rounded-full bg-bg transition-transform ${checked ? "translate-x-4" : ""}`}
        />
      </button>
      {label}
    </label>
  );
}

type SelectProps = {
  value: string;
  options: QualityOption[];
  onChange: (value: string) => void;
  label: string;
};

export function Select({ value, options, onChange, label }: SelectProps) {
  return (
    <div className="relative">
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 cursor-pointer appearance-none rounded-lg bg-surface py-0 pr-8 pl-3 text-sm outline-none hover:bg-surface-hover"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted" />
    </div>
  );
}

type ThumbProps = { src: string | null; className?: string };

// Grayscale on purpose: keeps the black-and-white look even with colorful covers
export function Thumb({ src, className = "" }: ThumbProps) {
  const [failed, setFailed] = useState(false);

  return (
    <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface text-muted ${className}`}>
      {src && !failed ? (
        <img src={src} alt="" draggable={false} onError={() => setFailed(true)} className="size-full object-cover grayscale" />
      ) : (
        <ImageOff className="size-5" />
      )}
    </div>
  );
}

type ToastProps = {
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  onClose: () => void;
  duration?: number;
};

// Bottom toast that hides itself after `duration` ms
export function Toast({ title, description, action, onClose, duration = 6000 }: ToastProps) {
  // Keep the latest onClose without restarting the timer on every parent render
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const timer = setTimeout(() => onCloseRef.current(), duration);
    return () => clearTimeout(timer);
  }, [duration]);

  return (
    <div
      role="status"
      className="fixed bottom-6 left-1/2 z-50 flex max-w-sm -translate-x-1/2 items-center gap-3 rounded-xl bg-fg px-4 py-3 text-bg shadow-lg transition duration-300 starting:translate-y-4 starting:opacity-0"
    >
      <Check className="size-4 shrink-0" />
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        {description && <p className="truncate text-xs opacity-70">{description}</p>}
      </div>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="shrink-0 rounded-lg bg-bg/15 px-2.5 py-1 text-xs font-medium transition hover:bg-bg/25"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
