export interface Hypothesis {
  transcript: string;
  confidence: number;
}

// Android entrega las hipótesis finales en un evento parcial y después un final vacío: hay que quedarse con la mejor de cada evento.
export function bestTranscript(results: Hypothesis[]): string {
  let best: Hypothesis | null = null;
  for (const r of results) {
    if (!r.transcript.trim()) continue;
    if (!best || r.confidence > best.confidence) best = r;
  }
  return best ? best.transcript.trim() : '';
}
