const ACCENTS: Record<string, string> = {
  á: 'a', à: 'a', ä: 'a', é: 'e', è: 'e', ë: 'e', í: 'i', ì: 'i', ï: 'i',
  ó: 'o', ò: 'o', ö: 'o', ú: 'u', ù: 'u', ü: 'u', ñ: 'n',
};

// Mapa explícito en vez de String.normalize('NFD') para no depender del soporte de Intl en Hermes.
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[áàäéèëíìïóòöúùüñ]/g, (c) => ACCENTS[c])
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/[^a-z0-9.\s]/g, ' ')
    .replace(/\.(?!\d)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(text: string): string[] {
  const normalized = normalize(text);
  return normalized === '' ? [] : normalized.split(' ');
}
