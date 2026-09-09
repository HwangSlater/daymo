// 타이포그래피 토큰.
//
// 크기 기준은 docs/product-rules/01-daymo-development-rules.md 5장을 따른다.
//   제목 18pt 이상 · 본문과 입력값 13~17pt · 보조 정보 11~12pt
//
// 현재 스타일시트는 weight만 이 토큰을 참조한다. size와 line은 다음 단계에서
// 연결하며, 그때 값 한 줄을 고치면 화면 전체에 반영된다.

export const typo = {
  /** 워드마크. 화면에서 가장 무거운 요소는 이것 하나뿐이다. */
  hero: { size: 30, weight: "800", line: 36 },
  /** 화면 제목, 카드 제목, 사람과 장소의 이름. */
  title: { size: 18, weight: "700", line: 24 },
  /** 수치와 값. 개수, 금액, 날짜 스탬프처럼 읽어야 하는 데이터. */
  data: { size: 18, weight: "700", line: 24 },
  /** 라벨, 버튼, 태그, 칩. 짧고 눌리는 것. */
  label: { size: 12, weight: "600", line: 16 },
  /** 본문, 설명, 입력값. */
  body: { size: 14, weight: "400", line: 21 },
  /** 보조 정보. 메타 줄, 날짜, 캡션. */
  caption: { size: 11, weight: "400", line: 15 },
} as const;

export type TypeRole = keyof typeof typo;
