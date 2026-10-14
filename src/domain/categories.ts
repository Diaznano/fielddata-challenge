import { Category } from './types';

const SINGULAR: Record<Category, string> = {
  vacas: 'vaca',
  vaquillonas: 'vaquillona',
  terneros: 'ternero',
  novillos: 'novillo',
  toros: 'toro',
};

// Palabras ya normalizadas (minúsculas, sin tildes).
const SYNONYMS = new Map<string, Category>([
  ['vaca', 'vacas'],
  ['vacas', 'vacas'],
  ['vaquillona', 'vaquillonas'],
  ['vaquillonas', 'vaquillonas'],
  ['vaquilla', 'vaquillonas'],
  ['vaquillas', 'vaquillonas'],
  ['ternero', 'terneros'],
  ['terneros', 'terneros'],
  ['ternera', 'terneros'],
  ['terneras', 'terneros'],
  ['ternerito', 'terneros'],
  ['terneritos', 'terneros'],
  ['novillo', 'novillos'],
  ['novillos', 'novillos'],
  ['novillito', 'novillos'],
  ['novillitos', 'novillos'],
  ['toro', 'toros'],
  ['toros', 'toros'],
]);

export function categoryFromWord(word: string): Category | null {
  return SYNONYMS.get(word) ?? null;
}

export function categoryLabel(category: Category, count: number): string {
  return count === 1 ? SINGULAR[category] : category;
}
