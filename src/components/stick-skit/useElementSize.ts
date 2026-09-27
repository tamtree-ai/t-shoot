"use client";

import { useLayoutEffect, useState } from "react";

/** The element's content box, in pixels. Zero until it has been measured. */
export function useElementSize() {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    if (!node) return;
    const measure = () => {
      const box = node.getBoundingClientRect();
      setSize((prev) => (Math.abs(prev.width - box.width) < 0.5 && Math.abs(prev.height - box.height) < 0.5 ? prev : { width: box.width, height: box.height }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);

  return [setNode, size] as const;
}
