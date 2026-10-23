import { motion } from "framer-motion";
import { useMotionPreference } from "@/hooks/use-motion-preference";

const W = 160;
const R = 64;
const CX = W / 2;
const CY = 74;

/** valor -100..+100 → ângulo em graus (180 = esquerda, 0 = direita) */
const angleOf = (v: number) => 180 - ((Math.max(-100, Math.min(100, v)) + 100) / 200) * 180;
const pt = (deg: number, r = R) => {
  const rad = (deg * Math.PI) / 180;
  return [CX + r * Math.cos(rad), CY - r * Math.sin(rad)] as const;
};
const arc = (from: number, to: number) => {
  const [x1, y1] = pt(angleOf(from));
  const [x2, y2] = pt(angleOf(to));
  return `M ${x1} ${y1} A ${R} ${R} 0 0 1 ${x2} ${y2}`;
};

const BANDS = [
  { from: -100, to: 0, color: "var(--danger)", name: "crítico" },
  { from: 0, to: 50, color: "var(--accent)", name: "aperfeiçoar" },
  { from: 50, to: 100, color: "var(--positive-fill)", name: "excelência" },
];

export function Gauge({ value }: { value: number }) {
  const reduce = useMotionPreference();
  const rotation = 90 - angleOf(value); // ponteiro desenhado apontando para cima
  const band = BANDS.find((b) => value <= b.to) ?? BANDS[2];
  return (
    <svg
      viewBox={`0 0 ${W} 86`}
      className="h-full w-full"
      role="img"
      aria-label={`Medidor de NPS: ${Math.round(value)} em escala de −100 a +100, zona ${band.name}`}
    >
      {BANDS.map((b) => (
        <path key={b.name} d={arc(b.from, b.to)} stroke={b.color} strokeWidth={10} fill="none" strokeLinecap="butt" opacity={0.85} />
      ))}
      <motion.g
        style={{ transformBox: "view-box", transformOrigin: `${CX}px ${CY}px` }}
        initial={{ rotate: reduce ? rotation : -90 }}
        animate={{ rotate: rotation }}
        transition={{ duration: reduce ? 0 : 0.9, ease: [0.22, 1, 0.36, 1] }}
      >
        <line x1={CX} y1={CY} x2={CX} y2={CY - R + 6} stroke="var(--foreground)" strokeWidth={2.5} strokeLinecap="round" />
      </motion.g>
      <circle cx={CX} cy={CY} r={5} fill="var(--foreground)" />
      <text x={CX - R} y={CY + 11} fontSize={9} textAnchor="middle" fill="var(--muted-foreground)">−100</text>
      <text x={CX + R} y={CY + 11} fontSize={9} textAnchor="middle" fill="var(--muted-foreground)">+100</text>
    </svg>
  );
}
