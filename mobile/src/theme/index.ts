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
  // 종이에 쓴 만년필 잉크. 강조색은 수첩의 붉은 여백선과 같은 계열이다.
  // id 는 기기에 저장돼 있어 바꾸지 않는다.
  indigo: { name: 'Daymo', primary: '#3F4C8F', primaryDark: '#A3AEEA', soft: '#EEF0FA', softDark: '#2C3352', secondary: '#3F4C8F', accent: '#B4453C', navigation: '#232B52' },
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
    // 화면의 층을 색만으로도 구분할 수 있게 각 표면 사이 명도 간격을 넓힌다.
    // 기존 #0D111A / #171D29 / #202838 조합은 작은 안드로이드 화면에서
    // 카드 경계가 거의 사라져 모든 정보가 한 덩어리처럼 보였다.
    background: '#080B12', surface: '#151C28', surfaceAlt: '#252F40', text: '#F7F5F1', muted: '#AEB8C8', border: '#3A475B',
    primary: palette.primaryDark, primarySoft: palette.softDark, secondary: '#71D4C7', accent: '#F08A82', navigation: '#0C111B',
  } : {
    id, name: palette.name, dark: false,
    // muted는 세 배경(background/surface/surfaceAlt) 모두에서 WCAG AA 4.5:1을 넘겨야 한다.
    // #747D8D는 3.57~4.15:1로 미달이었다.
    background: '#F7F5F0', surface: '#FFFFFF', surfaceAlt: '#EFEEE9', text: '#17233D', muted: '#646C7A', border: '#E5E3DD',
    primary: palette.primary, primarySoft: palette.soft, secondary: palette.secondary, accent: palette.accent, navigation: palette.navigation,
  };
}
