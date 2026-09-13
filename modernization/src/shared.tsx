import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
export const money = (minor: number | null | undefined) =>
  minor == null
    ? "—"
    : new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(
        minor / 100,
      );
export const dateLabel = (value: string) =>
  new Date(
    value.length === 10 ? value + "T12:00:00Z" : value,
  ).toLocaleDateString("en-GB", {
    timeZone: "Asia/Karachi",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
export function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const root = ref.current!;
    root.querySelector<HTMLElement>("button")?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
      if (event.key === "Tab") {
        const list = Array.from(
          root.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]',
          ),
        );
        const first = list[0],
          last = list.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    root.addEventListener("keydown", key);
    return () => {
      root.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, []);
  return (
    <div className="scrim">
      <section
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="dialog"
      >
        <header>
          <h2>{title}</h2>
          <button onClick={onClose} aria-label="Close dialog">
            <X size={18} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
