export type CardTone = 'registro' | 'consulta' | 'pendiente' | 'ayuda' | 'rechazo';

export interface CardField {
  label: string;
  value: string | null;
}

export interface Card {
  tone: CardTone;
  title: string;
  headline?: string;
  lines: string[];
  fields?: CardField[];
  undoableEventId?: string;
  at?: string;
}
