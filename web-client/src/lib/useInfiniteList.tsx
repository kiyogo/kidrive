"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Spinner } from "@/components/ui";

export interface PageResult<T> {
  items: T[];
  hasMore: boolean;
  nextOffset?: number;
  total?: number;
}

export interface UseInfiniteListOptions<T> {
  fetchPage: (params: {
    offset: number;
    limit: number;
    signal: AbortSignal;
  }) => Promise<PageResult<T>>;
  pageSize?: number;
  getItemKey?: (item: T) => string;
  deps?: unknown[];
  enabled?: boolean;
  autoLoadUntilComplete?: boolean;
  initialItems?: T[];
  onItemsUpdated?: (items: T[]) => void;
}

/**
 * Adaptive page size calculator based on hardware/network capabilities.
 * Guarantees smooth scrolling and prevents DOM / texture memory overload.
 */
export function getAdaptivePageSize(min = 40, max = 100): number {
  if (typeof window === "undefined") return 60;
  try {
    const memory = (navigator as any).deviceMemory || 4;
    const cpus = navigator.hardwareConcurrency || 4;
    const conn = (navigator as any).connection;

    let size = 60;
    if (memory >= 8 && cpus >= 8) {
      size = 90;
    } else if (memory <= 4 || cpus <= 4) {
      size = 50;
    }

    if (conn) {
      if (conn.saveData || conn.effectiveType === "2g" || conn.effectiveType === "3g") {
        size = Math.min(size, 30);
      } else if (conn.effectiveType === "4g" && conn.downlink >= 15) {
        size = Math.min(max, size + 20);
      }
    }
    return Math.max(min, Math.min(max, size));
  } catch {
    return 60;
  }
}

/**
 * Universal Infinite Scroll Hook
 * - Adaptive batching (50-100 items based on hardware & network)
 * - Load-on-demand as user scrolls (no infinite background runaway)
 * - IntersectionObserver sentinel + fallback scroll listener
 * - Strict key deduplication and AbortController request cleanup
 * - Robust loading state clearing to prevent stuck spinners
 */
