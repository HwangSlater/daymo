// 타이포그래피 토큰.
//
// 크기 기준은 docs/product-rules/01-daymo-development-rules.md 5장을 따른다.
//   제목 18pt 이상 · 본문과 입력값 13~17pt · 보조 정보 11~12pt
//
// 서체는 제목 주아, 본문 고운돋움이다. 앱은 원래 fontFamily를 한 번도 지정하지
// 않아서 한글이 OS 기본 폰트로 떨어졌고, iOS는 Apple SD Gothic Neo, 안드로이드는
// 본고딕, 웹은 맑은 고딕으로 서로 다르게 보였다.
//
// 두 서체 모두 굵기가 400 하나뿐이다. 굵기로 위계를 만들 수 없으므로 크기, 색,
// 그리고 두 서체의 대비로 만든다. 이건 규칙 4장의 "절제된 색 포인트"와 맞는
// 방향이기도 하다. weight 값은 참고용으로만 남기고 스타일시트는 family만 쓴다.

export const fonts = {
  /** 제목과 수치. 둥글고 통통해서 짧은 말이 눈에 띈다. */
  display: "Jua-Regular",
  /** 본문과 라벨. 획 끝이 부드럽고 폭이 좁아 촘촘한 목록에서도 읽힌다. */
  text: "GowunDodum-Regular",
} as const;

export const typo = {
  /** 워드마크. */
  hero: { size: 30, family: fonts.display, weight: "400", line: 38 },
  /** 화면 제목, 카드 제목, 사람과 장소의 이름. */
  title: { size: 18, family: fonts.display, weight: "400", line: 26 },
  /** 수치와 값. 개수, 시각, 날짜 스탬프처럼 읽어야 하는 데이터. */
  data: { size: 18, family: fonts.display, weight: "400", line: 24 },
  /** 라벨, 버튼, 태그, 칩. 강조는 굵기가 아니라 색으로 준다. */
  label: { size: 12, family: fonts.text, weight: "400", line: 17 },
  /** 본문, 설명, 입력값. */
  body: { size: 14, family: fonts.text, weight: "400", line: 22 },
  /** 보조 정보. 메타 줄, 날짜, 캡션. */
  caption: { size: 11, family: fonts.text, weight: "400", line: 16 },
} as const;

export type TypeRole = keyof typeof typo;

/** expo-font의 useFonts에 넘길 목록. */
export const fontAssets = {
  [fonts.display]: require("../../assets/fonts/Jua-Regular.ttf"),
  [fonts.text]: require("../../assets/fonts/GowunDodum-Regular.ttf"),
};
