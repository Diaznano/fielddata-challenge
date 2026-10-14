import { MicStatus } from '@/conversation/mic';
import { Mode } from '@/conversation/mode';
import { CardTone } from '@/tools/cards';

export const colors = {
  bg: '#FFFFFF',
  text: '#203046',
  muted: '#6C7C93',
  brand: '#347F61',
  cardBg: '#EFFBF6',
  border: '#D5E3DC',
  ok: '#008F26',
  info: '#2A4365',
  pending: '#B48A1E',
  pendingText: '#8A6914',
  danger: '#DC2626',
  white: '#FFFFFF',
};

export const toneColor: Record<CardTone, string> = {
  registro: colors.ok,
  consulta: colors.info,
  pendiente: colors.pending,
  ayuda: colors.muted,
  rechazo: colors.muted,
};

export const toneText: Record<CardTone, string> = { ...toneColor, pendiente: colors.pendingText };

export const micColor: Record<MicStatus, string> = {
  idle: colors.brand,
  listening: colors.danger,
  thinking: colors.info,
  speaking: colors.brand,
  blocked: colors.muted,
};

export const modeMeta: Record<Mode, { label: string; color: string }> = {
  ia: { label: 'IA', color: colors.ok },
  local: { label: 'LOCAL', color: colors.muted },
  offline: { label: 'OFFLINE', color: colors.muted },
  degraded: { label: 'SEÑAL DÉBIL', color: colors.pendingText },
};

export const fontSize = { badge: 16, body: 20, title: 28, number: 48 };
