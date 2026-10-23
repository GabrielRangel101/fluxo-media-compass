// Apenas apresentação: hash local determinístico para cor de avatar e iniciais.
export function avatarHash(seed: string) {
  let n = 2166136261;
  for (const c of seed) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return n >>> 0;
}
export function initials(name: string) {
  const words = name.split(" ");
  return `${words[0]?.[0] ?? ""}${words.at(-1)?.[0] ?? ""}`;
}
export const avatarColor = (seed: string) => `var(--cat-${(avatarHash(seed) % 6) + 1})`;
export const fmtRisk = (risk: number) => `${String(risk).replace(".", ",")}%`;
