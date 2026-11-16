/** Splits text so "[PLACEHOLDER ...]" parts can be highlighted until real content arrives. */
export function phSegments(text: string): { text: string; ph: boolean }[] {
  return text
    .split(/(\[[^\]]+\])/g)
    .filter(Boolean)
    .map((t) => ({ text: t, ph: /^\[.*\]$/.test(t) }));
}
