"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Drag and drop built on pointer events rather than the HTML5 drag API,
 * because HTML5 dragging does not work on touch screens — and the crew
 * uses this on a phone or a tablet in the truck.
 *
 * A drop target is any element carrying a `data-drop` attribute; its
 * value is handed to `onDrop` along with whatever payload the dragged
 * item started with.
 */
export interface DragState<T> {
  payload: T;
  label: string;
  x: number;
  y: number;
}

export function useDragDrop<T>(onDrop: (payload: T, target: string) => void) {
  const [drag, setDrag] = useState<DragState<T> | null>(null);
  const [overTarget, setOverTarget] = useState<string | null>(null);
  const dragRef = useRef<DragState<T> | null>(null);
  const movedRef = useRef(false);

  dragRef.current = drag;

  const targetAt = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y);
    return el?.closest<HTMLElement>("[data-drop]")?.dataset.drop ?? null;
  };

  const startDrag = useCallback(
    (payload: T, label: string, e: React.PointerEvent) => {
      // Ignore right-clicks and secondary buttons.
      if (e.button !== 0 && e.pointerType === "mouse") return;
      movedRef.current = false;
      setDrag({ payload, label, x: e.clientX, y: e.clientY });
    },
    []
  );

  useEffect(() => {
    if (!drag) return;

    function move(e: PointerEvent) {
      e.preventDefault();
      movedRef.current = true;
      setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY } : d));
      setOverTarget(targetAt(e.clientX, e.clientY));
    }

    function end(e: PointerEvent) {
      const current = dragRef.current;
      const target = targetAt(e.clientX, e.clientY);
      setDrag(null);
      setOverTarget(null);
      // A tap without movement isn't a drop — let click handlers run.
      if (current && target && movedRef.current) {
        onDrop(current.payload, target);
      }
    }

    function cancel() {
      setDrag(null);
      setOverTarget(null);
    }

    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", cancel);
    };
  }, [drag, onDrop]);

  /** Floating chip that follows the finger or cursor. */
  const ghost = drag ? (
    <div
      className="fixed z-[100] pointer-events-none rounded-[20px] bg-pine text-[var(--white)] px-3.5 py-2 text-[12.5px] font-semibold shadow-lg -translate-x-1/2 -translate-y-1/2 opacity-90"
      style={{ left: drag.x, top: drag.y }}
    >
      {drag.label}
    </div>
  ) : null;

  return { startDrag, ghost, overTarget, dragging: !!drag };
}
