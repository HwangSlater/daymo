export type ThemeId = 'indigo' | 'rose' | 'daymo' | 'sky' | 'forest' | 'sage' | 'vintage';
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

type Palette = {
  name: string;
  /** 라이트 모드 강조색. */
  primary: string;
  /** 다크 모드 강조색. 같은 값을 쓰면 어두운 표면에서 대비가 나오지 않는다. */
  primaryDark: string;
  soft: string;
  softDark: string;
  secondary: string;
  accent: string;
  navigation: string;
};

// 색상각만 기준색에서 가져오고 밝기와 채도는 계산해서 맞췄다. 각 강조색은 자기 모드의
// 배경, 표면, 보조 표면, soft 칩 네 가지 배경 모두에서 WCAG AA 4.5:1을 넘긴다.
// docs/development/05-quality-and-operations.md 3장.
const palettes: Record<ThemeId, Palette> = {
  indigo: { name: 'Daymo', primary: '#5D5FC7', primaryDark: '#9E97EA', soft: '#F5F1FF', softDark: '#37344D', secondary: '#6360B8', accent: '#9A5285', navigation: '#312F5F' },
  rose: { name: '로즈베리', primary: '#BC3966', primaryDark: '#ED7E9C', soft: '#FFEBF2', softDark: '#4F2D35', secondary: '#B73E66', accent: '#A1563D', navigation: '#5F1D32' },
  daymo: { name: '소프트 퍼플', primary: '#835C93', primaryDark: '#BC91CC', soft: '#FFEEFF', softDark: '#423148', secondary: '#835C93', accent: '#A54D6E', navigation: '#472855' },
  sky: { name: '클리어 스카이', primary: '#006BC6', primaryDark: '#72A1F2', soft: '#EBF3FF', softDark: '#2B3750', secondary: '#126BC1', accent: '#875997', navigation: '#073564' },
  forest: { name: '그린 가든', primary: '#327939', primaryDark: '#6AB06C', soft: '#E5F9E4', softDark: '#273C27', secondary: '#327939', accent: '#007869', navigation: '#103D16' },
  sage: { name: '세이지 피크닉', primary: '#5D6F5B', primaryDark: '#93A68F', soft: '#E6F9E3', softDark: '#2B3B29', secondary: '#5D6F5B', accent: '#007866', navigation: '#293926' },
  vintage: { name: '빈티지 노트', primary: '#905E54', primaryDark: '#CB9388', soft: '#FFECE5', softDark: '#4E2F28', secondary: '#905E54', accent: '#8A6328', navigation: '#542820' },
};

export const themeOptions = (Object.keys(palettes) as ThemeId[]).map((id) => ({ id, ...palettes[id] }));

export function resolveTheme(id: ThemeId, dark: boolean): AppTheme {
  const palette = palettes[id];
  return dark ? {
    id, name: palette.name, dark: true,
    background: '#0D111A', surface: '#171D29', surfaceAlt: '#202838', text: '#F5F7FB', muted: '#9DA8BA', border: '#2B3546',
    primary: palette.primaryDark, primarySoft: palette.softDark, secondary: palette.secondary, accent: palette.accent, navigation: '#090D14',
  } : {
    id, name: palette.name, dark: false,
    // muted는 세 배경(background/surface/surfaceAlt) 모두에서 WCAG AA 4.5:1을 넘겨야 한다.
    // #747D8D는 3.57~4.15:1로 미달이었다.
    background: '#F7F5F0', surface: '#FFFFFF', surfaceAlt: '#EFEEE9', text: '#17233D', muted: '#646C7A', border: '#E5E3DD',
    primary: palette.primary, primarySoft: palette.soft, secondary: palette.secondary, accent: palette.accent, navigation: palette.navigation,
  };
}
