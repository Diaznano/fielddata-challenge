// Map en vez de objeto literal: palabras como "constructor" no deben resolverse por el prototipo.
const UNITS = new Map(Object.entries({
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17,
  dieciocho: 18, diecinueve: 19, veinte: 20, veintiun: 21, veintiuno: 21, veintiuna: 21, veintidos: 22,
  veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28,
  veintinueve: 29,
}));
const TENS = new Map(Object.entries({
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
}));
const HUNDREDS = new Map(Object.entries({
  ciento: 100, doscientos: 200, doscientas: 200, trescientos: 300, trescientas: 300,
  cuatrocientos: 400, cuatrocientas: 400, quinientos: 500, quinientas: 500,
}));
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
  if (first === 'cien') return { value: 100, start: i, end: i + 1 };

  let j = i;
  let value = 0;
  const hundreds = HUNDREDS.get(tokens[j]);
  if (hundreds !== undefined) {
    value += hundreds;
    j++;
  }
  const tens = TENS.get(tokens[j]);
  const units = UNITS.get(tokens[j]);
  if (tens !== undefined) {
    value += tens;
    j++;
    const unit = UNITS.get(tokens[j + 1]);
    if (tokens[j] === 'y' && unit !== undefined && unit >= 1 && unit <= 9) {
      value += unit;
      j += 2;
    }
  } else if (units !== undefined) {
    value += units;
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
