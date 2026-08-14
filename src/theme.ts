export type ThemeId = 'daymo' | 'sunset' | 'forest' | 'ocean';
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
  daymo: { name: 'Daymo', primary: '#5577B7', soft: '#EEF3FC', secondary: '#2CA596', accent: '#C18A52', navigation: '#1C2942' },
  sunset: { name: '선셋', primary: '#F06B4F', soft: '#FFF0E8', secondary: '#E69055', accent: '#A45C8D', navigation: '#3A2435' },
  forest: { name: '포레스트', primary: '#4D8B63', soft: '#EAF4EC', secondary: '#86A873', accent: '#D09A45', navigation: '#18342A' },
  ocean: { name: '오션', primary: '#3478D4', soft: '#EAF2FF', secondary: '#13A7B5', accent: '#7468D8', navigation: '#142A4A' },
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
