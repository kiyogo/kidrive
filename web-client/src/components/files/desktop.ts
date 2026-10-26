"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/*
  The desktop interaction layer, ported from
  features/files/widgets/desktop: marquee selection, keyboard selection, and
  dragging a node onto a folder.

  A mouse is a mouse at any window size, so none of this is gated on the
  desktop breakpoint. It is gated on there being a mouse at all: a finger
  dragging on a phone is scrolling, and always will be.
*/

export function hasPointer(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(pointer: fine)").matches;
}

export interface Band {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Rubber band selection: press on empty space and everything the box touches
 * becomes selected.
 *
 * Only a primary press that starts on empty space begins one. A press that
 * starts on a tile belongs to that tile, which is how a tile can be dragged
 * into a folder without the two gestures fighting.
 */
export function useMarquee({
  containerRef,
  itemSelector,
  onChange,
  onEmptyClick,
  enabled = true,
}: {
  containerRef: React.RefObject<HTMLElement | null>;
  /** each element carries data-node-id */
  itemSelector: string;
  onChange: (ids: string[], additive: boolean) => void;
  onEmptyClick: () => void;
  enabled?: boolean;
}) {
  const [band, setBand] = useState<Band | null>(null);
  const from = useRef<{ x: number; y: number } | null>(null);
  const dragged = useRef(false);
  const additive = useRef(false);

  useEffect(() => {
    const host = containerRef.current;
    if (!host || !enabled) return;

    const SLOP = 4;

    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      // a mouse, not a finger. A finger dragging is scrolling, and always
      // will be. Asked of the event rather than of a media query, because a
      // media query answers about the device and gets it wrong often enough
      // to silently disable this on a real desktop.
      if (e.pointerType && e.pointerType !== "mouse") return;
      const target = e.target as HTMLElement;
      // a press on a tile is that tile's gesture
      if (target.closest(itemSelector)) return;
      // and a press on a control or panel/dialog/menu is that element's
      if (target.closest("button, a, input, select, textarea, aside, .menu, [role='dialog'], [role='menu'], [role='region']")) return;

      from.current = { x: e.clientX, y: e.clientY };
      dragged.current = false;
      additive.current = e.ctrlKey || e.metaKey;
      window.getSelection()?.removeAllRanges();
    };

    const move = (e: PointerEvent) => {
      const start = from.current;
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (!dragged.current && Math.hypot(dx, dy) < SLOP) return;
      dragged.current = true;
      e.preventDefault();
      window.getSelection()?.removeAllRanges();

      const rect: Band = {
        x: Math.min(start.x, e.clientX),
        y: Math.min(start.y, e.clientY),
        w: Math.abs(dx),
        h: Math.abs(dy),
      };
      setBand(rect);

      const hits: string[] = [];
      host.querySelectorAll<HTMLElement>(itemSelector).forEach((el) => {
        const b = el.getBoundingClientRect();
        const overlaps =
          b.left < rect.x + rect.w && b.right > rect.x && b.top < rect.y + rect.h && b.bottom > rect.y;
        const id = el.dataset.nodeId;
        if (overlaps && id) hits.push(id);
      });
      onChange(hits, additive.current);
    };

    const up = () => {
      const hadStart = from.current !== null;
      const wasDrag = dragged.current;
      const wasAdditive = additive.current;
      from.current = null;
      dragged.current = false;
      setBand(null);
      window.getSelection()?.removeAllRanges();
      // a click on nothing means "never mind". Ctrl is excluded because
      // holding it is how somebody adds to a selection, not clears it.
      if (hadStart && !wasDrag && !wasAdditive) onEmptyClick();
    };

    const onSelectStart = (e: Event) => {
      if (from.current || dragged.current) {
        e.preventDefault();
      }
    };

    host.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("selectstart", onSelectStart);
    return () => {
      host.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("selectstart", onSelectStart);
    };
  }, [containerRef, itemSelector, onChange, onEmptyClick, enabled]);

  return band;
}

/**
 * Ctrl+A, Delete and Escape.
 *
 * A file manager that needs the mouse for everything is one nobody trusts with
 * a hundred files.
 */
