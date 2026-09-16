import assert from "node:assert/strict";
import { test } from "node:test";

import { hasRecords, tripToMarkdown, tripsToMarkdown, type ExportTrip } from "./tripExportText.ts";

const 경주: ExportTrip = {
  name: "경주",
  date: "10월 1일 — 10월 2일",
  region: "경상",
  note: "가을에 다시 걷는 골목",
  start: "2026-10-01",
  planning: {
    stay: { name: "달빛한옥", checkin: "10월 1일 15:00", checkout: "10월 2일 11:00", address: "경주시 황남동" },
    schedule: [{ date: "1일(목)", time: "목 · 12:30", title: "황리단길 점심", note: "식사 · 국수" }],
    places: [{ name: "첨성대", category: "구경", area: "황리단길", tags: ["야경"] }],
    packingItems: [
      { id: "p1", name: "우산", quantity: "2개", owner: "하늘" },
      { id: "p2", name: "충전기", owner: "공용" },
    ],
    packingDone: ["p1"],
    recipes: [{ name: "김치찌개", note: "첫날 저녁", ingredients: [{ name: "돼지고기", quantity: "300g", owner: "하늘" }] }],
    expenses: [
      { day: "1일(목)", title: "KTX 왕복", amount: 96000, category: "교통", payer: "하늘", memo: "왕복 2인" },
      { day: "1일(목)", title: "저녁", amount: 34000, category: "식비", payer: "여울" },
    ],
    payments: [{ from: "여울", to: "하늘", amount: 30000 }],
    tripNotes: [{ author: "하늘 · 오늘 10:42", body: "주차는 미리 확인하기" }],
    memories: {
      diaries: [{ date: "10월 1일", title: "느린 첫날", body: "계획대로 되지 않아서 더 좋았다" }],
      photos: [{ date: "1일(목)", caption: "도착한 날" }],
    },
  },
};

test("여행 하나를 통째로 읽을 만한 글로 만든다", () => {
  const text = tripToMarkdown(경주);

  assert.equal(text, [
    "## 경주",
    "10월 1일 — 10월 2일 · 경상",
    "가을에 다시 걷는 골목",
    "",
    "### 숙소",
    "- 달빛한옥 — 10월 1일 15:00 → 10월 2일 11:00",
    "  주소: 경주시 황남동",
    "",
    "### 일정 (1개)",
    "- 1일(목) · 목 · 12:30 · 황리단길 점심",
    "  식사 · 국수",
    "",
    "### 장소 (1곳)",
    "- 첨성대 — 구경 · 황리단길",
    "  #야경",
    "",
    "### 준비물 (1/2)",
    "- [x] 우산 · 2개 · 하늘",
    "- [ ] 충전기 · 공용",
    "",
    "### 요리 (1개)",
    "- 김치찌개 — 첫날 저녁",
    "  - 돼지고기 · 300g · 하늘",
    "",
    "### 비용 — 합계 130,000원",
    "- 1일(목) · KTX 왕복 96,000원 · 교통 · 하늘 냄",
    "  왕복 2인",
    "- 1일(목) · 저녁 34,000원 · 식비 · 여울 냄",
    "- 주고받음: 여울 → 하늘 30,000원",
    "",
    "### 메모 (1개)",
    "- 하늘 · 오늘 10:42",
    "  주차는 미리 확인하기",
    "",
    "### 일기 (1개)",
    "- 10월 1일 · 느린 첫날",
    "  계획대로 되지 않아서 더 좋았다",
    "",
    "### 사진 (1장)",
    "- 1일(목) · 도착한 날",
  ].join("\n"));
});

test("여행 통화로 돈을 적는다", () => {
  const text = tripToMarkdown({
    name: "오사카",
    date: "3월 2일 — 3월 4일",
    planning: { currency: "JPY", expenses: [{ title: "지하철", amount: 1200 }] },
  });

  assert.ok(text.includes("### 비용 — 합계 ¥1,200"));
  assert.ok(text.includes("- 지하철 ¥1,200"));
});

test("기록이 없는 여행도 이름과 기간은 남긴다", () => {
  assert.equal(hasRecords(undefined), false);
  assert.equal(
    tripToMarkdown({ name: "속초", date: "10월 3일 — 10월 4일" }),
    "## 속초\n10월 3일 — 10월 4일\n\n적어 둔 기록이 없어요.",
  );
});

test("사진은 파일 없이 설명과 날짜만 남는다", () => {
  const text = tripToMarkdown({
    name: "속초",
    date: "10월 3일",
    // 기기에 있는 파일 자리(uri)는 글에 담지 않는다.
    planning: { memories: { photos: [{ date: "3일(토)", caption: "바다" }] } },
  });

  assert.ok(text.includes("### 사진 (1장)\n- 3일(토) · 바다"));
  assert.equal(text.includes("file://"), false);
});

test("여러 여행을 시작일 순으로 묶고 머리글을 붙인다", () => {
  const text = tripsToMarkdown(
    [{ name: "속초", date: "12월 1일", start: "2026-12-01" }, 경주],
    new Date(2026, 8, 16),
  );

  assert.ok(text.startsWith("# Daymo 여행 기록\n\n내보낸 날: 2026년 9월 16일 · 여행 2개\n"));
  assert.ok(text.indexOf("## 경주") < text.indexOf("## 속초"));
  assert.ok(text.endsWith("\n"));
});

test("여행이 없으면 없다고 적는다", () => {
  assert.ok(tripsToMarkdown([], new Date(2026, 8, 16)).includes("아직 적어 둔 여행이 없어요."));
});
