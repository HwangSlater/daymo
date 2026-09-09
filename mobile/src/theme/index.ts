export type ThemeId = 'daymo' | 'rose' | 'sky' | 'forest' | 'sage' | 'vintage';
export type AppearanceMode = 'system' | 'light' | 'dark';

export type AppTheme = {
  id: ThemeId;
  name: string;
  dark: boolean;
  background: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  muted: string;
  border: string;
  primary: string;
  primarySoft: string;
  secondary: string;
  accent: string;
  navigation: string;
};

const palettes: Record<ThemeId, { name: string; primary: string; soft: string; secondary: string; accent: string; navigation: string }> = {
  rose: { name: 'Daymo', primary: '#BB3865', soft: '#FCEEF1', secondary: '#963352', accent: '#C96873', navigation: '#5D3140' },
  daymo: { name: '소프트 퍼플', primary: '#8B639B', soft: '#F6EEF5', secondary: '#945A83', accent: '#B96D82', navigation: '#403D88' },
  sky: { name: '클리어 스카이', primary: '#1976D2', soft: '#E3F2FD', secondary: '#246FA7', accent: '#517DA2', navigation: '#0D47A1' },
  forest: { name: '그린 가든', primary: '#347A3A', soft: '#E8F5E9', secondary: '#4F8B55', accent: '#5F8662', navigation: '#1B5E20' },
  sage: { name: '세이지 피크닉', primary: '#62745F', soft: '#F7F4ED', secondary: '#71816D', accent: '#9A793D', navigation: '#36443A' },
  vintage: { name: '빈티지 노트', primary: '#8C5A50', soft: '#F5ECE8', secondary: '#7E4E46', accent: '#696B79', navigation: '#0F3040' },
};

export const themeOptions = (Object.keys(palettes) as ThemeId[]).map((id) => ({ id, ...palettes[id] }));

export function resolveTheme(id: ThemeId, dark: boolean): AppTheme {
  const palette = palettes[id];
  return dark ? {
    id, name: palette.name, dark: true,
    background: '#0D111A', surface: '#171D29', surfaceAlt: '#202838', text: '#F5F7FB', muted: '#9DA8BA', border: '#2B3546',
    primary: palette.primary, primarySoft: `${palette.primary}24`, secondary: palette.secondary, accent: palette.accent, navigation: '#090D14',
  } : {
    id, name: palette.name, dark: false,
    background: '#F7F5F0', surface: '#FFFFFF', surfaceAlt: '#EFEEE9', text: '#17233D', muted: '#747D8D', border: '#E5E3DD',
    primary: palette.primary, primarySoft: palette.soft, secondary: palette.secondary, accent: palette.accent, navigation: palette.navigation,
  };
}