export function useInfiniteList<T>({
  fetchPage,
  pageSize = 60,
  getItemKey = (item: T) => (item as any)?.id ?? String(item),
  deps = [],
  enabled = true,
  autoLoadUntilComplete = false,
  initialItems,
  onItemsUpdated,
}: UseInfiniteListOptions<T>) {
  const [items, setItems] = useState<T[]>(() => initialItems ?? []);
  const [loading, setLoading] = useState(() => !(initialItems && initialItems.length > 0));
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState<number | undefined>(undefined);

  const offsetRef = useRef(0);
  const hasMoreRef = useRef(true);
  const isFetchingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const sentinelElementRef = useRef<HTMLElement | null>(null);

  // Keep references to prevent stale closures
  const fetchPageRef = useRef(fetchPage);
  fetchPageRef.current = fetchPage;

  const getItemKeyRef = useRef(getItemKey);
  getItemKeyRef.current = getItemKey;

  const onItemsUpdatedRef = useRef(onItemsUpdated);
  onItemsUpdatedRef.current = onItemsUpdated;

  const initialItemsRef = useRef(initialItems);
  initialItemsRef.current = initialItems;

  const loadBatch = useCallback(
    async (isInitial: boolean) => {
      if (!enabled) return;

      if (isInitial) {
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }
        if (!initialItemsRef.current || initialItemsRef.current.length === 0) {
          setLoading(true);
        }
        setError(null);
        offsetRef.current = 0;
        hasMoreRef.current = true;
      } else {
        if (isFetchingRef.current || !hasMoreRef.current) return;
        setLoadingMore(true);
      }

      isFetchingRef.current = true;
      const controller = new AbortController();
      abortControllerRef.current = controller;
      let fetchedCount = -1;

      try {
        const currentOffset = offsetRef.current;
        const result = await fetchPageRef.current({
          offset: currentOffset,
          limit: pageSize,
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        const fetchedItems = result.items || [];
        fetchedCount = fetchedItems.length;
        const nextHasMore = Boolean(result.hasMore);
        const nextOffset =
          typeof result.nextOffset === "number"
            ? result.nextOffset
            : currentOffset + fetchedItems.length;

        offsetRef.current = nextOffset;
        hasMoreRef.current = nextHasMore;
        setHasMore(nextHasMore);
        if (typeof result.total === "number") {
          setTotal(result.total);
        }

        setItems((prev) => {
          let updated: T[];
          if (isInitial) {
            updated = fetchedItems;
          } else {
            // Deduplicate by key
            const seen = new Set<string>();
            for (const item of prev) {
              seen.add(getItemKeyRef.current(item));
            }
            const appended: T[] = [];
            for (const item of fetchedItems) {
              const key = getItemKeyRef.current(item);
              if (!seen.has(key)) {
                seen.add(key);
                appended.push(item);
              }
            }
            updated = [...prev, ...appended];
          }
          onItemsUpdatedRef.current?.(updated);
          return updated;
        });
      } catch (err: any) {
        if (controller.signal.aborted) return;
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
      } finally {
        if (abortControllerRef.current === controller) {
          isFetchingRef.current = false;
          if (isInitial) {
            setLoading(false);
          } else {
            setLoadingMore(false);
          }
          if (hasMoreRef.current && fetchedCount === 0 && !controller.signal.aborted) {
            setTimeout(() => {
              if (hasMoreRef.current && !isFetchingRef.current && !controller.signal.aborted) {
                void loadBatch(false);
              }
            }, 30);
          } else if (autoLoadUntilComplete && hasMoreRef.current && !controller.signal.aborted) {
            setTimeout(() => {
              if (hasMoreRef.current && !isFetchingRef.current && !controller.signal.aborted) {
                void loadBatch(false);
              }
            }, 30);
          }
        }
      }
    },
    [enabled, pageSize, autoLoadUntilComplete],
  );

  // Reload triggered from outside
  const reload = useCallback(() => {
    return loadBatch(true);
  }, [loadBatch]);

  // Load more when reaching near end
  const loadMore = useCallback(() => {
    if (isFetchingRef.current || !hasMoreRef.current || loading) return;
    void loadBatch(false);
  }, [loadBatch, loading]);

  // Initial load or dep change
  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const init = initialItemsRef.current;
    if (init && init.length > 0) {
      setItems(init);
      setLoading(false);
    } else {
      setItems([]);
      setLoading(true);
    }
    void loadBatch(true);

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      setLoading(false);
      setLoadingMore(false);
      isFetchingRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, loadBatch, ...deps]);

  // Attach IntersectionObserver to sentinel
  const sentinelRef = useCallback(
    (node: HTMLElement | null) => {
      sentinelElementRef.current = node;
      if (!node) return;

      const mainContainer = document.getElementById("main-scroll-container");
      const observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (entry && entry.isIntersecting) {
            loadMore();
          }
        },
        {
          root: mainContainer || null,
          rootMargin: "600px 0px",
          threshold: 0,
        },
      );

      observer.observe(node);

      return () => {
        observer.disconnect();
      };
    },
    [loadMore],
  );

  // Fallback scroll listener for scroll containers / window
  useEffect(() => {
    if (!enabled) return;

    const targets: (HTMLElement | Window)[] = [window];
    const mainContainer = document.getElementById("main-scroll-container");
    if (mainContainer) {
      targets.push(mainContainer);
    }
    const sentinel = sentinelElementRef.current;
    if (sentinel) {
      let parent = sentinel.parentElement;
      while (parent) {
        const overflowY = window.getComputedStyle(parent).overflowY;
        if (overflowY === "auto" || overflowY === "scroll") {
          if (!targets.includes(parent)) {
            targets.push(parent);
          }
          break;
        }
        parent = parent.parentElement;
      }
    }

    const handleScroll = (e: Event) => {
      if (isFetchingRef.current || !hasMoreRef.current) return;
      const target = e.currentTarget;
      if (target === window) {
        const scrollHeight = document.documentElement.scrollHeight;
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        const clientHeight = window.innerHeight;
        if (scrollHeight - scrollTop - clientHeight < 600) {
          loadMore();
        }
      } else if (target instanceof HTMLElement) {
        if (target.scrollHeight - target.scrollTop - target.clientHeight < 600) {
          loadMore();
        }
      }
    };

    for (const t of targets) {
      t.addEventListener("scroll", handleScroll, { passive: true });
    }
    return () => {
      for (const t of targets) {
        t.removeEventListener("scroll", handleScroll);
      }
    };
  }, [enabled, loadMore]);

  // Bottom sentinel element component
  const Sentinel = useCallback(
    ({ style }: { style?: React.CSSProperties }) => {
      if (!hasMore && !loadingMore) return null;
      return (
        <div
          ref={sentinelRef}
          style={{
            height: 48,
            minHeight: 48,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            ...style,
          }}
        >
          {loadingMore && (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 14px",
                borderRadius: 999,
                background: "var(--bg-elevated)",
                border: "1px solid var(--stroke)",
                boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
              }}
            >
              <Spinner size={16} />
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: "var(--fg-secondary)",
                }}
              >
                Đang tải thêm...
              </span>
            </div>
          )}
        </div>
      );
    },
    [hasMore, loadingMore, sentinelRef],
  );

  return {
    items,
    setItems,
    loading,
    loadingMore,
    hasMore,
    error,
    total,
    reload,
    loadMore,
    sentinelRef,
    Sentinel,
  };
}

