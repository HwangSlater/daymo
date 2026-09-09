// 색 토큰.
//
// AppTheme(./index)이 배경, 표면, 본문, 보조문구, 테두리, 강조를 담당한다.
// 이 파일은 테마 팔레트와 무관하게 의미가 고정된 색만 정의한다.
//
// 규칙 근거:
//   docs/product-rules/02-reusable-app-development-rules.md 4장
//     배경, 표면, 본문, 보조문구, 테두리, 강조, 성공과 위험 색을 역할로 정의한다.
//   docs/development/05-quality-and-operations.md 3장
//     라이트/다크 모두 WCAG AA 수준의 본문 대비 목표

/** 강조색 위에 얹는 글자. 테마가 무엇이든 흰색을 유지한다. */
export const onAccent = "#FFFFFF";

/** 상태 색. 라이트/다크에서 각각 본문 대비 AA를 넘는 값을 쓴다. */
export const status = {
  success: { light: "#1F7A4D", dark: "#6FD79E" },
  warning: { light: "#8A6516", dark: "#E5BC5E" },
  danger: { light: "#C0392F", dark: "#F08A82" },
} as const;

/** 소셜 로그인 제공사 색. 제공사 가이드라인 값이므로 테마를 따르지 않는다. */
export const brand = {
  kakao: { fill: "#FEE500", text: "#241F10" },
  naver: { fill: "#03C75A", text: "#FFFFFF" },
  google: { fill: "#FFFFFF", text: "#4285F4" },
} as const;

/** 여행 상세 상단의 메모지. 라이트는 노란 종이, 다크는 어두운 호박색. */
export function memoPaper(dark: boolean) {
  return dark
    ? {
        surface: "#332C1A",
        border: "#54492B",
        label: "#D8B863",
        text: "#EDE0BC",
        meta: "#C0A968",
        fold: "#4A4026",
        tape: "rgba(232, 177, 157, .28)",
      }
    : {
        surface: "#FFF8D8",
        border: "#E8D896",
        label: "#7A5F1E",
        text: "#4A3C18",
        meta: "#6B5623",
        fold: "#EBDD9F",
        tape: "rgba(232, 177, 157, .62)",
      };
}

/** 홈의 종이 카드에서 접힌 모서리. 카드 뒤 배경과 같은 톤이어야 한다. */
export function paperCorner(dark: boolean) {
  return dark
    ? { fill: "#20242C", edge: "rgba(210, 198, 170, .20)" }
    : { fill: "#E7E7E2", edge: "rgba(115, 100, 69, .22)" };
}
