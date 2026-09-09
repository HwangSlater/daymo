// 타이포그래피 토큰.
//
// 크기 기준은 docs/product-rules/01-daymo-development-rules.md 5장을 따른다.
//   제목 18pt 이상 · 본문과 입력값 13~17pt · 보조 정보 11~12pt
//
// 서체는 본문 Pretendard, 제목 본명조다. 앱은 원래 fontFamily를 한 번도
// 지정하지 않아서 한글이 OS 기본 폰트로 떨어졌고, iOS는 Apple SD Gothic Neo,
// 안드로이드는 본고딕, 웹은 맑은 고딕으로 서로 다르게 보였다.
//
// React Native에서 커스텀 서체는 굵기 합성이 플랫폼마다 다르다. 굵기별로
// 다른 파일을 실어 fontFamily로 지정하고 fontWeight는 쓰지 않는다.
//
// 현재 스타일시트는 family만 이 토큰을 참조한다. size와 line은 다음 단계에서
// 연결하며, 그때 값 한 줄을 고치면 화면 전체에 반영된다.

export const fonts = {
  regular: "Pretendard-Regular",
  semibold: "Pretendard-SemiBold",
  bold: "Pretendard-Bold",
  extrabold: "Pretendard-ExtraBold",
  serif: "NotoSerifKR-SemiBold",
} as const;

export const typo = {
  /** 워드마크. 라틴 전용 서브셋이라 한글에는 쓰지 않는다. */
  hero: { size: 30, family: fonts.extrabold, weight: "800", line: 36 },
  /** 화면 제목, 카드 제목, 사람과 장소의 이름. 수첩 느낌을 내는 명조. */
  title: { size: 18, family: fonts.serif, weight: "700", line: 26 },
  /** 수치와 값. 개수, 시각, 날짜 스탬프처럼 읽어야 하는 데이터. */
  data: { size: 18, family: fonts.bold, weight: "700", line: 24 },
  /** 라벨, 버튼, 태그, 칩. 짧고 눌리는 것. */
  label: { size: 12, family: fonts.semibold, weight: "600", line: 16 },
  /** 본문, 설명, 입력값. */
  body: { size: 14, family: fonts.regular, weight: "400", line: 21 },
  /** 보조 정보. 메타 줄, 날짜, 캡션. */
  caption: { size: 11, family: fonts.regular, weight: "400", line: 15 },
} as const;

export type TypeRole = keyof typeof typo;

/** expo-font의 useFonts에 넘길 목록. */
export const fontAssets = {
  [fonts.regular]: require("../../assets/fonts/Pretendard-Regular.ttf"),
  [fonts.semibold]: require("../../assets/fonts/Pretendard-SemiBold.ttf"),
  [fonts.bold]: require("../../assets/fonts/Pretendard-Bold.ttf"),
  [fonts.extrabold]: require("../../assets/fonts/Pretendard-ExtraBold.ttf"),
  [fonts.serif]: require("../../assets/fonts/NotoSerifKR-SemiBold.ttf"),
};
