"use client";

import React, {
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
  type HTMLAttributes,
} from "react";

export interface CanvasOverlayScrollbarProps {
  /** The scrollable element to monitor and control. Defaults to previous element sibling if not provided. */
  targetRef?: React.RefObject<HTMLElement | null>;
  /** Optional custom class name */
  className?: string;
  /** Optional custom inline style overrides */
  style?: React.CSSProperties;
  /** Minimum thumb height in pixels (default: 24, matching browser standards) */
  minThumbHeight?: number;
}

/**
 * CanvasOverlayScrollbar
 *
 * Implements a high-performance Canvas 2D scrollbar overlay that guarantees ZERO layout shift.
 * Replaces native browser scrollbar visuals while leaving the native scroll engine
 * (wheel, trackpad, touch, keyboard, scrollTo, scrollIntoView) 100% active.
 *
 * Visual specifications (100% match with existing design system):
 * - Footprint: 10px width
 * - Track: transparent
 * - Thumb: 4px pill (3px left/right transparent inset)
 * - Margins: 3px top and bottom
 * - Border radius: 999px (fully rounded pill, radius 2px)
 * - Default color: var(--stroke)
 * - Hover / Active / Dragging color: var(--fg-muted)
 * - Retina / HiDPI support via devicePixelRatio
 * - requestAnimationFrame debounced rendering
 */
