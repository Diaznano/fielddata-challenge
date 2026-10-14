export interface Hypothesis {
  transcript: string;
  confidence: number;
}

function words(text: string): string[] {
  return text.toLowerCase().split(/\s+/).filter(Boolean);
}

function isStrictPrefix(shorter: string[], longer: string[]): boolean {
  return shorter.length < longer.length && shorter.every((word, i) => word === longer[i]);
}

// Android entrega las hipótesis finales en un evento parcial y después un final vacío: hay que quedarse con la mejor de cada evento.
// Las hipótesis truncadas ("del") pueden traer más confianza que la completa ("del 7"), así que se descartan antes de comparar.
export function bestTranscript(results: Hypothesis[]): string {
  const candidates = results.filter((r) => r.transcript.trim());
  const tokens = candidates.map((r) => words(r.transcript));
  const complete = candidates.filter((_, i) => !tokens.some((other) => isStrictPrefix(tokens[i], other)));
  let best: Hypothesis | null = null;
  for (const r of complete) {
    if (!best || r.confidence > best.confidence) best = r;
  }
  return best ? best.transcript.trim() : '';
}
