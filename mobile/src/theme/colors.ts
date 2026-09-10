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

// ---------------------------------------------------------------------------
// 도메인 색
//
// 장소·숙소·준비·요리는 각자 색을 갖는다. 원래 값은 색상각뿐 아니라 명도와
// 채도까지 제각각이라(L* 47~73, C 29~57) 한 화면에서 색끼리 무게가 달라 보였다.
// 색상각만 보존하고 L*과 C를 역할별로 통일한다.
//
//   solid  글자와 아이콘. 자기 배경에서 AA 4.5:1을 넘긴다.
//   soft   같은 색조의 옅은 배경. 태그와 칩에 쓴다.
//
// 주황(요리)은 밝아야 주황으로 보이지만 밝으면 흰 배경에서 AA를 통과하지 못한다.
// 다른 색과 같은 명도로 내린 결과 갈색에 가까워진다. 의도한 절충이다.
// ---------------------------------------------------------------------------

export type DomainId = "place" | "stay" | "packing" | "cooking" | "record";

const domainPalette = {
  place: {
    light: { solid: "#1F764B", soft: "#E0F2E6" },
    dark: { solid: "#85CAA0", soft: "#2B4635" },
  },
  stay: {
    light: { solid: "#00786B", soft: "#DAF3EF" },
    dark: { solid: "#63CDBE", soft: "#1D4741" },
  },
  packing: {
    light: { solid: "#6D5EA0", soft: "#F1EBFC" },
    dark: { solid: "#C3B2F0", soft: "#433C54" },
  },
  cooking: {
    light: { solid: "#8E5E29", soft: "#FBEBDE" },
    dark: { solid: "#E5B282", soft: "#503C29" },
  },
  record: {
    light: { solid: "#886026", soft: "#FAECDD" },
    dark: { solid: "#DFB47F", soft: "#4E3D28" },
  },
} as const;

export function domain(id: DomainId, dark: boolean) {
  return dark ? domainPalette[id].dark : domainPalette[id].light;
}

/**
 * 홈의 종이 카드. 라이트는 크림 종이, 다크는 어두운 종이다.
 * 다크에서 순백을 유지하면 검은 화면에 흰 판이 박혀 야간에 눈이 부시다.
 */
export function paperCard(dark: boolean) {
  return dark
    ? {
        surface: "#232028",
        border: "#3B3742",
        title: "#EDE6D9",
        muted: "#A79E8E",
        rule: "#4A4335",
        stampBorder: "#5A5243",
        iconBorder: "#4E4738",
        backLeft: "#332E24",
        backRight: "#2A3130",
        softLine: "rgba(180, 200, 215, .07)",
        tape: "rgba(218, 198, 157, .30)",
        divider: "rgba(190, 178, 150, .22)",
      }
    : {
        surface: "#FFFEFC",
        border: "#D9D9D5",
        title: "#283046",
        muted: "#756F63",
        rule: "#BEB49D",
        stampBorder: "#B8AD93",
        iconBorder: "#C7BDA5",
        backLeft: "#E7DECA",
        backRight: "#DDE5E3",
        softLine: "rgba(104, 139, 160, .10)",
        tape: "rgba(218, 198, 157, .68)",
        divider: "rgba(118, 107, 83, .22)",
      };
}

/**
 * 찾기 결과의 종류를 도메인 색으로 잇는다. 일정은 앱의 중심 활동이라
 * 도메인 색 대신 테마 강조색을 쓴다.
 */
export function kindColor(kind: string, dark: boolean, primary: string) {
  const map: Record<string, DomainId> = {
    장소: "place",
    숙소: "stay",
    준비: "packing",
    요리: "cooking",
    기록: "record",
  };
  const id = map[kind];
  return id ? domain(id, dark).solid : primary;
}

// ---------------------------------------------------------------------------
// 여행 고유 색
//
// 여행마다 한 색을 갖는다. 원래는 색 하나만 저장하고 그 위에 흰 글자를 얹는 곳과
// 어두운 글자를 얹는 곳이 같이 있었다. 중간 밝기 하나로는 양쪽 대비를 낼 수 없다.
// 배경으로 쓰는 fill과 글자로 쓰는 ink를 나눈다.
//
//   fill  배지와 막대의 배경. 위에 ink를 얹는다.
//   ink   글자, 점, 얇은 선. 배경들과 fill 위에서 AA를 넘고 흰 글자도 받는다.
//   soft  달력 셀처럼 아주 옅게 깔 때.
// ---------------------------------------------------------------------------

const tripTones = [
  { light: { fill: "#FDAD9E", ink: "#893026", soft: "#FFEBE6" }, dark: { fill: "#643C36", ink: "#FA9E8D", soft: "#643C36" } },
  { light: { fill: "#E3BA84", ink: "#6B4600", soft: "#FDEFDE" }, dark: { fill: "#574328", ink: "#DCAE6E", soft: "#574328" } },
  { light: { fill: "#91CFA0", ink: "#005B26", soft: "#E3F5E6" }, dark: { fill: "#2F4D36", ink: "#7DC68F", soft: "#2F4D36" } },
  { light: { fill: "#59D1E2", ink: "#00566C", soft: "#D9F6FB" }, dark: { fill: "#064E57", ink: "#00C6D9", soft: "#064E57" } },
  { light: { fill: "#BABCFB", ink: "#394891", soft: "#F0EFFF" }, dark: { fill: "#434463", ink: "#ADB0FA", soft: "#434463" } },
  { light: { fill: "#D9B3ED", ink: "#663B81", soft: "#F9EDFE" }, dark: { fill: "#53405D", ink: "#D2A5EA", soft: "#53405D" } },
] as const;

export function tripTone(index: number, dark: boolean) {
  const tone = tripTones[((index % tripTones.length) + tripTones.length) % tripTones.length];
  return dark ? tone.dark : tone.light;
}
