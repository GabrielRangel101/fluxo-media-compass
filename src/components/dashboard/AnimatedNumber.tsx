import { animate, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

/** Conta de 0 até o valor em ~700ms (instantâneo com prefers-reduced-motion). */
export function AnimatedNumber({ value, format }: { value: number; format: (n: number) => string }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(value);
  useEffect(() => {
    if (reduce) {
      setShown(value);
      return;
    }
    const controls = animate(0, value, { duration: 0.7, ease: [0.22, 1, 0.36, 1], onUpdate: setShown });
    return () => controls.stop();
  }, [value, reduce]);
  return <span className="tabular-nums">{format(shown)}</span>;
}