/**
 * Lightweight Virtual Window Calculator
 * When item list is large (> 60 items), only render window with overscan buffer.
 * Preserves 100% styling without layout shifts.
 */
export function useVirtualWindow({
  itemCount,
  itemHeight = 56,
  overscan = 8,
  containerRef,
}: {
  itemCount: number;
  itemHeight?: number;
  overscan?: number;
  containerRef?: React.RefObject<HTMLElement | null>;
}) {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(800);

  useEffect(() => {
    const handleUpdate = () => {
      if (containerRef && containerRef.current) {
        setScrollTop(containerRef.current.scrollTop);
        setViewportHeight(containerRef.current.clientHeight);
      } else {
        setScrollTop(window.scrollY || document.documentElement.scrollTop);
        setViewportHeight(window.innerHeight);
      }
    };

    handleUpdate();

    const target = containerRef?.current ?? window;
    target.addEventListener("scroll", handleUpdate, { passive: true });
    window.addEventListener("resize", handleUpdate, { passive: true });

    return () => {
      target.removeEventListener("scroll", handleUpdate);
      window.removeEventListener("resize", handleUpdate);
    };
  }, [containerRef]);

  // If item count is small (< 60), render all to avoid any measurement inaccuracies
  if (itemCount <= 60) {
    return {
      startIndex: 0,
      endIndex: itemCount,
      topSpacerHeight: 0,
      bottomSpacerHeight: 0,
      isVirtual: false,
    };
  }

  const rawStartIndex = Math.floor(scrollTop / itemHeight);
  const startIndex = Math.max(0, rawStartIndex - overscan);
  const visibleCount = Math.ceil(viewportHeight / itemHeight);
  const endIndex = Math.min(itemCount, rawStartIndex + visibleCount + overscan);

  const topSpacerHeight = startIndex * itemHeight;
  const bottomSpacerHeight = Math.max(0, (itemCount - endIndex) * itemHeight);

  return {
    startIndex,
    endIndex,
    topSpacerHeight,
    bottomSpacerHeight,
    isVirtual: true,
  };
}
