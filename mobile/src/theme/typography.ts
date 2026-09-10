// 타이포그래피 토큰.
//
// 크기 기준은 docs/product-rules/01-daymo-development-rules.md 5장을 따른다.
//   제목 18pt 이상 · 본문과 입력값 13~17pt · 보조 정보 11~12pt
//
// 서체는 쿠키런 Regular와 Bold다. 앱은 원래 fontFamily를 한 번도 지정하지 않아서
// 한글이 OS 기본 폰트로 떨어졌고, iOS는 Apple SD Gothic Neo, 안드로이드는 본고딕,
// 웹은 맑은 고딕으로 서로 다르게 보였다.
//
// 쿠키런 라이선스는 "배포되는 형태 그대로" 쓸 것을 요구하고 임의 수정과 개작을
// 금지한다. 그래서 서브셋을 만들지 않고 공식 배포 TTF를 그대로 싣는다.
// 파일 이름만 공백을 뺐고 폰트 데이터는 원본과 바이트 단위로 같다.
// 출시 전에 라이선스 전문이나 출처 표기를 앱에 넣어야 한다(규칙 9장).

export const fonts = {
  /** 제목과 수치. */
  display: "CookieRun-Bold",
  /** 본문, 라벨, 보조 정보. */
  text: "CookieRun-Regular",
} as const;

/**
 * 크기 스케일. 스타일시트의 모든 fontSize가 이 아홉 단계 중 하나다.
 * 역할마다 쓰는 단계가 다르다. 같은 제목이라도 화면 제목과 목록 행의 제목은
 * 단계가 달라야 하므로 역할 하나에 크기 하나를 강제하지 않는다.
 */
export const sizes = [11, 12, 14, 16, 18, 20, 24, 28, 34] as const;

/** 자간. 한글은 자모가 이미 네모 틀에 차 있어 많이 조이면 글자가 붙어 보인다. */
export const tracking = { tight: -0.5, normal: 0, wide: 0.5, wider: 1 } as const;

export const typo = {
  /** 워드마크. */
  hero: { size: 30, family: fonts.display, weight: "700", line: 38 },
  /** 화면 제목, 카드 제목, 사람과 장소의 이름. */
  title: { size: 18, family: fonts.display, weight: "700", line: 26 },
  /** 수치와 값. 개수, 시각, 날짜 스탬프처럼 읽어야 하는 데이터. */
  data: { size: 18, family: fonts.display, weight: "700", line: 24 },
  /** 라벨, 버튼, 태그, 칩. */
  label: { size: 12, family: fonts.text, weight: "400", line: 17 },
  /** 본문, 설명, 입력값. */
  body: { size: 14, family: fonts.text, weight: "400", line: 22 },
  /** 보조 정보. 메타 줄, 날짜, 캡션. */
  caption: { size: 11, family: fonts.text, weight: "400", line: 16 },
} as const;

export type TypeRole = keyof typeof typo;

/** expo-font의 useFonts에 넘길 목록. */
export const fontAssets = {
  [fonts.display]: require("../../assets/fonts/CookieRun-Bold.ttf"),
  [fonts.text]: require("../../assets/fonts/CookieRun-Regular.ttf"),
};
