const UNITS: Record<string, number> = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17,
  dieciocho: 18, diecinueve: 19, veinte: 20, veintiun: 21, veintiuno: 21, veintiuna: 21, veintidos: 22,
  veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28,
  veintinueve: 29,
};
const TENS: Record<string, number> = {
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
};
const HUNDREDS: Record<string, number> = {
  cien: 100, ciento: 100, doscientos: 200, doscientas: 200, trescientos: 300, trescientas: 300,
  cuatrocientos: 400, cuatrocientas: 400, quinientos: 500, quinientas: 500,
};
const ARTICLES = new Set(['un', 'una', 'uno']);

export interface NumberMatch {
  value: number;
  start: number;
  end: number;
}

export interface NumberOptions {
  allowArticles?: boolean;
}

export function readNumberAt(tokens: string[], i: number, opts: NumberOptions = {}): NumberMatch | null {
  const first = tokens[i];
  if (first === undefined) return null;
  if (/^\d+(\.\d+)?$/.test(first)) return { value: Number(first), start: i, end: i + 1 };
  if (ARTICLES.has(first) && !opts.allowArticles) return null;

  let j = i;
  let value = 0;
  if (HUNDREDS[tokens[j]] !== undefined) {
    value += HUNDREDS[tokens[j]];
    j++;
  }
  if (TENS[tokens[j]] !== undefined) {
    value += TENS[tokens[j]];
    j++;
    const unit = UNITS[tokens[j + 1]];
    if (tokens[j] === 'y' && unit !== undefined && unit >= 1 && unit <= 9) {
      value += unit;
      j += 2;
    }
  } else if (UNITS[tokens[j]] !== undefined) {
    value += UNITS[tokens[j]];
    j++;
  }
  return j > i ? { value, start: i, end: j } : null;
}

export function findNumbers(tokens: string[], opts: NumberOptions = {}): NumberMatch[] {
  const found: NumberMatch[] = [];
  let i = 0;
  while (i < tokens.length) {
    const match = readNumberAt(tokens, i, opts);
    if (match) {
      found.push(match);
      i = match.end;
    } else {
      i++;
    }
  }
  return found;
}
