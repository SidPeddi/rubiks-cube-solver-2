import { COLORS, type Color, type FaceletState } from './types';

const COLOR_SET = new Set<string>(COLORS);

const PARAM = 'state';

export function encodeState(state: FaceletState): string {
  return state.join('');
}

export function decodeState(encoded: string): FaceletState | null {
  if (encoded.length !== 54) return null;
  const out: Color[] = [];
  for (const ch of encoded) {
    if (!COLOR_SET.has(ch)) return null;
    out.push(ch as Color);
  }
  return out;
}

export function buildShareUrl(state: FaceletState): string {
  const base = window.location.origin + window.location.pathname;
  return `${base}#${PARAM}=${encodeState(state)}`;
}

export function readSharedState(hash: string): FaceletState | null {
  const m = hash.replace(/^#/, '').match(new RegExp(`(?:^|&)${PARAM}=([^&]+)`));
  if (!m) return null;
  return decodeState(m[1]);
}