export function useFileKeys({
  onSelectAll,
  onDelete,
  onEscape,
  onCopy,
  onCut,
  onPaste,
  onRename,
  enabled = true,
}: {
  onSelectAll: () => void;
  onDelete: () => void;
  onEscape: () => void;
  onCopy?: () => void;
  onCut?: () => void;
  onPaste?: () => void;
  onRename?: () => void;
  enabled?: boolean;
}) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      // never steal a key from something being typed into
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (target?.isContentEditable) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        onSelectAll();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        if (onCopy) {
          e.preventDefault();
          onCopy();
          return;
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "x") {
        if (onCut) {
          e.preventDefault();
          onCut();
          return;
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
        if (onPaste) {
          e.preventDefault();
          onPaste();
          return;
        }
      }
      if (e.key === "F2") {
        if (onRename) {
          e.preventDefault();
          onRename();
          return;
        }
      }
      if (e.key === "Delete") {
        e.preventDefault();
        onDelete();
        return;
      }
      if (e.key === "Escape") onEscape();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSelectAll, onDelete, onEscape, onCopy, onCut, onPaste, onRename, enabled]);
}

/**
 * Shift extends a selection from the last thing clicked, the way a file list
 * has behaved since before any of this existed.
 */
export function rangeBetween(ids: string[], from: string | null, to: string): string[] {
  if (!from) return [to];
  const a = ids.indexOf(from);
  const b = ids.indexOf(to);
  if (a < 0 || b < 0) return [to];
  const [lo, hi] = a < b ? [a, b] : [b, a];
  return ids.slice(lo, hi + 1);
}

/** The band itself: a wash of the accent with a one pixel edge, the same way
 *  every other surface is drawn. */
export function bandStyle(band: Band): React.CSSProperties {
  return {
    position: "fixed",
    left: band.x,
    top: band.y,
    width: band.w,
    height: band.h,
    background: "rgba(76,141,255,0.14)",
    border: "1px solid var(--accent)",
    pointerEvents: "none",
    zIndex: 300,
  };
}

/** Dragging a node onto a folder. The payload is the ids being moved. */
export const NODE_DRAG_TYPE = "application/x-localdrive-nodes";

export function useNodeDrag(
  onMove: (ids: string[], intoFolderId: string) => void,
  /** files and folders dragged in from the desktop, dropped onto a specific folder */
  onDropFiles?: (dataTransfer: DataTransfer, intoFolderId: string) => void,
  getSelection?: () => Set<string>,
) {
  const [over, setOver] = useState<string>("");

  const dragProps = useCallback(
    (nodeId: string, selection?: Set<string>) => ({
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        // dragging an unselected tile drags that one, not the selection
        const sel = selection ?? (getSelection ? getSelection() : new Set<string>());
        const ids = sel.has(nodeId) ? [...sel] : [nodeId];
        e.dataTransfer.setData(NODE_DRAG_TYPE, JSON.stringify(ids));
        e.dataTransfer.effectAllowed = "move";
      },
    }),
    [getSelection],
  );

  const folderProps = useCallback(
    (folderId: string) => ({
      onDragOver: (e: React.DragEvent) => {
        const types = e.dataTransfer.types;
        const ours = types.includes(NODE_DRAG_TYPE);
        // "Files" is what a drag from the desktop carries. Lighting the folder
        // under the pointer is the whole difference between dropping into the
        // folder you aimed at and dropping into the one you happen to be in.
        const fromDesktop = types.includes("Files");
        if (!ours && !fromDesktop) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = ours ? "move" : "copy";
        setOver(folderId);
      },
      onDragLeave: () => setOver((f) => (f === folderId ? "" : f)),
      onDrop: (e: React.DragEvent) => {
        const types = e.dataTransfer.types;
        const ours = types.includes(NODE_DRAG_TYPE);
        const fromDesktop = types.includes("Files");
        if (!ours && !fromDesktop) return;
        e.preventDefault();
        e.stopPropagation();
        setOver("");

        if (fromDesktop && !ours) {
          onDropFiles?.(e.dataTransfer, folderId);
          return;
        }
        try {
          const ids = JSON.parse(e.dataTransfer.getData(NODE_DRAG_TYPE)) as string[];
          // a folder cannot be dropped into itself
          onMove(ids.filter((id) => id !== folderId), folderId);
        } catch {
          /* a drag from somewhere else, which is not ours to read */
        }
      },
    }),
    [onMove, onDropFiles],
  );

  return { over, dragProps, folderProps };
}