export function CanvasOverlayScrollbar({
  targetRef,
  className,
  style,
  minThumbHeight = 24,
}: CanvasOverlayScrollbarProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // State maintained in refs to avoid React re-renders during high-frequency scrolling
  const stateRef = useRef({
    isHovered: false,
    isDragging: false,
    dragStartY: 0,
    dragStartScrollTop: 0,
    thumbY: 3,
    thumbH: minThumbHeight,
    maxScrollTop: 0,
    maxThumbY: 0,
    isScrollable: false,
    rafId: 0,
    trackInterval: 0 as unknown as ReturnType<typeof setInterval>,
  });

  const getTarget = useCallback((): HTMLElement | null => {
    if (targetRef && "current" in targetRef && targetRef.current) {
      return targetRef.current;
    }
    const canvas = canvasRef.current;
    if (canvas && canvas.previousElementSibling instanceof HTMLElement) {
      return canvas.previousElementSibling;
    }
    return null;
  }, [targetRef]);

  const renderScrollbar = useCallback(() => {
    const canvas = canvasRef.current;
    const target = getTarget();
    if (!canvas || !target) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const state = stateRef.current;
    const clientHeight = target.clientHeight;
    const scrollHeight = target.scrollHeight;
    const scrollTop = target.scrollTop;

    // Set canvas dimensions with devicePixelRatio for crisp rendering
    const dpr = window.devicePixelRatio || 1;
    const displayWidth = 10;
    const displayHeight = clientHeight || target.offsetHeight || 0;

    const targetCanvasW = Math.round(displayWidth * dpr);
    const targetCanvasH = Math.round(displayHeight * dpr);

    if (canvas.width !== targetCanvasW || canvas.height !== targetCanvasH) {
      canvas.width = targetCanvasW;
      canvas.height = targetCanvasH;
    }
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;

    // Reset transform & scale for DPR
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, displayWidth, displayHeight);

    // Check if scrollable
    const isScrollable = scrollHeight > clientHeight + 1 && clientHeight > 0;
    state.isScrollable = isScrollable;

    if (!isScrollable) {
      canvas.style.pointerEvents = "none";
      return;
    }

    canvas.style.pointerEvents = "auto";

    // Calculate thumb dimensions matching native CSS:
    // ::-webkit-scrollbar-thumb { border: 3px solid transparent; background-clip: content-box; border-radius: 999px; }
    // In a 10px track: 3px left, 4px thumb, 3px right.
    // 3px top margin, 3px bottom margin.
    const topMargin = 3;
    const bottomMargin = 3;
    const availableTrack = Math.max(0, displayHeight - topMargin - bottomMargin);

    const ratio = clientHeight / scrollHeight;
    const thumbH = Math.max(minThumbHeight, Math.min(availableTrack, Math.round(ratio * availableTrack)));
    const maxScrollTop = Math.max(1, scrollHeight - clientHeight);
    const maxThumbY = Math.max(0, availableTrack - thumbH);

    const thumbProgress = Math.max(0, Math.min(1, scrollTop / maxScrollTop));
    const thumbY = topMargin + thumbProgress * maxThumbY;

    state.thumbY = thumbY;
    state.thumbH = thumbH;
    state.maxScrollTop = maxScrollTop;
    state.maxThumbY = maxThumbY;

    // Resolve theme colors dynamically
    let stroke = "#3d3d3d";
    let fgMuted = "#434343";
    try {
      const computed = window.getComputedStyle(target);
      const s = computed.getPropertyValue("--stroke").trim();
      const m = computed.getPropertyValue("--fg-muted").trim();
      if (s) stroke = s;
      if (m) fgMuted = m;
    } catch {
      // fallback to dark mode colors
    }

    const thumbColor = state.isDragging || state.isHovered ? fgMuted : stroke;

    // Draw 4px pill thumb centered in 10px track (x: 3 to 7)
    const pillX = 3;
    const pillWidth = 4;
    const pillRadius = 2;

    ctx.fillStyle = thumbColor;
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(pillX, thumbY, pillWidth, thumbH, pillRadius);
    } else {
      // Cross-browser fallback
      const r = Math.min(pillRadius, pillWidth / 2, thumbH / 2);
      ctx.moveTo(pillX + r, thumbY);
      ctx.lineTo(pillX + pillWidth - r, thumbY);
      ctx.arcTo(pillX + pillWidth, thumbY, pillX + pillWidth, thumbY + r, r);
      ctx.lineTo(pillX + pillWidth, thumbY + thumbH - r);
      ctx.arcTo(pillX + pillWidth, thumbY + thumbH, pillX + pillWidth - r, thumbY + thumbH, r);
      ctx.lineTo(pillX + r, thumbY + thumbH);
      ctx.arcTo(pillX, thumbY + thumbH, pillX, thumbY + thumbH - r, r);
      ctx.lineTo(pillX, thumbY + r);
      ctx.arcTo(pillX, thumbY, pillX + r, thumbY, r);
      ctx.closePath();
    }
    ctx.fill();
  }, [getTarget, minThumbHeight]);

  const scheduleRender = useCallback(() => {
    const state = stateRef.current;
    if (state.rafId) {
      cancelAnimationFrame(state.rafId);
    }
    state.rafId = requestAnimationFrame(() => {
      state.rafId = 0;
      renderScrollbar();
    });
  }, [renderScrollbar]);

  useEffect(() => {
    const target = getTarget();
    const canvas = canvasRef.current;
    if (!target || !canvas) return;

    // Ensure target's parent has relative positioning so canvas sits correctly
    const parent = canvas.parentElement;
    if (parent) {
      const computedPos = window.getComputedStyle(parent).position;
      if (computedPos === "static") {
        parent.style.position = "relative";
      }
    }

    // Initial render
    scheduleRender();

    // 1. Scroll listener on target
    const handleScroll = () => {
      scheduleRender();
    };
    target.addEventListener("scroll", handleScroll, { passive: true });

    // 2. ResizeObserver on target and its children
    const resizeObserver = new ResizeObserver(() => {
      scheduleRender();
    });
    resizeObserver.observe(target);
    for (const child of Array.from(target.children)) {
      resizeObserver.observe(child);
    }

    // 3. MutationObserver on target to detect dynamic children additions (infinite scroll, etc.)
    const targetMutationObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.addedNodes.length > 0) {
          for (const node of Array.from(m.addedNodes)) {
            if (node instanceof HTMLElement) {
              resizeObserver.observe(node);
            }
          }
        }
      }
      scheduleRender();
    });
    targetMutationObserver.observe(target, { childList: true, subtree: true });

    // 4. MutationObserver on documentElement to catch theme attribute changes
    const themeMutationObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "attributes" && (m.attributeName === "data-theme" || m.attributeName === "class")) {
          scheduleRender();
          break;
        }
      }
    });
    themeMutationObserver.observe(document.documentElement, { attributes: true });

    // 4. Window resize listener
    const handleWindowResize = () => {
      scheduleRender();
    };
    window.addEventListener("resize", handleWindowResize);

    // 5. Wheel event listener on canvas to scroll target seamlessly when hovering scrollbar
    const handleWheel = (e: WheelEvent) => {
      target.scrollTop += e.deltaY;
      if (e.deltaX) target.scrollLeft += e.deltaX;
    };
    canvas.addEventListener("wheel", handleWheel, { passive: true });

    // 6. Pointer interaction listeners on canvas
    const handlePointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return; // Only primary mouse button
      const state = stateRef.current;
      if (!state.isScrollable) return;

      const rect = canvas.getBoundingClientRect();
      const pointerY = e.clientY - rect.top;

      // Clicked on thumb -> initiate drag
      if (pointerY >= state.thumbY && pointerY <= state.thumbY + state.thumbH) {
        state.isDragging = true;
        state.dragStartY = e.clientY;
        state.dragStartScrollTop = target.scrollTop;
        window.addEventListener("pointermove", handleWindowPointerMove);
        window.addEventListener("pointerup", handleWindowPointerUp);
        window.addEventListener("pointercancel", handleWindowPointerUp);

        try {
          canvas.setPointerCapture(e.pointerId);
        } catch {
          // ignore
        }
        scheduleRender();
        e.preventDefault();
        return;
      }

      // Clicked on track -> page up or page down (matching native behavior)
      const isAbove = pointerY < state.thumbY;
      const direction = isAbove ? -1 : 1;
      const pageSize = target.clientHeight * 0.9;
      target.scrollBy({ top: direction * pageSize, behavior: "instant" });
      scheduleRender();
      e.preventDefault();
    };

    const handleWindowPointerMove = (e: PointerEvent) => {
      const state = stateRef.current;
      if (!state.isDragging || !state.isScrollable) return;

      const deltaY = e.clientY - state.dragStartY;
      if (state.maxThumbY > 0) {
        const scrollDelta = (deltaY / state.maxThumbY) * state.maxScrollTop;
        target.scrollTop = state.dragStartScrollTop + scrollDelta;
        scheduleRender();
      }
    };

    const handleWindowPointerUp = (e: PointerEvent) => {
      const state = stateRef.current;
      if (state.isDragging) {
        state.isDragging = false;
        try {
          canvas.releasePointerCapture(e.pointerId);
        } catch {
          // ignore
        }
        window.removeEventListener("pointermove", handleWindowPointerMove);
        window.removeEventListener("pointerup", handleWindowPointerUp);
        window.removeEventListener("pointercancel", handleWindowPointerUp);

        const rect = canvas.getBoundingClientRect();
        const pointerY = e.clientY - rect.top;
        state.isHovered = pointerY >= state.thumbY && pointerY <= state.thumbY + state.thumbH;
        scheduleRender();
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      const state = stateRef.current;
      if (!state.isScrollable || state.isDragging) return;

      // Check hover
      const rect = canvas.getBoundingClientRect();
      const pointerY = e.clientY - rect.top;
      const inThumb = pointerY >= state.thumbY && pointerY <= state.thumbY + state.thumbH;
      if (inThumb !== state.isHovered) {
        state.isHovered = inThumb;
        scheduleRender();
      }
    };

    const handlePointerLeave = () => {
      const state = stateRef.current;
      if (!state.isDragging && state.isHovered) {
        state.isHovered = false;
        scheduleRender();
      }
    };

    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerleave", handlePointerLeave);

    return () => {
      target.removeEventListener("scroll", handleScroll);
      resizeObserver.disconnect();
      targetMutationObserver.disconnect();
      themeMutationObserver.disconnect();
      window.removeEventListener("resize", handleWindowResize);
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", handleWindowPointerUp);
      window.removeEventListener("pointercancel", handleWindowPointerUp);
      canvas.removeEventListener("wheel", handleWheel);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerleave", handlePointerLeave);
      if (stateRef.current.rafId) {
        cancelAnimationFrame(stateRef.current.rafId);
      }
    };
  }, [getTarget, scheduleRender]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-hidden="true"
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        width: 10,
        height: "100%",
        pointerEvents: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        touchAction: "none",
        zIndex: 100,
        ...style,
      }}
    />
  );
}

export interface CanvasScrollContainerProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  wrapperStyle?: React.CSSProperties;
}

/**
 * CanvasScrollContainer
 *
 * All-in-one scrollable container with built-in CanvasOverlayScrollbar.
 * Guarantees zero layout shift across all viewport sizes, infinite scrolls, and modals.
 */
export function CanvasScrollContainer({
  children,
  scrollRef,
  wrapperStyle,
  style,
  className,
  ...props
}: CanvasScrollContainerProps) {
  const internalRef = useRef<HTMLDivElement>(null);
  const targetRef = scrollRef || internalRef;

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        ...wrapperStyle,
      }}
    >
      <div
        ref={targetRef}
        className={className}
        style={{
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          overflowY: "auto",
          overflowX: "hidden",
          ...style,
        }}
        {...props}
      >
        {children}
      </div>
      <CanvasOverlayScrollbar targetRef={targetRef} />
    </div>
  );
}
