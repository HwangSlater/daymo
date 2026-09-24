import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAnnounce } from "../announce";
import { CHUNK_FIRST, chunkGroups, nextChunk } from "../listChunks";
import { Chip } from "../ui/Chip";
import { Segment } from "../ui/Segment";
import { keepTripPhoto } from "../tripPhotos";
import { ParticipantPicker } from "../ParticipantPicker";
import { SyncMark } from "../SyncMarks";
import { 자리에_넣기 } from "../tripPlanning";
import { dayTextOf } from "../dates";

import {
  CURRENCIES,
  DEFAULT_CURRENCY,
  EXPENSE_CATEGORIES,
  type Expense,
  type ExpenseCategory,
  type Participant,
  type Payment,
  type SplitMode,
  type Transfer,
  expensesToCsv,
  josa,
  parseAmount,
  settle,
  amountText,
  currencyOf,
  money,
  shareLabel,
  spentTotal,
  splitModeOf,
  toWon,
  totalsByCategory,
  totalsByDay,
  won,
} from "../tripExpenses";
import { shareExpenseCsv } from "../tripExpenseExport";
import { Image, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";
import { Text, TextInput, type 입력칸 } from "../AppText";
import { Glyph } from "../Glyph";
import { showAlert } from "../showAlert";
import { shrinkForWeb } from "../webImage";
import { 높이, 모서리, 불투명도, 아이콘, 여백, 누름여유, 글자누름여유 } from "../theme/controls";
import { typo } from "../theme/typography";
import { onAccent, status as statusColor } from "../theme/colors";
import { 공용스타일 } from "./styles";
import {
  DetailEditableContext,
  DetailFeedbackContext,
  DetailField,
  DetailSheet,
  DetailThemeContext,
  EmptyState,
  MoneyBlock,
  OptionField,
  OptionalFormSection,
  newPlaceId,
  requiredDot,
  useDraftChanged,
  금액_치기,
  금액_키보드,
} from "./parts";

/** 여행 상세의 「비용」 탭. 쓴 돈과 정산을 본다. */

export function Money({
  addRef,
  scrollToY,
  tripName,
  dayOptions,
  todayDay,
  expenses,
  setExpenses,
  budget,
  setBudget,
  me,
  payments,
  setPayments,
  simplify,
  setSimplify,
  assignedSummary,
  participants,
  saveParticipants,
  spaceMembers,
  currency,
  setCurrency,
  exchangeRate,
  setExchangeRate,
}: {
  /**
   * 「지출 추가」를 여는 길. 떠 있는 ＋ 단추가 스크롤 바깥에 있어서 밖으로 내준다.
   *
   * 스크롤 안에 두면 단추도 함께 밀려 올라가 화면에 붙어 있지 못한다.
   */
  addRef?: React.RefObject<(() => void) | null>;
  /** 스크롤 내용 맨 위에서 잰 자리로 내려 보낸다. 「지출 내역」 바로 가기가 쓴다. */
  scrollToY?: (y: number) => void;
  tripName: string;
  dayOptions: string[];
  /** 여행 날짜 가운데 오늘. 여행 기간이 아니면 빈 문자열. */
  todayDay: string;
  expenses: Expense[];
  setExpenses: React.Dispatch<React.SetStateAction<Expense[]>>;
  budget: number;
  setBudget: React.Dispatch<React.SetStateAction<number>>;
  /** 이 앱을 쓰는 사람. 정산을 이 사람 기준으로 먼저 말한다. */
  me: string;
  payments: Payment[];
  setPayments: React.Dispatch<React.SetStateAction<Payment[]>>;
  simplify: boolean;
  setSimplify: React.Dispatch<React.SetStateAction<boolean>>;
  /** 이 사람 이름으로 여행에 적어 둔 것들. 참가자에서 빼기 전에 보여 준다. */
  assignedSummary: (person: string) => string;
  /** 이번 여행에 가는 사람. 몫은 이 목록을 기준으로 나눈다. */
  participants: Participant[];
  /** 참가자를 서버까지 저장한다. 시트를 닫아도 되면 true. 실패 안내는 저장하는 쪽이 띄운다. */
  saveParticipants: (next: Participant[]) => Promise<boolean>;
  /** 공간 멤버 전원. 참가자를 고를 때의 후보다. */
  spaceMembers: Participant[];
  currency: string;
  setCurrency: React.Dispatch<React.SetStateAction<string>>;
  exchangeRate: number;
  setExchangeRate: React.Dispatch<React.SetStateAction<number>>;
}) {
  const theme = useContext(DetailThemeContext);
  const notify = useContext(DetailFeedbackContext);
  const canEdit = useContext(DetailEditableContext);
  const [dayFilter, setDayFilter] = useState("전체");
  const [categoryFilter, setCategoryFilter] = useState<"전체" | ExpenseCategory>("전체");
  const [budgetSheetOpen, setBudgetSheetOpen] = useState(false);
  const [draftBudget, setDraftBudget] = useState("500,000");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftAmount, setDraftAmount] = useState("");
  const [draftCategory, setDraftCategory] = useState<ExpenseCategory>("식비");
  const [draftPayer, setDraftPayer] = useState<Participant>(participants[0] ?? "");
  // 몫을 지는 사람과 비중. 비어 있으면 참가자 전원이 똑같이 나눈다.
  // 나누는 방식을 눈에 보이게 고르게 한다. 예전에는 아무도 안 고른 상태가
  // 곧 전원 균등이었는데, 화면에는 "아무도 안 골랐다" 로 보여서 여기서 멈췄다.
  // 하나를 누르면 갑자기 그 사람만 몫이 되니 고를수록 늘어날 거라는 예상과도
  // 반대로 움직였다.
  const [draftSplitMode, setDraftSplitMode] = useState<SplitMode>("균등");
  /** "일부" 일 때 몫을 지는 사람. 처음에는 전원이 켜진 채로 시작한다. */
  const [draftPeople, setDraftPeople] = useState<Participant[]>([]);
  /** "금액" 일 때 사람마다 적은 금액. 치는 중이라 글자로 들고 있는다. */
  const [draftAmounts, setDraftAmounts] = useState<Record<Participant, string>>({});
  // 마지막에 적은 분류와 낸 사람. 여행 중에는 같은 사람이 같은 종류를 이어서
  // 적는 일이 많아서, 매번 처음 값으로 돌아가면 지출마다 두 번씩 고치게 된다.
  const [lastCategory, setLastCategory] = useState<ExpenseCategory>("식비");
  const [lastPayer, setLastPayer] = useState<Participant>(participants[0] ?? "");
  const [peopleSheetOpen, setPeopleSheetOpen] = useState(false);
  // 참가자도 저장을 눌러야 바뀐다. 누구였는지 확인만 하려고 체크를 껐다가
  // 바깥을 눌러 닫으면 그 사람이 빠진 채로 정산이 다시 계산돼 버렸다.
  const [draftParticipants, setDraftParticipants] = useState<Participant[]>(participants);
  const [draftDay, setDraftDay] = useState(dayOptions[0] ?? "");
  const [draftMemo, setDraftMemo] = useState("");
  const [draftReceipt, setDraftReceipt] = useState("");
  // 정산에서 빼기. 지우지 않고 셈에서만 뺀다. 회사에 청구할 영수증이나 선물로 낸 돈처럼
  // 적어는 두되 나누지 않을 지출이 있다.
  const [draftExcluded, setDraftExcluded] = useState(false);
  // 누가 내고 누구 몫인지, 그리고 영수증과 메모는 대개 기본값 그대로 둔다.
  // 늘 펼쳐 두면 식당 앞에서 적을 때 제출 단추까지 다섯 줄을 지나야 한다.
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [currencySheetOpen, setCurrencySheetOpen] = useState(false);
  // 시트 안에서 고른 것은 저장을 눌러야 여행에 들어간다. 고르는 즉시 바꾸면
  // 환율을 안 적고 닫았을 때 통화만 달러로 남아 합계가 "약 24원" 이 된다.
  const [draftCurrency, setDraftCurrency] = useState(DEFAULT_CURRENCY.code);
  const [draftRate, setDraftRate] = useState("");
  // 빠르게 적기. 금액만 치고 단추 한 번이면 한 건이 들어간다. 평소 가계부를
  // 안 쓰던 사람이 여행 중에 쓰려면 이 정도로 짧아야 한다.
  const [quickAmount, setQuickAmount] = useState("");
  const [quickCategory, setQuickCategory] = useState<ExpenseCategory>("식비");
  /** 지출 시트의 금액 칸. 항목 칸에서 「다음」을 누르면 여기로 온다. */
  const 금액_칸 = useRef<입력칸 | null>(null);
  /** 「금액 직접」에서 사람마다 선 금액 칸. 「다음」 키가 아래 칸으로 커서를 옮긴다. */
  const 몫_칸 = useRef<(입력칸 | null)[]>([]);
  const budgetDraftChanged = useDraftChanged(budgetSheetOpen, draftBudget);
  const expenseDraftChanged = useDraftChanged(sheetOpen, JSON.stringify([
    draftTitle, draftAmount, draftCategory, draftPayer, draftSplitMode, draftPeople, draftAmounts,
    draftDay, draftMemo, draftReceipt, draftExcluded,
  ]));
  const previousDays = useRef(dayOptions);
  const dayOptionsKey = dayOptions.join("|");

  // 기간이 바뀌면 고르는 칸만 되돌린다. 지출의 날짜 이름표를 새 기간으로 옮기는 일은
  // 여행 수정 저장(부모)이 일정·예약·교통과 한자리에서 한다. 여기서도 옮기면 두 번
  // 밀리고, 비용 탭을 열지 않으면 아예 안 옮겨져 서버의 날짜가 지워졌다(2026-09-23).
  useEffect(() => {
    if (previousDays.current.join("|") === dayOptionsKey) return;
    setDayFilter("전체");
    setDraftDay(dayOptions[0] ?? "");
    previousDays.current = dayOptions;
  }, [dayOptions, dayOptionsKey]);

  // 목록은 늘 여행 날짜 차례로 본다. 넣은 차례로 두면 나중에 끼워 넣은 지출이
  // 엉뚱한 자리에 남는다.
  const sorted = useMemo(() => {
    const order = (day: string) => {
      const index = dayOptions.indexOf(day);
      return index === -1 ? dayOptions.length : index;
    };
    return [...expenses].sort((a, b) => order(a.day) - order(b.day));
  }, [expenses, dayOptions]);
  const settlement = useMemo(
    () => settle(expenses, participants, { payments, simplify }),
    [expenses, participants, payments, simplify],
  );
  // 참가자에서 뺀 사람이 낸 지출은 정산에 남는다. 그 사람이 표에 없으면 정산
  // 줄의 이름이 어디서 왔는지 알 길이 없어서, 뒤에 붙여 같이 보여 준다.
  const paidRows = useMemo(() => {
    const extra = Object.keys(settlement.paid).filter((person) => !participants.includes(person));
    return [...participants, ...extra].map((person) => ({
      person,
      joined: participants.includes(person),
      paid: settlement.paid[person] ?? 0,
      owed: settlement.owed[person] ?? 0,
    }));
  }, [participants, settlement]);
  const byCategory = useMemo(() => totalsByCategory(expenses), [expenses]);
  const byDay = useMemo(() => totalsByDay(expenses, dayOptions), [expenses, dayOptions]);
  const averagePerSpendingDay = byDay.length ? Math.round(settlement.total / byDay.length) : 0;
  const topDay = byDay.reduce<{ day: string; amount: number } | null>(
    (top, row) => (!top || row.amount > top.amount ? row : top),
    null,
  );
  const usedDays = useMemo(
    () => dayOptions.filter((day) => expenses.some((item) => item.day === day)),
    [dayOptions, expenses],
  );
  const visible = useMemo(
    () => sorted.filter(
      (item) =>
        (dayFilter === "전체" || item.day === dayFilter)
        && (categoryFilter === "전체" || item.category === categoryFilter),
    ),
    [categoryFilter, dayFilter, sorted],
  );
  // 날짜로 묶고 소제목에 그날 합계를 단다. 여행 중에 가장 자주 하는 질문이
  // "어제 얼마 썼지" 인데, 한 줄로 늘어놓으면 그걸 셀 수가 없다.
  // 정산에서 뺀 지출만 있는 날도 목록에는 나와야 한다. 그날 합계는 뺀 것을 세지 않는다.
  const grouped = useMemo(
    () =>
      [...new Set(visible.map((item) => item.day))].map((day) => {
        const items = visible.filter((item) => item.day === day);
        return { day, amount: spentTotal(items), items };
      }),
    [visible],
  );
  /**
   * 목록을 몇 판에 나눠 그린다(2026-09-23 검토 #60). 까닭은 `listChunks.ts` 에 적어 뒀다.
   *
   * 거르는 조건이 바뀌면 목록이 통째로 갈리니 첫 판부터 다시 센다. 지출을 한 건
   * 더하거나 지우는 것으로는 되감지 않는다 — 보고 있던 줄이 접히면 방금 무엇을
   * 했는지가 사라진다.
   */
  const 그릴_줄 = useChunkedRows(visible.length, `${dayFilter}|${categoryFilter}`);
  const shownGroups = useMemo(() => chunkGroups(grouped, 그릴_줄), [grouped, 그릴_줄]);
  const unit = currencyOf(currency);
  // 금액 칸에서 눌러 더하는 단위. 통화가 원이면 천 단위, 소수를 쓰는 통화면 한 자리 작게 잡는다.
  const quickSteps = unit.fraction > 0 ? [1, 5, 10] : [1000, 5000, 10000];
  // 이 탭 안에서는 늘 여행 통화로 적는다. 원 환산은 합계 옆에만 덧붙인다.
  const show = (amount: number) => money(amount, unit.code);
  /** 목록 한 줄의 몫 표시. "가람 몫" 인데 본인 부담은 그 말 자체가 몫이라 뒤에 붙이지 않는다. */
  const shareMeta = (item: Expense) => {
    const label = shareLabel(item, participants);
    return label === "본인 부담" ? label : `${label} 몫`;
  };
  // 내 줄을 먼저, 나머지는 접어서. 내가 참가자가 아니면 전부 남의 일이다.
  const myTransfers = settlement.transfers.filter(
    (transfer) => transfer.from === me || transfer.to === me,
  );
  const otherTransfers = settlement.transfers.filter(
    (transfer) => transfer.from !== me && transfer.to !== me,
  );
  const [othersOpen, setOthersOpen] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);
  const [paidOpen, setPaidOpen] = useState(false);
  const [paying, setPaying] = useState<Transfer | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const openPayment = (transfer: Transfer) => {
    setPaying(transfer);
    // 전액이 기본이다. 대개 한 번에 갚는다.
    setPayAmount(amountText(transfer.amount, unit.fraction));
  };
  const payNumber = parseAmount(payAmount, unit.fraction);
  /** 이 줄이 나온 근거. 낸 돈과 몫, 그리고 대신 받는 경우면 그 사실. */
  const payWhy = (() => {
    if (!paying) return [];
    const lines = [
      `${paying.from}: 낸 돈 ${show(settlement.paid[paying.from] ?? 0)} · 몫 ${show(settlement.owed[paying.from] ?? 0)}`,
      `${paying.to}: 낸 돈 ${show(settlement.paid[paying.to] ?? 0)} · 몫 ${show(settlement.owed[paying.to] ?? 0)}`,
    ];
    const owedDirectly = settlement.direct.some(
      (debt) => debt.from === paying.from && debt.to === paying.to,
    );
    if (!owedDirectly) {
      const real = settlement.direct
        .filter((debt) => debt.from === paying.from)
        .map((debt) => debt.to);
      lines.push(real.length
        ? `${paying.from}${josa(paying.from, "이", "가")} 빌린 건 ${real.join(" · ")}인데, 오갈 횟수를 줄이려고 ${paying.to}${josa(paying.to, "이", "가")} 대신 받아요.`
        : `오갈 횟수를 줄이려고 ${paying.to}${josa(paying.to, "이", "가")} 대신 받아요.`);
    }
    return lines;
  })();
  /**
   * 보낸 기록 한 줄을 적는다. 알림에 되돌리기를 붙인다.
   *
   * 「다 보냈어요」는 한 번 탭으로 확정돼서 잘못 누르면 표 아래 기록 줄을 찾아 들어가야
   * 했다(2026-09-23). 돈 기록이라 묻지 않고 적되, 무를 길을 그 자리에 둔다.
   */
  const 보낸_것_적기 = (from: Participant, to: Participant, amount: number) => {
    const id = newPlaceId();
    setPayments((current) => {
      // 시각은 값을 바꾸는 이 안에서 읽는다. 그리는 중에 시계를 읽으면
      // 같은 그림이 두 번 그려질 때 값이 달라진다.
      const at = Date.now();
      return [...current, { id, from, to, amount, at }];
    });
    notify(`${from}${josa(from, "이", "가")} ${to}에게 ${show(amount)} 보낸 걸로 적었어요`, {
      label: "되돌리기",
      onPress: () => {
        setPayments((current) => current.filter((item) => item.id !== id));
        notify("보낸 기록을 되돌렸어요");
      },
    });
  };
  const savePayment = () => {
    if (!paying || payNumber <= 0) return;
    보낸_것_적기(paying.from, paying.to, Math.min(payNumber, paying.amount));
    setPaying(null);
  };
  /** 한 번에 다 갚는 흔한 경우. 줄의 버튼이 바로 적는다. */
  const recordFull = (transfer: Transfer) => 보낸_것_적기(transfer.from, transfer.to, transfer.amount);
  const undoPayment = (payment: Payment) => {
    const 자리 = payments.findIndex((item) => item.id === payment.id);
    setPayments((current) => current.filter((item) => item.id !== payment.id));
    notify("주고받은 기록을 삭제했어요", {
      label: "되돌리기",
      onPress: () => {
        setPayments((current) => 자리에_넣기(current, payment, 자리 < 0 ? current.length : 자리));
        notify("주고받은 기록을 되돌렸어요");
      },
    });
  };
  const toggleSimplify = () => {
    // 묶은 화면이 시키는 대로 보낸 뒤에 방식을 바꾸면, 이미 보낸 돈이 엉뚱한
    // 곳으로 간 게 되고 끝난 일이 되살아난다. 기록을 다 지우면 다시 열린다.
    if (payments.length) {
      notify("주고받은 기록이 있어 바꿀 수 없어요. 기록을 되돌린 뒤 바꿔 주세요");
      return;
    }
    setSimplify((current) => !current);
  };
  /**
   * 단톡방에 그대로 붙일 글.
   *
   * 정산은 앱 안에서 안 끝난다. 결국 누가 단톡방에 옮겨 적어야 하는데, 그걸
   * 손으로 치면 숫자가 틀어진다.
   */
  const copySettlement = async () => {
    const lines = [
      `${tripName} 정산`,
      `총 ${show(settlement.total)} · ${participants.length}명`,
      "",
      ...settlement.transfers.map(
        (transfer) => `${transfer.from} → ${transfer.to} ${show(transfer.amount)}`,
      ),
    ];
    if (!settlement.transfers.length) lines.push("주고받을 게 없어요");
    if (payments.length) {
      lines.push("", `보낸 것 ${payments.length}건`);
      for (const payment of payments) {
        lines.push(`${payment.from} → ${payment.to} ${show(payment.amount)} 완료`);
      }
    }
    await Clipboard.setStringAsync(lines.join("\n"));
    notify("정산 내용을 복사했어요");
  };

  const inWon = (amount: number) => toWon(amount, exchangeRate);
  const foreign = unit.code !== DEFAULT_CURRENCY.code;
  const amountNumber = parseAmount(draftAmount, unit.fraction);
  const budgetNumber = parseAmount(draftBudget, unit.fraction);
  // 이름은 안 적어도 된다. 안 적으면 분류가 이름이 된다. "식비 12,000원" 만으로도
  // 나중에 표를 볼 때 뜻이 통하고, 필수 글자 입력이 하나 줄어든다.
  const formValid = amountNumber > 0;
  const budgetRemaining = budget - settlement.total;
  const budgetProgress = budget > 0 ? settlement.total / budget : 0;
  // 치는 동안 세 자리마다 끊는다. 32,000 과 320,000 은 자릿수가 안 끊기면
  // 눈으로 구별이 안 되고, 돈에서 제일 흔한 실수가 여기서 난다.
  const changeAmount = (text: string) => setDraftAmount(금액_치기(text, unit.fraction));
  const openBudget = () => {
    setDraftBudget(budget ? amountText(budget, unit.fraction) : "");
    setBudgetSheetOpen(true);
  };
  const saveBudget = () => {
    if (!budgetNumber) return;
    setBudget(budgetNumber);
    setBudgetSheetOpen(false);
    notify("여행 예산을 저장했어요");
  };
  /** 예산을 지워 「예산 없음」으로 되돌린다. 0 이면 막대를 아예 내지 않는다. */
  const clearBudget = () => {
    setBudget(0);
    setDraftBudget("");
    setBudgetSheetOpen(false);
    notify("여행 예산을 삭제했어요");
  };

  /**
   * 이 시트에서 고를 수 있는 사람. 참가자 + 이 지출에 이미 적혀 있던 사람.
   *
   * 참가자에서 뺀 사람이 낸 지출이나 그 사람 몫이 있으면 목록 어디에도 이름이 없어,
   * 열어도 고칠 수 없고 저장하면 그 사람 몫이 조용히 사라졌다(2026-09-23). 적혀 있던
   * 사람은 목록 뒤에 붙여 두고, 누가 참가자가 아닌지는 한 줄로 알린다.
   */
  const 시트_사람 = useMemo(() => {
    const 있던_것 = editingId ? expenses.find((item) => item.id === editingId) : undefined;
    const 적힌_사람 = 있던_것 ? [있던_것.payer, ...Object.keys(있던_것.shares ?? {})] : [];
    const 빠진_사람 = [...new Set(적힌_사람.filter((name) => name && !participants.includes(name)))];
    return { 모두: [...participants, ...빠진_사람], 빠진_사람 };
  }, [editingId, expenses, participants]);

  // 고른 방식을 저장 모양(비중)으로 옮긴다. 계산은 한 가지 방식만 알면 된다.
  const draftShares = ((): Record<Participant, number> | undefined => {
    if (draftSplitMode === "균등") return undefined;
    if (draftSplitMode === "본인") return { [draftPayer]: 1 };
    if (draftSplitMode === "일부") {
      if (!draftPeople.length) return undefined;
      return Object.fromEntries(draftPeople.map((person) => [person, 1]));
    }
    const entries = 시트_사람.모두
      .map((person) => [person, parseAmount(draftAmounts[person] ?? "", unit.fraction)] as const)
      .filter(([, value]) => value > 0);
    return entries.length ? Object.fromEntries(entries) : undefined;
  })();
  const quickNumber = parseAmount(quickAmount, unit.fraction);
  const quickPayer = participants.includes(lastPayer) ? lastPayer : participants[0] ?? "";
  // 금액을 직접 적을 때 아직 안 채운 돈. 0 이 돼야 저장할 수 있다.
  const draftAmountLeft = amountNumber - 시트_사람.모두.reduce(
    (sum, person) => sum + parseAmount(draftAmounts[person] ?? "", unit.fraction),
    0,
  );
  /** 금액 칸 아래 한 줄. 합이 맞으면 맞았다고, 아니면 얼마가 비거나 넘는지 말한다. */
  const 남은_돈_말 = draftAmountLeft === 0
    ? "딱 맞아요"
    : draftAmountLeft > 0
      ? `${show(draftAmountLeft)} 남았어요`
      : `${show(-draftAmountLeft)} 넘었어요`;
  /**
   * 남은 돈을 낭독기에 한 줄로 읽어 준다(2026-09-23 검토 #29).
   *
   * 옆에 붙은 `accessibilityLiveRegion` 은 안드로이드만 듣는다. 합이 안 맞으면 저장이
   * 막히는데, iOS VoiceOver 는 이 줄을 손가락으로 짚기 전에는 읽지 않아 왜 못 넘어가는지
   * 알 수가 없었다. 맞았을 때는 읽지 않는다 — 저장 단추가 열리는 것으로 이미 알 수 있고,
   * 숫자를 칠 때마다 「딱 맞아요」가 끼어들면 그게 더 방해가 된다.
   */
  useAnnounce(sheetOpen && draftSplitMode === "금액" && draftAmountLeft !== 0 ? 남은_돈_말 : "");
  // 저장을 막는 이유를 하나만 고른다. 여러 줄을 한꺼번에 띄우면 뭘 고쳐야
  // 하는지 더 헷갈린다.
  const splitHint = !formValid
    ? "금액을 입력해 주세요"
    : draftSplitMode === "일부" && !draftPeople.length
      ? "몫을 질 사람을 한 명은 골라 주세요"
      : draftSplitMode === "금액" && draftAmountLeft !== 0
        ? (draftAmountLeft > 0 ? `아직 ${show(draftAmountLeft)} 남았어요` : `${show(-draftAmountLeft)} 넘었어요`)
        : undefined;
  const draftPayerHint = participants.length > 1
    ? `${quickPayer}${josa(quickPayer, "이", "가")} 내고 ${participants.length}명이 똑같이 나눠요`
    : `${quickPayer}${josa(quickPayer, "이", "가")} 냈어요`;
  const addQuickExpense = () => {
    if (!quickNumber) return;
    setExpenses((current) => [
      ...current,
      {
        id: newPlaceId(),
        // 빠르게 적는 건 지금 쓴 돈이다. 여행 중이면 오늘, 아니면 첫날이다.
        day: todayDay || dayOptions[0] || "",
        title: quickCategory,
        amount: quickNumber,
        category: quickCategory,
        payer: participants.includes(lastPayer) ? lastPayer : participants[0] ?? "",
        memo: "",
      },
    ]);
    setQuickAmount("");
    setLastCategory(quickCategory);
    notify(`지출을 추가했어요 · ${quickCategory} ${money(quickNumber, unit.code)}`);
  };
  /** 나누는 자리를 기본값으로. 전원이 똑같이 나누는 게 가장 흔하다. */
  const resetSplit = () => {
    setDraftSplitMode("균등");
    setDraftPeople(participants);
    setDraftAmounts({});
  };
  /**
   * 저장된 지출을 고칠 때, 적었던 방식 그대로 다시 연다.
   *
   * 방식은 `splitModeOf` 가 비중 모양까지 보고 정한다. 서버는 「본인 부담」을 모르고
   * 낸 사람 혼자 몫인 「일부」로 돌려주는데, 그걸 그대로 열면 헷갈린다.
   */
  const loadSplit = (item: Expense) => {
    const shares = item.shares ?? {};
    const picked = Object.keys(shares);
    const mode = splitModeOf(item);
    setDraftSplitMode(mode);
    setDraftPeople(picked.length ? picked : participants);
    setDraftAmounts(mode === "금액"
      ? Object.fromEntries(picked.map((person) => [person, amountText(shares[person], unit.fraction)]))
      : {});
  };
  const openCreate = () => {
    setEditingId(null);
    setDraftTitle("");
    setDraftAmount("");
    setDraftCategory(lastCategory);
    setDraftPayer(participants.includes(lastPayer) ? lastPayer : participants[0] ?? "");
    resetSplit();
    // 날짜를 거르고 있으면 그 날, 아니면 오늘, 여행 기간이 아니면 첫날이다.
    setDraftDay(dayFilter === "전체" ? todayDay || dayOptions[0] || "" : dayFilter);
    setDraftMemo("");
    setDraftReceipt("");
    setDraftExcluded(false);
    setExtrasOpen(false);
    setSheetOpen(true);
  };
  /** 비용 탭이 스크롤 내용에서 놓인 자리, 그리고 그 안에서 「지출 내역」이 놓인 자리. */
  const 비용_맨위 = useRef(0);
  const 내역_자리 = useRef(0);
  // 떠 있는 ＋ 단추는 스크롤 바깥(화면에 고정된 자리)에 있다. 여는 길만 밖으로 내준다.
  // 값이 아니라 함수라 렌더마다 다시 담아야 지금 상태를 보고 연다.
  useEffect(() => {
    if (!addRef) return;
    addRef.current = openCreate;
    return () => {
      addRef.current = null;
    };
  });
  const openEdit = (item: Expense) => {
    setEditingId(item.id);
    setDraftTitle(item.title);
    setDraftAmount(amountText(item.amount, unit.fraction));
    setDraftCategory(item.category);
    setDraftPayer(item.payer);
    loadSplit(item);
    setDraftDay(item.day);
    setDraftMemo(item.memo);
    setDraftReceipt(item.receiptUri ?? "");
    setDraftExcluded(Boolean(item.excluded));
    // 기본값과 다른 지출을 고칠 때는 그 자리를 바로 보여준다.
    setExtrasOpen(Boolean(item.memo || item.receiptUri));
    setSheetOpen(true);
  };
  const saveExpense = () => {
    if (!formValid) return;
    setExpenses((current) => {
      // 새 번호는 값을 바꾸는 이 안에서 만든다. 그려지는 중에 시계를 읽으면
      // 같은 그림이 두 번 그려질 때 번호가 달라진다.
      const next: Expense = {
        id: editingId ?? newPlaceId(),
        day: draftDay,
        title: draftTitle.trim() || draftCategory,
        amount: amountNumber,
        category: draftCategory,
        payer: draftPayer,
        shares: draftShares,
        splitMode: draftSplitMode,
        memo: draftMemo.trim(),
        receiptUri: draftReceipt || undefined,
        ...(draftExcluded ? { excluded: true } : {}),
        ...(() => {
          const before = current.find((item) => item.id === editingId);
          return {
            // 영수증을 그대로 두었으면 올린 사진 id 도 그대로다. 바꾸거나 떼면 새로 올린다.
            ...(draftReceipt && before?.receiptPhotoId && before.receiptUri === draftReceipt
              ? { receiptPhotoId: before.receiptPhotoId }
              : {}),
            // 교통편에서 만든 지출이라는 표시는 고쳐도 남는다. 없어지면 그 교통편을 다시
            // 저장할 때 지출이 하나 더 생긴다.
            ...(before?.transportId ? { transportId: before.transportId } : {}),
          };
        })(),
      };
      return editingId
        ? current.map((item) => (item.id === editingId ? next : item))
        : [...current, next];
    });
    setLastCategory(draftCategory);
    setLastPayer(draftPayer);
    setSheetOpen(false);
    notify(editingId ? "지출을 수정했어요" : "지출을 추가했어요");
  };
  const deleteExpense = () => {
    const 자리 = expenses.findIndex((item) => item.id === editingId);
    if (자리 < 0) return;
    const target = expenses[자리];
    setExpenses((current) => current.filter((item) => item.id !== target.id));
    setSheetOpen(false);
    notify("지출을 삭제했어요", {
      label: "되돌리기",
      onPress: () => {
        setExpenses((current) => 자리에_넣기(current, target, 자리));
        notify("지출을 되돌렸어요");
      },
    });
  };
  const chooseReceipt = async () => {
    // 시스템 사진 선택 창은 권한 없이 고른 사진만 앱에 준다(iOS PHPicker, Android Photo Picker).
    // 사진 전체 접근을 묻지 않는다(docs/development/08-privacy-and-release-compliance.md 5장).
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.7,
        // 사진과 같은 까닭으로 HEIC 를 JPEG 으로 받는다.
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
        base64: Platform.OS === "web",
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const picked = Platform.OS === "web" && asset.base64
        ? await shrinkForWeb(`data:${asset.mimeType ?? "image/jpeg"};base64,${asset.base64}`)
        : asset.uri;
      setDraftReceipt(await keepTripPhoto(picked));
    } catch {
      notify("영수증을 불러오지 못했어요");
    }
  };
  const openPeople = () => {
    setDraftParticipants(participants);
    setPeopleSheetOpen(true);
  };
  const savePeople = async () => {
    // 공간 멤버 순서를 지킨다. 뺐다 다시 넣었다고 목록 맨 뒤로 가면 화면마다
    // 사람 순서가 달라진다.
    const ordered = spaceMembers.filter((person) => draftParticipants.includes(person));
    const extra = draftParticipants.filter((person) => !spaceMembers.includes(person));
    const next = [...ordered, ...extra];
    if (!(await saveParticipants(next))) return;
    setPeopleSheetOpen(false);
    notify(`참가자 ${next.length}명으로 저장했어요`);
  };
  const openCurrency = () => {
    setDraftCurrency(currency);
    setDraftRate(exchangeRate === 1 ? "" : amountText(exchangeRate, 2));
    setCurrencySheetOpen(true);
  };
  const saveCurrency = () => {
    // 원으로 돌아오면 환율은 늘 1 이다. 따로 적게 하면 틀릴 자리만 는다.
    const nextRate = draftCurrency === DEFAULT_CURRENCY.code
      ? 1
      : Math.max(0.0001, parseAmount(draftRate, 2) || 1);
    const 통화가_바뀜 = draftCurrency !== currency;
    const 적용 = () => {
      // 예산은 여행 통화로 적은 값이다. 통화만 바꾸고 숫자를 그대로 두면
      // 50만 원 예산이 50만 달러가 된다. 원을 거쳐 옮긴다.
      if (통화가_바뀜) {
        setBudget((current) => Math.max(0, Math.round((current * exchangeRate) / nextRate)));
      }
      setCurrency(draftCurrency);
      setExchangeRate(nextRate);
      setCurrencySheetOpen(false);
      notify("여행 통화를 저장했어요");
    };
    // 이미 적어 둔 지출은 숫자가 그대로 남는다. 12,000 원이 12,000 달러가 되는 셈이라
    // 정산·표·홈 요약이 전부 틀리는데 조용히 지나갔다(2026-09-23). 한꺼번에 환산하는
    // 것은 되돌릴 수 없어 하지 않고, 무슨 일이 일어나는지만 분명히 묻는다.
    if (통화가_바뀜 && expenses.length) {
      showAlert(
        "통화를 바꿀까요?",
        `이미 적어 둔 지출 ${expenses.length}건은 숫자가 그대로 남고 단위만 바뀌어요.`
        + ` ${money(12000, currency)} 는 ${money(12000, draftCurrency)} 가 돼요.`
        + " 예산은 환율로 환산해요.",
        [{ text: "취소", style: "cancel" }, { text: "바꾸기", onPress: 적용 }],
      );
      return;
    }
    적용();
  };
  const exportCsv = async () => {
    if (!expenses.length) {
      notify("저장할 지출이 없어요");
      return;
    }
    const csv = expensesToCsv(tripName, sorted, participants, unit.code, exchangeRate);
    try {
      // 공유를 못 하는 곳에서는 표를 클립보드에 담는다. 스프레드시트에 그대로
      // 붙여넣으면 같은 표가 된다.
      if ((await shareExpenseCsv(`${tripName} 비용`, csv)) === "unavailable") {
        await Clipboard.setStringAsync(csv);
        notify("표를 복사했어요. 스프레드시트에 붙여넣어 주세요");
      }
    } catch {
      notify("지출 표를 저장하지 못했어요");
    }
  };

  return (
    <View
      onLayout={(event) => {
        비용_맨위.current = event.nativeEvent.layout.y;
      }}
    >
      {/* 맨 위 「지출 N건」 제목줄은 뺐다. 탭 이름이 이미 「비용」이고 탭 줄에
          건수까지 찍히는데, 같은 말을 한 번 더 하고 아래 「지출 내역」과도
          겹쳤다. 그 줄에 있던 지출 추가 버튼은 목록 제목 옆으로 내렸다. */}
      <MoneyBlock title="총 지출" action={canEdit ? (budget > 0 ? "예산 수정" : "예산 정하기") : undefined} onAction={openBudget}>
        <View style={styles.moneyTotalRow}>
          <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.moneyTotal, styles.moneyTotalShrink, theme && { color: theme.text }]}>
            {show(settlement.total)}
          </Text>
          {/* 지출 내역은 총 지출·정산·분류별 아래라 한참 내려가야 나온다. 쓴 돈을
              보다가 무엇에 썼는지 궁금해지는 자리가 여기라, 금액 바로 옆에 길을 낸다. */}
          {expenses.length > 0 && scrollToY && (
            <Pressable
              onPress={() => scrollToY(비용_맨위.current + 내역_자리.current)}
              accessibilityRole="button"
              accessibilityLabel={`지출 내역 ${expenses.length}건으로 바로 가기`}
              hitSlop={글자누름여유}
              style={({ pressed }) => [styles.moneyJump, pressed && 공용스타일.controlPressed]}
            >
              <Text style={[styles.moneyJumpText, theme && { color: theme.primary }]}>내역 {expenses.length}건</Text>
              <Glyph name="chevronDown" size={아이콘.작게} color={theme?.primary ?? "#3F4C8F"} weight={2.4} />
            </Pressable>
          )}
        </View>
        <View style={styles.moneyCurrencyRow}>
          {/* 총액 아래의 보조 설정이라 버튼 모양은 유지하되 작게 그린다.
              실제 누르는 범위는 hitSlop으로 44pt를 확보한다. */}
          <Pressable
            onPress={openCurrency}
            disabled={!canEdit}
            hitSlop={누름여유(28)}
            accessibilityRole="button"
            accessibilityLabel={`여행 통화 ${unit.code} ${unit.label}, 눌러서 바꾸기`}
            style={({ pressed }) => [
              styles.moneyCurrencyChip,
              theme && { borderColor: theme.primary, backgroundColor: theme.primarySoft },
              pressed && 공용스타일.controlPressed,
            ]}
          >
            <Text style={[styles.moneyCurrencyLabel, theme && { color: theme.muted }]}>통화</Text>
            <Text style={[styles.moneyCurrencyValue, theme && { color: theme.primary }]}>
              {unit.code === DEFAULT_CURRENCY.code
                ? "원"
                : `${unit.code} · ${amountText(exchangeRate, 2)}원`}
            </Text>
            {canEdit && <Glyph name="chevronDown" size={아이콘.작게} color={theme?.primary ?? "#3F4C8F"} />}
          </Pressable>
          {/* 누구끼리 나누는지가 정산의 전제다. 공간 멤버가 여럿이면 이번
              여행에 누가 갔는지부터 맞아야 아래 숫자가 뜻을 갖는다. */}
          <Pressable
            onPress={openPeople}
            disabled={!canEdit}
            hitSlop={누름여유(28)}
            accessibilityRole="button"
            accessibilityLabel={`이번 여행 참가자 ${participants.length}명, 눌러서 바꾸기`}
            style={({ pressed }) => [
              styles.moneyCurrencyChip,
              theme && { borderColor: theme.primary, backgroundColor: theme.primarySoft },
              pressed && 공용스타일.controlPressed,
            ]}
          >
            <Text style={[styles.moneyCurrencyLabel, theme && { color: theme.muted }]}>참가자</Text>
            <Text numberOfLines={1} style={[styles.moneyCurrencyValue, theme && { color: theme.primary }]}>
              {participants.length}명
            </Text>
            {canEdit && <Glyph name="chevronDown" size={아이콘.작게} color={theme?.primary ?? "#3F4C8F"} />}
          </Pressable>
          {/* 원이 아닐 때만 환산을 낸다. 원이면 같은 숫자를 두 번 보여줄 뿐이다. */}
          {foreign && (
            <Text style={[styles.moneyConverted, theme && { color: theme.muted }]}>
              약 {won(inWon(settlement.total))}원
            </Text>
          )}
        </View>
        {/* 예산을 정한 여행에만 막대를 낸다. 정하지 않았는데 막대가 뜨면 어디서 온
            숫자인지 알 수 없고, 0% 막대는 아직 아무것도 안 쓴 것처럼 읽힌다. */}
        {budget > 0 ? (<>
          <View style={[styles.moneyBudgetTrack, theme && { backgroundColor: theme.surfaceAlt }]}>
            <View
              style={[
                styles.moneyBudgetFill,
                { width: `${Math.min(100, budgetProgress * 100)}%` },
                theme && { backgroundColor: budgetRemaining < 0 ? (theme.dark ? statusColor.danger.dark : statusColor.danger.light) : theme.primary },
              ]}
            />
          </View>
          <View style={styles.moneyBudgetFoot}>
            <Text style={[styles.moneyBudgetStatus, theme && { color: budgetRemaining < 0 ? (theme.dark ? statusColor.danger.dark : statusColor.danger.light) : theme.muted }]}>
              {budgetRemaining < 0 ? `${show(Math.abs(budgetRemaining))} 초과` : `${show(budgetRemaining)} 남음`}
            </Text>
            <Text style={[styles.moneyBudgetPercent, theme && { color: theme.muted }]}>{Math.round(budgetProgress * 100)}%</Text>
          </View>
        </>) : canEdit ? (
          <Text style={[공용스타일.settingHint, theme && { color: theme.muted }]}>
            예산을 정하면 얼마나 썼는지 막대로 보여 줘요
          </Text>
        ) : null}
      </MoneyBlock>
      {/* 결국 이걸 보려고 들어온다. 합계 바로 다음에 두고, 예산과 사람별
          숫자는 그 뒤로 미룬다.

          "나" 로 먼저 말한다. 전체 조망만 있으면 여러 줄 중 내 줄을 눈으로
          찾아야 하고, 정작 내가 할 일이 뭔지는 맨 나중에 안다. */}
      <MoneyBlock
        title="정산"
        action={canEdit && settlement.transfers.length > 1 ? (simplify ? "원래대로" : "송금 줄이기") : undefined}
        onAction={toggleSimplify}
      >
        <View style={styles.moneySettleBlock}>
          {myTransfers.map((transfer) => {
            const iSend = transfer.from === me;
            const other = iSend ? transfer.to : transfer.from;
            return (
              <Pressable
                key={`${transfer.from}-${transfer.to}`}
                onPress={() => openPayment(transfer)}
                accessibilityRole="button"
                accessibilityLabel={`${other}에게 ${iSend ? "보낼" : "받을"} 돈 ${show(transfer.amount)}, 눌러서 왜 그런지 보거나 일부만 적기`}
                style={({ pressed }) => [
                  styles.moneySettle,
                  theme && { backgroundColor: theme.primarySoft },
                  pressed && 공용스타일.controlPressed,
                ]}
              >
                <View style={styles.moneySettleCopy}>
                  <Text style={[styles.moneySettleWho, theme && { color: theme.muted }]}>
                    {iSend ? "내가 보낼 돈" : "내가 받을 돈"}
                  </Text>
                  <Text numberOfLines={1} style={[styles.moneySettleText, theme && { color: theme.primary }]}>
                    {other}{iSend ? "에게" : "에게서"}
                  </Text>
                </View>
                <Text style={[styles.moneySettleAmount, theme && { color: theme.primary }]}>{show(transfer.amount)}</Text>
                {canEdit && (
                <Pressable
                  onPress={() => recordFull(transfer)}
                  accessibilityRole="button"
                  accessibilityLabel={`${other}에게 ${show(transfer.amount)} ${iSend ? "다 보냈어요" : "다 받았어요"}`}
                  hitSlop={누름여유(높이.칩)}
                  style={({ pressed }) => [
                    styles.moneySettleDone,
                    theme && { backgroundColor: theme.primary },
                    pressed && 공용스타일.controlPressed,
                  ]}
                >
                  <Text style={[styles.moneySettleDoneText, theme && { color: onAccent(theme.dark) }]}>
                    {iSend ? "보냈어요" : "받았어요"}
                  </Text>
                </Pressable>
                )}
              </Pressable>
            );
          })}
          {!myTransfers.length && (
            <View style={[styles.moneySettle, theme && { backgroundColor: theme.primarySoft }]}>
              <Text style={[styles.moneySettleText, theme && { color: theme.primary }]}>
                {!expenses.length
                  ? "지출을 적으면 여기서 정산해요"
                  : otherTransfers.length
                    ? "내가 주고받을 건 없어요"
                    : "서로 줄 것도 받을 것도 없어요"}
              </Text>
            </View>
          )}
          {/* 나머지는 남의 일이라 접어 둔다. 그래도 전체가 맞는지 보고 싶을
              때가 있어서 없애지는 않는다. */}
          {otherTransfers.length > 0 && (
            <Pressable
              onPress={() => setOthersOpen((current) => !current)}
              accessibilityRole="button"
              accessibilityState={{ expanded: othersOpen }}
              style={styles.moneyOthersHead}
            >
              <Text style={[styles.moneyOthersLabel, theme && { color: theme.muted }]}>
                다른 사람들끼리 {otherTransfers.length}건
              </Text>
              <Glyph name={othersOpen ? "chevronDown" : "chevronRight"} size={아이콘.작게} color={theme?.muted ?? "#646C7A"} />
            </Pressable>
          )}
          {othersOpen && otherTransfers.map((transfer) => (
            <Pressable
              key={`${transfer.from}-${transfer.to}`}
              onPress={() => openPayment(transfer)}
              accessibilityRole="button"
              accessibilityLabel={`${transfer.from}${josa(transfer.from, "이", "가")} ${transfer.to}에게 ${show(transfer.amount)}, 눌러서 자세히`}
              style={({ pressed }) => [
                styles.moneyOtherRow,
                theme && { borderColor: theme.border },
                pressed && 공용스타일.controlPressed,
              ]}
            >
              <Text numberOfLines={1} style={[styles.moneyOtherText, theme && { color: theme.text }]}>
                {transfer.from}{josa(transfer.from, "이", "가")} {transfer.to}에게
              </Text>
              <Text style={[styles.moneyOtherAmount, theme && { color: theme.text }]}>{show(transfer.amount)}</Text>
            </Pressable>
          ))}
          {/* 보냈다고 적어 둔 것. 지우면 잔액이 되살아난다. */}
          {payments.length > 0 && (
            <Pressable
              onPress={() => setDoneOpen((current) => !current)}
              accessibilityRole="button"
              accessibilityState={{ expanded: doneOpen }}
              style={styles.moneyOthersHead}
            >
              <Text style={[styles.moneyOthersLabel, theme && { color: theme.muted }]}>
                주고받은 것 {payments.length}건
              </Text>
              <Glyph name={doneOpen ? "chevronDown" : "chevronRight"} size={아이콘.작게} color={theme?.muted ?? "#646C7A"} />
            </Pressable>
          )}
          {doneOpen && [...payments].reverse().map((payment) => (
            <View key={payment.id} style={[styles.moneyOtherRow, theme && { borderColor: theme.border }]}>
              <Text numberOfLines={1} style={[styles.moneyOtherText, theme && { color: theme.muted }]}>
                {payment.from}{josa(payment.from, "이", "가")} {payment.to}에게 {show(payment.amount)}
              </Text>
              {canEdit && (
              <Pressable
                onPress={() => undoPayment(payment)}
                hitSlop={글자누름여유}
                accessibilityRole="button"
                accessibilityLabel={`${payment.from}에서 ${payment.to}에게 보낸 ${show(payment.amount)} 되돌리기`}
              >
                <Text style={[styles.moneyOtherUndo, theme && { color: theme.primary }]}>되돌리기</Text>
              </Pressable>
              )}
            </View>
          ))}
          {(settlement.transfers.length > 0 || payments.length > 0) && (
            <Pressable
              onPress={copySettlement}
              accessibilityRole="button"
              accessibilityLabel="정산 내용 복사"
              style={({ pressed }) => [
                styles.moneySettleCopyButton,
                theme && { borderColor: theme.border },
                pressed && 공용스타일.controlPressed,
              ]}
            >
              <Text style={[styles.moneySettleCopyText, theme && { color: theme.primary }]}>정산 내용 복사</Text>
            </Pressable>
          )}
          {/* 낸 돈과 내야 할 돈. 정산이 어디서 나왔는지의 근거라 여기 둔다.
              사람 수만큼 가로로 나누면 넷만 돼도 숫자가 잘려서 아무것도 못
              읽는다. 세로로 쌓고 머리글을 한 번만 단다. */}
          <Pressable
            onPress={() => setPaidOpen((current) => !current)}
            accessibilityRole="button"
            accessibilityState={{ expanded: paidOpen }}
            style={styles.moneyOthersHead}
          >
            <Text style={[styles.moneyOthersLabel, theme && { color: theme.muted }]}>
              낸 돈 · {paidRows.length}명
            </Text>
            <Glyph name={paidOpen ? "chevronDown" : "chevronRight"} size={아이콘.작게} color={theme?.muted ?? "#646C7A"} />
          </Pressable>
        </View>
        {paidOpen && (
        <View style={styles.moneyPaidTable}>
          <View style={styles.moneyPaidHead}>
            <Text style={[styles.moneyPaidHeadName, theme && { color: theme.muted }]}>참가자</Text>
            <Text style={[styles.moneyPaidHeadCell, theme && { color: theme.muted }]}>낸 돈</Text>
            <Text style={[styles.moneyPaidHeadCell, theme && { color: theme.muted }]}>내야 할 돈</Text>
          </View>
          {paidRows.map((row) => (
            <View
              key={row.person}
              style={[styles.moneyPaidRow, theme && { borderTopColor: theme.border }]}
            >
              <View style={styles.moneyPaidNameBox}>
                <Text numberOfLines={1} style={[styles.moneyPaidName, theme && { color: theme.text }]}>{row.person}</Text>
                {/* 참가자에서 뺐는데 낸 돈이 남아 있으면 아래 정산에 이름만
                    튀어나온다. 어디서 나온 금액인지 알아볼 수 있게 표시한다. */}
                {!row.joined && (
                  <Text style={[styles.moneyPaidGuest, theme && { color: theme.muted }]}>참가자 아님</Text>
                )}
              </View>
              <Text numberOfLines={1} style={[styles.moneyPaidCell, theme && { color: theme.text }]}>{show(row.paid)}</Text>
              <Text numberOfLines={1} style={[styles.moneyPaidCell, theme && { color: theme.muted }]}>{show(row.owed)}</Text>
            </View>
          ))}
        </View>
        )}
      </MoneyBlock>
      {/* 요약 바로 아래에 둔다. 탭을 열자마자 손이 닿는 자리다. */}
      {canEdit && (
      <MoneyBlock title="빠른 추가">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickAddChips}>
          {EXPENSE_CATEGORIES.map((item) => {
            const active = quickCategory === item;
            return (
              <Chip
                key={item}
                theme={theme ?? undefined}
                label={item}
                on={active}
                onPress={() => setQuickCategory(item)}
              />
            );
          })}
        </ScrollView>
        <View style={styles.quickAddRow}>
          <TextInput
            accessibilityLabel={`${quickCategory} 금액`}
            value={quickAmount}
            onChangeText={(text) => setQuickAmount(금액_치기(text, unit.fraction))}
            keyboardType={금액_키보드(unit.fraction)}
            // 금액을 치고 키보드의 「완료」로 바로 한 건 넣는다. 기기에서는 칸만
            // 비우고 키보드를 내리지 않아(submit), 식당 앞에서 몇 건을 이어 적을 때
            // 칸을 다시 누르지 않아도 된다(웹은 `react-native-web` 이 이 값을 모르고
            // 엔터에서 칸을 놓는다. 물리 키보드라 다시 누르는 품이 들지 않는다).
            returnKeyType="done"
            submitBehavior="submit"
            onSubmitEditing={addQuickExpense}
            placeholder={`${quickCategory} 얼마 썼나요`}
            placeholderTextColor={theme?.muted ?? "#9AA1AE"}
            style={[styles.quickAddInput, theme && { backgroundColor: theme.surfaceAlt, borderColor: theme.border, color: theme.text }]}
          />
          <Pressable
            onPress={addQuickExpense}
            disabled={!quickNumber}
            accessibilityRole="button"
            accessibilityLabel={`${quickCategory} 지출 추가`}
            accessibilityState={{ disabled: !quickNumber }}
            style={({ pressed }) => [
              styles.quickAddButton,
              theme && { backgroundColor: quickNumber ? theme.primary : theme.surfaceAlt },
              pressed && quickNumber > 0 && 공용스타일.controlPressed,
            ]}
          >
            <Glyph name="plus" size={아이콘.보통} color={quickNumber ? "#FFFFFF" : theme?.muted ?? "#9AA1AE"} weight={2.6} />
            <Text style={[styles.quickAddButtonText, { color: quickNumber ? "#FFFFFF" : theme?.muted ?? "#9AA1AE" }]}>추가</Text>
          </Pressable>
        </View>
        <Text style={[styles.quickAddHint, theme && { color: theme.muted }]}>
          {draftPayerHint} · 자세히 적으려면 ＋ 지출 추가를 눌러 주세요
        </Text>
      </MoneyBlock>
      )}
      {expenses.length > 0 && (
        <MoneyBlock title="분류별 지출" meta={`${byDay.length}일`}>
          <View style={styles.moneyInsightGrid}>
            <View style={styles.moneyInsightItem}>
              <Text style={[styles.moneyInsightLabel, theme && { color: theme.muted }]}>쓴 날 하루 평균</Text>
              <Text style={[styles.moneyInsightValue, theme && { color: theme.text }]}>{show(averagePerSpendingDay)}</Text>
            </View>
            <View style={[styles.moneyInsightItem, styles.moneyInsightDivider, theme && { borderLeftColor: theme.border }]}>
              <Text style={[styles.moneyInsightLabel, theme && { color: theme.muted }]}>가장 많이 쓴 날</Text>
              <Text numberOfLines={1} style={[styles.moneyInsightValue, theme && { color: theme.text }]}>{topDay ? dayTextOf(topDay.day) : "-"}</Text>
              <Text style={[styles.moneyInsightMeta, theme && { color: theme.muted }]}>{topDay ? `${show(topDay.amount)}` : ""}</Text>
            </View>
            <View style={[styles.moneyInsightItem, styles.moneyInsightDivider, theme && { borderLeftColor: theme.border }]}>
              <Text style={[styles.moneyInsightLabel, theme && { color: theme.muted }]}>가장 큰 지출</Text>
              <Text numberOfLines={1} style={[styles.moneyInsightValue, theme && { color: theme.text }]}>{byCategory[0]?.category ?? "-"}</Text>
              <Text style={[styles.moneyInsightMeta, theme && { color: theme.muted }]}>{byCategory[0] ? `${show(byCategory[0].amount)}` : ""}</Text>
            </View>
          </View>
          <View style={styles.moneyCategoryCard}>
            {byCategory.map((row) => {
              const active = categoryFilter === row.category;
              return (
              <Pressable
                key={row.category}
                onPress={() => setCategoryFilter(active ? "전체" : row.category)}
                accessibilityRole="button"
                accessibilityLabel={`${row.category} 지출 ${show(row.amount)} 내역 보기`}
                accessibilityState={{ selected: active }}
                style={[
                  styles.moneyCategoryRow,
                  active && theme && { backgroundColor: theme.primarySoft },
                ]}
              >
                <Text style={[styles.moneyCategoryName, theme && { color: theme.text }]}>{row.category}</Text>
                {/* 막대는 전체 대비다. 1등 대비로 그리면 가장 많이 쓴 분류가
                    늘 꽉 차서 전부 쓴 것처럼 보인다. */}
                <View style={[styles.moneyBarTrack, theme && { backgroundColor: theme.surfaceAlt }]}>
                  <View
                    style={[
                      styles.moneyBarFill,
                      { width: `${settlement.total ? Math.max(2, (row.amount / settlement.total) * 100) : 0}%` },
                      theme && { backgroundColor: theme.primary },
                    ]}
                  />
                </View>
                <Text style={[styles.moneyCategoryAmount, theme && { color: theme.muted }]}>{show(row.amount)}</Text>
                <Text style={[styles.moneyCategoryPercent, theme && { color: theme.muted }]}>
                  {settlement.total ? Math.round((row.amount / settlement.total) * 100) : 0}%
                </Text>
              </Pressable>
            );})}
            <Text style={[styles.moneyCategoryHint, theme && { color: theme.muted }]}>분류를 누르면 해당 내역만 볼 수 있어요</Text>
          </View>
        </MoneyBlock>
      )}
      {/* 지출을 더하는 자리는 목록 바로 위다. 제목·건수·버튼이 모두 이 목록
          하나를 가리킨다. */}
      <View
        style={공용스타일.tabActionHeader}
        onLayout={(event) => {
          내역_자리.current = event.nativeEvent.layout.y;
        }}
      >
        <View style={공용스타일.tabActionTitleRow}>
          <Text style={[공용스타일.sectionTitle, theme && { color: theme.text }]}>
            {categoryFilter === "전체" ? "지출 내역" : `${categoryFilter} 지출`}
          </Text>
          <Text style={[공용스타일.tabActionCount, theme && { color: theme.muted, backgroundColor: theme.surfaceAlt }]}>
            {dayFilter === "전체" && categoryFilter === "전체" ? `${sorted.length}건` : `${visible.length}건`}
          </Text>
        </View>
        <View style={styles.moneyListHeadActions}>
          {categoryFilter !== "전체" && (
            <Pressable
              onPress={() => setCategoryFilter("전체")}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="전체 보기"
              style={공용스타일.sectionActionHit}
            >
              <View style={공용스타일.sectionActionRow}>
                <Text style={[공용스타일.sectionAction, theme && { color: theme.primary }]}>전체 보기</Text>
                <Glyph name="arrowRight" size={아이콘.작게} color={theme?.primary ?? "#3F4C8F"} />
              </View>
            </Pressable>
          )}
          {/* 적는 길은 떠 있는 ＋ 단추 하나다. 이 자리에도 같은 단추를 두면 한
              화면에 「지출 추가」가 둘이라, 지출이 없을 때는 빈 화면의 단추까지
              셋이 됐다. 버튼이 없는 까닭은 여기서 한 줄로 알린다. */}
          {!canEdit && (
            <Text style={[공용스타일.tabActionReadOnly, theme && { color: theme.muted }]}>보기 전용 공간이에요</Text>
          )}
        </View>
      </View>
      {/* 며칠 치가 쌓였을 때만 날짜로 거른다. 몇 건 안 되면 칩이 목록보다 크다. */}
      {expenses.length > 5 && usedDays.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.moneyDayRow}>
          {["전체", ...usedDays].map((day) => {
            const active = dayFilter === day;
            return (
              <Chip
                key={day}
                theme={theme ?? undefined}
                label={dayTextOf(day)}
                on={active}
                onPress={() => setDayFilter(day)}
              />
            );
          })}
        </ScrollView>
      )}
      <View style={styles.moneyList}>
        {shownGroups.map((group) => (
          <View key={group.day} style={styles.moneyGroup}>
            <View style={styles.moneyGroupHead}>
              <Text style={[styles.moneyGroupDay, theme && { color: theme.text }]}>{dayTextOf(group.day)}</Text>
              <Text style={[styles.moneyGroupTotal, theme && { color: theme.muted }]}>{show(group.amount)}</Text>
            </View>
            {group.items.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => openEdit(item)}
                accessibilityRole="button"
                accessibilityLabel={`${dayTextOf(group.day)} ${item.title} ${show(item.amount)}${item.excluded ? " 정산 제외" : ""} 수정`}
                style={({ pressed }) => [
                  styles.moneyRow,
                  theme && { backgroundColor: theme.surface, borderColor: theme.border },
                  // 정산에서 뺀 줄은 흐리게. 지운 게 아니라 셈에서만 빠진 것이다.
                  item.excluded && styles.moneyRowExcluded,
                  pressed && 공용스타일.packingCardPressed,
                ]}
              >
                <View style={styles.moneyRowBody}>
                  <Text numberOfLines={1} style={[styles.moneyRowTitle, theme && { color: theme.text }]}>{item.title}</Text>
                  <Text numberOfLines={1} style={[styles.moneyRowMeta, theme && { color: theme.muted }]}>
                    {/* 빠르게 적은 지출은 이름이 분류와 같다. 같은 낱말을 두 번
                        보여 줄 이유가 없다. */}
                    {item.excluded ? "정산 제외 · " : ""}
                    {item.title === item.category ? "" : `${item.category} · `}
                    {item.payer}{josa(item.payer, "이", "가")} 냄
                    {item.shares ? ` · ${shareMeta(item)}` : ""}
                    {item.receiptUri ? " · 영수증" : ""}
                  </Text>
                  <SyncMark id={item.id} />
                </View>
                <Text style={[styles.moneyRowAmount, theme && { color: theme.text }]}>{show(item.amount)}</Text>
              </Pressable>
            ))}
          </View>
        ))}
      </View>
      {visible.length === 0 && (
        <EmptyState
          title={expenses.length === 0 ? "아직 지출이 없어요" : "이날은 지출이 없어요"}
          description={
            expenses.length === 0
              ? "지출을 적어 두면 여행이 끝나고 한 번에 정산할 수 있어요."
              : "다른 날을 보거나 전체로 돌아가 보세요."
          }
          action={expenses.length === 0 ? "지출 추가" : "전체 보기"}
          onPress={expenses.length === 0 && !canEdit ? undefined : () => {
            if (expenses.length === 0) openCreate();
            else { setDayFilter("전체"); setCategoryFilter("전체"); }
          }}
        />
      )}
      {expenses.length > 0 && (
        <Pressable
          onPress={exportCsv}
          accessibilityRole="button"
          accessibilityLabel="지출 내역을 엑셀 파일로 저장"
          style={[styles.moneyExport, theme && { borderColor: theme.border, backgroundColor: theme.surface }]}
        >
          <View>
            <Text style={[styles.moneyExportTitle, theme && { color: theme.text }]}>엑셀 파일로 저장</Text>
            <Text style={[styles.moneyExportHint, theme && { color: theme.muted }]}>
              지출 {expenses.length}건과 정산을 표로 만들어 저장해요
            </Text>
          </View>
          <Glyph name="arrowRight" size={아이콘.보통} color={theme?.primary ?? "#3F4C8F"} />
        </Pressable>
      )}
      <DetailSheet
        visible={sheetOpen}
        title={editingId ? "지출 수정" : "지출 추가"}
        subtitle="항목과 금액만 적어도 저장돼요"
        submit={editingId ? "저장" : "지출 추가"}
        disabledHint={splitHint}
        submitDisabled={!formValid || Boolean(splitHint)}
        destructiveLabel={editingId ? "지출 삭제" : undefined}
        destructiveMessage={editingId ? `${draftTitle || "이 지출"} 내역을 삭제해요.` : undefined}
        hasUnsavedChanges={expenseDraftChanged}
        onClose={() => setSheetOpen(false)}
        onSubmit={saveExpense}
        onDestructive={deleteExpense}
      >
        {/* 항목 → 금액 두 칸이 잇따른다. 「다음」으로 금액 칸에 옮겨 가고, 금액에서
            「완료」면 바로 저장한다. 이 시트는 「항목과 금액만 적어도 저장」이라
            아래 고르는 칸들을 지나지 않아도 끝난다. */}
        <DetailField
          label="항목 (선택)"
          value={draftTitle}
          onChangeText={setDraftTitle}
          placeholder="예: 점심"
          returnKeyType="next"
          onSubmitEditing={() => 금액_칸.current?.focus()}
        />
        <DetailField
          label="금액"
          required
          value={draftAmount}
          onChangeText={changeAmount}
          placeholder="예: 32,000"
          keyboardType={금액_키보드(unit.fraction)}
          inputRef={금액_칸}
          returnKeyType="done"
          onSubmitEditing={() => {
            if (formValid && !splitHint) saveExpense();
          }}
        />
        {/* 0 을 여러 번 치는 대신 눌러서 더한다. 엄지로 적을 때 훨씬 빠르다. */}
        <View style={styles.amountSteps}>
          {quickSteps.map((step) => (
            <Pressable
              key={step}
              // 지금 값에서 더한다. 빠르게 두 번 누르면 앞의 결과가 아직 화면에
              // 반영되기 전이라, 밖에서 읽은 값으로 더하면 첫 번째가 사라진다.
              onPress={() => setDraftAmount((current) => amountText(parseAmount(current, unit.fraction) + step, unit.fraction))}
              accessibilityRole="button"
              accessibilityLabel={`${amountText(step, 0)} 더하기`}
              style={({ pressed }) => [
                styles.amountStep,
                theme && { borderColor: theme.border, backgroundColor: theme.surface },
                pressed && 공용스타일.controlPressed,
              ]}
            >
              <Text style={[styles.amountStepText, theme && { color: theme.primary }]}>+{amountText(step, 0)}</Text>
            </Pressable>
          ))}
          {amountNumber > 0 && (
            <Pressable
              onPress={() => setDraftAmount("")}
              accessibilityRole="button"
              accessibilityLabel="금액 비우기"
              style={({ pressed }) => [styles.amountStep, pressed && 공용스타일.controlPressed]}
            >
              <Text style={[styles.amountStepText, theme && { color: theme.muted }]}>비우기</Text>
            </Pressable>
          )}
        </View>
        <OptionField
          label="분류"
          options={EXPENSE_CATEGORIES}
          value={draftCategory}
          onChange={(value) => setDraftCategory(value as ExpenseCategory)}
        />
        <OptionField label="날짜" options={dayOptions} labelOf={dayTextOf} value={draftDay} onChange={setDraftDay} />
        <OptionField
          label="낸 사람"
          options={시트_사람.모두}
          value={draftPayer}
          onChange={setDraftPayer}
        />
        {시트_사람.빠진_사람.length > 0 && (
          <Text style={[공용스타일.settingHint, theme && { color: theme.muted }]}>
            {시트_사람.빠진_사람.join(" · ")} 님은 이번 여행 참가자가 아니에요. 그대로 두면 적어 둔 몫이 유지돼요
          </Text>
        )}
        <View style={styles.shareField}>
          <View style={공용스타일.fieldLabelRow}>
            <View style={[공용스타일.fieldLabelDot, requiredDot(false, theme)]} />
            <Text style={[공용스타일.detailFieldLabel, theme && { color: theme.text }]}>누구 몫</Text>
          </View>
          {/* 방식을 먼저 고르고 그 방식에 맞는 것만 보여 준다. 사람들이
              실제로 하는 말이 "내가 낼게", "똑같이 나눠", "쟤는 빼고", "얘는 얼마" 라서
              그 넷을 그대로 뒀다. 비율이 아니라 금액이다. 본인 부담이 없던 때는
              「금액 직접」에 자기 이름만 채워 넣어야 했다. */}
          <Segment
            theme={theme}
            label="누구 몫"
            options={[
              { value: "본인", label: "본인 부담" },
              { value: "균등", label: "똑같이" },
              { value: "일부", label: "일부만" },
              { value: "금액", label: "금액 직접" },
            ]}
            value={draftSplitMode}
            onChange={(mode) => setDraftSplitMode(mode as typeof draftSplitMode)}
            style={styles.splitModeSegment}
          />
          {draftSplitMode === "본인" && (
            <Text style={[styles.splitEven, theme && { color: theme.muted }]}>
              {draftPayer}{josa(draftPayer, "이", "가")} 혼자 부담해요. 다른 사람에게 청구하지 않아요
            </Text>
          )}
          {draftSplitMode === "균등" && (
            <Text style={[styles.splitEven, theme && { color: theme.muted }]}>
              {participants.length}명이 {amountNumber > 0 ? `${show(amountNumber / participants.length)}씩` : "똑같이"} 나눠요
            </Text>
          )}
          {draftSplitMode === "일부" && (
            <View style={styles.splitPeople}>
              {시트_사람.모두.map((person) => {
                const joined = draftPeople.includes(person);
                return (
                  <Pressable
                    key={person}
                    onPress={() => setDraftPeople((current) => (
                      current.includes(person)
                        ? current.filter((name) => name !== person)
                        : 시트_사람.모두.filter((name) => current.includes(name) || name === person)
                    ))}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: joined }}
                    accessibilityLabel={`${person} 몫`}
                    style={({ pressed }) => [
                      styles.splitPerson,
                      theme && { borderColor: joined ? theme.primary : theme.border, backgroundColor: joined ? theme.primarySoft : theme.surface },
                      pressed && 공용스타일.controlPressed,
                    ]}
                  >
                    {joined && <Glyph name="check" size={아이콘.작게} color={theme?.primary ?? "#3F4C8F"} weight={2.6} />}
                    <Text numberOfLines={1} style={[styles.splitPersonText, theme && { color: joined ? theme.primary : theme.muted }]}>
                      {person}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          {draftSplitMode === "금액" && (
            <View style={styles.splitAmountRows}>
              {/* 사람 수만큼 금액 칸이 잇따라 선다. 키보드의 「다음」으로 아래 칸에
                  커서를 옮기고, 마지막 칸은 「완료」로 키보드를 내린다. 칸 사이를
                  옮기려고 매번 화면을 눌러야 하면 네 명만 돼도 손이 여덟 번 간다. */}
              {시트_사람.모두.map((person, 차례) => {
                const 마지막 = 차례 === 시트_사람.모두.length - 1;
                return (
                <View key={person} style={styles.splitAmountRow}>
                  <Text numberOfLines={1} style={[styles.splitAmountName, theme && { color: theme.text }]}>{person}</Text>
                  <TextInput
                    ref={(칸) => {
                      몫_칸.current[차례] = 칸;
                      // 사람이 줄면 사라진 칸이 남는다. 그것을 잡고 있으면 「다음」이
                      // 화면에 없는 칸을 부른다.
                      return () => {
                        몫_칸.current[차례] = null;
                      };
                    }}
                    value={draftAmounts[person] ?? ""}
                    onChangeText={(text) => setDraftAmounts((current) => ({
                      ...current,
                      [person]: 금액_치기(text, unit.fraction),
                    }))}
                    accessibilityLabel={`${person} 몫 금액`}
                    placeholder="0"
                    placeholderTextColor={theme?.muted ?? "#9AA1AE"}
                    keyboardType={금액_키보드(unit.fraction)}
                    returnKeyType={마지막 ? "done" : "next"}
                    submitBehavior={마지막 ? undefined : "submit"}
                    onSubmitEditing={마지막 ? undefined : () => 몫_칸.current[차례 + 1]?.focus()}
                    style={[
                      styles.splitAmountInput,
                      theme && { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text },
                    ]}
                  />
                </View>
                );
              })}
              {/* 남은 돈이 0 이 아니면 저장을 막는다. 합이 안 맞으면 정산이 틀어진다. */}
              <Text
                accessibilityLiveRegion="polite"
                style={[
                  styles.splitLeft,
                  theme && { color: draftAmountLeft === 0 ? theme.muted : (theme.dark ? statusColor.danger.dark : statusColor.danger.light) },
                ]}
              >
                {남은_돈_말}
              </Text>
            </View>
          )}
        </View>
        <OptionalFormSection
          label="메모 · 영수증"
          summary={[draftMemo.trim() && "메모", draftReceipt && "영수증"].filter(Boolean).join(" · ") || undefined}
          open={extrasOpen}
          onToggle={() => setExtrasOpen((current) => !current)}
        >
          <View style={styles.receiptRow}>
            {draftReceipt ? (
              <Image source={{ uri: draftReceipt }} style={styles.receiptThumb} accessibilityLabel="추가한 영수증" />
            ) : (
              <View style={[styles.receiptThumb, styles.receiptEmpty, theme && { borderColor: theme.border }]}>
                <Text style={[styles.receiptEmptyText, theme && { color: theme.muted }]}>없음</Text>
              </View>
            )}
            <View style={styles.receiptActions}>
              <Pressable
                onPress={chooseReceipt}
                accessibilityRole="button"
                style={[styles.receiptButton, theme && { backgroundColor: theme.primarySoft }]}
              >
                <Text style={[styles.receiptButtonText, theme && { color: theme.primary }]}>
                  {draftReceipt ? "다시 고르기" : "영수증 추가"}
                </Text>
              </Pressable>
              {Boolean(draftReceipt) && (
                <Pressable onPress={() => setDraftReceipt("")} accessibilityRole="button" hitSlop={글자누름여유}>
                  <Text style={[styles.receiptRemove, theme && { color: theme.muted }]}>빼기</Text>
                </Pressable>
              )}
            </View>
          </View>
          <DetailField
            label="메모 (선택)"
            value={draftMemo}
            onChangeText={setDraftMemo}
            placeholder="예: 둘 다 학생 할인"
            returnKeyType="done"
            onSubmitEditing={() => {
              if (formValid && !splitHint) saveExpense();
            }}
          />
        </OptionalFormSection>
        {/* 지우지 않고 셈에서만 빼는 자리. 새로 적을 때는 필요 없어서 고칠 때만 보인다. */}
        {editingId !== null && (
          <>
            <OptionField
              label="정산"
              options={["정산에 넣기", "정산에서 빼기"]}
              value={draftExcluded ? "정산에서 빼기" : "정산에 넣기"}
              onChange={(value) => setDraftExcluded(value === "정산에서 빼기")}
            />
            {draftExcluded && (
              <Text style={[공용스타일.settingHint, theme && { color: theme.muted }]}>
                총 지출과 정산에서 빠지고 목록에는 흐리게 남아요
              </Text>
            )}
          </>
        )}
      </DetailSheet>
      <DetailSheet
        visible={paying !== null}
        title={paying ? `${paying.from} → ${paying.to}` : "정산"}
        subtitle="보낸 만큼 적어 두면 남은 금액이 줄어요"
        submit={payNumber >= (paying?.amount ?? 0) ? "다 보냈어요" : "이만큼 보냈어요"}
        disabledHint={payNumber <= 0 ? "금액을 입력해 주세요" : undefined}
        submitDisabled={payNumber <= 0}
        onClose={() => setPaying(null)}
        onSubmit={savePayment}
      >
        {paying && (
          <>
            <DetailField
              label="보낸 금액"
              required
              value={payAmount}
              onChangeText={(text) => setPayAmount(금액_치기(text, unit.fraction))}
              placeholder={amountText(paying.amount, unit.fraction)}
              keyboardType={금액_키보드(unit.fraction)}
              returnKeyType="done"
              onSubmitEditing={() => {
                if (payNumber > 0) savePayment();
              }}
            />
            {/* 왜 이 줄이 나왔는지. 사람이 적어서 사슬이 짧으니 여기선 말할 수
                있다. 묶은 화면은 대개 "내가 왜 저 사람한테?" 에서 막힌다. */}
            <View style={[styles.payWhy, theme && { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
              <Text style={[styles.payWhyLabel, theme && { color: theme.muted }]}>왜 이 금액인가요</Text>
              {payWhy.map((line) => (
                <Text key={line} style={[styles.payWhyLine, theme && { color: theme.text }]}>{line}</Text>
              ))}
            </View>
            <Text style={[공용스타일.settingHint, theme && { color: theme.muted }]}>
              실제로 돈을 보내는 건 은행이나 송금 앱에서 하고, 여기에는 보냈다고 적어만 둬요.
            </Text>
          </>
        )}
      </DetailSheet>
      <DetailSheet
        visible={peopleSheetOpen}
        title="이번 여행 참가자"
        subtitle="공간 멤버 중에 이번에 같이 가는 사람만 골라요"
        submit="저장"
        disabledHint={!draftParticipants.length ? "한 명은 있어야 해요" : undefined}
        submitDisabled={!draftParticipants.length}
        onClose={() => setPeopleSheetOpen(false)}
        onSubmit={savePeople}
      >
        {theme && (
          <ParticipantPicker
            theme={theme}
            members={spaceMembers}
            value={draftParticipants}
            onChange={setDraftParticipants}
            noteFor={assignedSummary}
            hint="이번 여행에 가는 사람만 골라 주세요. 정산과 준비물 담당에 쓰여요."
          />
        )}
      </DetailSheet>
      <DetailSheet
        visible={currencySheetOpen}
        title="여행 통화"
        subtitle="현지 금액으로 적고 합계에서 원으로 환산해 봐요"
        submit="저장"
        onClose={() => setCurrencySheetOpen(false)}
        onSubmit={saveCurrency}
      >
        <OptionField
          label="통화"
          options={CURRENCIES.map((item) => `${item.code} ${item.label}`)}
          value={`${draftCurrency} ${currencyOf(draftCurrency).label}`}
          onChange={(value) => {
            const picked = currencyOf(value.split(" ")[0]);
            setDraftCurrency(picked.code);
            setDraftRate(picked.code === DEFAULT_CURRENCY.code ? "" : amountText(picked.rate, 2));
          }}
        />
        {draftCurrency !== DEFAULT_CURRENCY.code && (
          <DetailField
            label={`1 ${draftCurrency} = 몇 원인가요`}
            value={draftRate}
            onChangeText={setDraftRate}
            placeholder={`예: ${amountText(currencyOf(draftCurrency).rate, 2)}`}
            // 환율은 통화와 상관없이 소수다(엔 9.3, 동 0.055).
            keyboardType="decimal-pad"
            returnKeyType="done"
            onSubmitEditing={saveCurrency}
          />
        )}
        <Text style={[공용스타일.settingHint, theme && { color: theme.muted }]}>
          {draftCurrency === DEFAULT_CURRENCY.code
            ? "원으로 적으면 환산 없이 그대로 보여요."
            : "환율은 여행 때 한 번 적어 두면 돼요. 적어 둔 금액은 바뀌지 않고 환산만 다시 계산해요."}
        </Text>
      </DetailSheet>
      <DetailSheet
        visible={budgetSheetOpen}
        title="여행 예산"
        subtitle="예산 대비 얼마나 썼는지 비용 탭에서 바로 확인해요"
        submit="저장"
        disabledHint={!budgetNumber ? "예산을 입력해 주세요" : undefined}
        submitDisabled={!budgetNumber}
        hasUnsavedChanges={budgetDraftChanged}
        destructiveLabel={budget > 0 ? "예산 삭제" : undefined}
        destructiveMessage="예산 막대가 사라져요. 적어 둔 지출은 그대로 남아요."
        onDestructive={clearBudget}
        onClose={() => setBudgetSheetOpen(false)}
        onSubmit={saveBudget}
      >
        <DetailField
          label={`전체 예산 (${unit.code})`}
          required
          value={draftBudget}
          onChangeText={(text) => setDraftBudget(금액_치기(text, unit.fraction))}
          placeholder="예: 500,000"
          keyboardType={금액_키보드(unit.fraction)}
          returnKeyType="done"
          onSubmitEditing={() => {
            if (budgetNumber) saveBudget();
          }}
        />
      </DetailSheet>
    </View>
  );
}

/**
 * 긴 목록을 몇 판에 나눠 그린다. 지금 그려 둘 줄 수를 돌려준다(`listChunks.ts`).
 *
 * 첫 판(`CHUNK_FIRST`)을 그리고 나서 다음 판을 붙인다. 붙이는 일은 `setTimeout(0)`
 * 으로 미룬다 — 한 판을 그린 뒤 손가락이 닿는 일(스크롤·누르기)을 먼저 받고 그다음에
 * 이어 그리게 하려는 것이다. 다 그리고 나면 아무 일도 하지 않는다.
 *
 * `되감기` 가 바뀌면 첫 판부터 다시 센다. 목록이 통째로 갈리는 순간에만 넘긴다.
 */
function useChunkedRows(전체: number, 되감기: string): number {
  const [그린_줄, 두기] = useState(CHUNK_FIRST);
  // 되감기는 그리는 중에 바로 한다. 효과로 미루면 새 목록의 첫 판을 그리기 전에
  // 옛 줄 수로 한 번 더 그려서, 거르는 칩을 누를 때마다 목록이 깜빡인다.
  const [본_되감기, 본것_두기] = useState(되감기);
  if (본_되감기 !== 되감기) {
    본것_두기(되감기);
    두기(CHUNK_FIRST);
  }
  useEffect(() => {
    if (그린_줄 >= 전체) return;
    const 다음_판 = setTimeout(() => 두기((지금) => nextChunk(지금, 전체)), 0);
    return () => clearTimeout(다음_판);
  }, [그린_줄, 전체]);
  return Math.min(그린_줄, 전체);
}

/**
 * 비용 탭의 한 덩이.
 *
 * 예전에는 총액·정산·예산·사람별 넷이 한 카드 안에 들어 있었고 제목이 전부
 * 12px 보조 글씨라, 어디서 어디까지가 한 이야기인지 알 수 없었다. 테마색으로
 * 칠한 것끼리도 서로 비슷해서 덩어리가 더 안 갈렸다.
 *
 * 제목을 본문 제목 크기로 키우고 덩이마다 판을 따로 깐다. 색은 그 덩이에서
 * 실제로 눌러야 하는 것 하나에만 쓴다.
 */

const styles = StyleSheet.create({
  moneyTotal: { fontSize: 32, lineHeight: 45, marginTop: 2, fontFamily: typo.data.family, letterSpacing: -0.5 },
  quickAddChips: { gap: 6, paddingVertical: 9, paddingRight: 4 },
  quickAddRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  quickAddInput: { flex: 1, borderWidth: 1, borderRadius: 모서리.행, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, fontFamily: typo.data.family },
  quickAddButton: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 모서리.행, paddingLeft: 12, paddingRight: 14, paddingVertical: 11 },
  quickAddButtonText: { fontSize: 14, fontFamily: typo.label.family },
  quickAddHint: { fontSize: 11, marginTop: 8, fontFamily: typo.caption.family },
  splitModeSegment: { marginTop: 8 },
  splitEven: { fontSize: 13, marginTop: 10, fontFamily: typo.caption.family },
  splitPeople: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  splitPerson: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 높이.버튼, borderWidth: 1, borderRadius: 모서리.원, paddingHorizontal: 14 },
  splitPersonText: { maxWidth: 86, fontSize: 13, fontFamily: typo.label.family },
  splitAmountRows: { gap: 8, marginTop: 10 },
  splitAmountRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  splitAmountName: { flex: 1, minWidth: 0, fontSize: 14, fontFamily: typo.label.family },
  // 같은 줄에 놓이는 사람 칩과 높이를 맞춰야 해서 입력 높이(52)를 쓰지 않는다.
  splitAmountInput: { width: 124, height: 높이.버튼, borderWidth: 1, borderRadius: 모서리.버튼, paddingHorizontal: 여백.가로좁게, fontSize: 14, textAlign: "right", fontFamily: typo.data.family },
  splitLeft: { fontSize: 13, textAlign: "right", fontFamily: typo.caption.family },
  shareField: { marginBottom: 20 },
  amountSteps: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: -4, marginBottom: 18 },
  amountStep: { minHeight: 높이.버튼, borderWidth: 1, borderColor: "transparent", borderRadius: 모서리.원, paddingHorizontal: 여백.가로, alignItems: "center", justifyContent: "center" },
  amountStepText: { fontSize: 14, fontFamily: typo.label.family },
  moneyCurrencyRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  // 총액보다 눈에 띄지 않는 작은 보조 설정이다. 28pt로 그리고 hitSlop으로 누르는 범위만 넓힌다.
  moneyCurrencyChip: { flexDirection: "row", alignItems: "center", gap: 4, height: 28, borderWidth: 1, borderRadius: 모서리.원, paddingHorizontal: 8 },
  moneyCurrencyLabel: { fontSize: 10, fontFamily: typo.caption.family },
  moneyCurrencyValue: { fontSize: 12, fontFamily: typo.label.family },
  moneyConverted: { flex: 1, textAlign: "right", fontSize: 12, fontFamily: typo.data.family },
  receiptRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  receiptThumb: { width: 62, height: 62, borderRadius: 모서리.행, overflow: "hidden" },
  receiptEmpty: { borderWidth: 1, borderStyle: "dashed", alignItems: "center", justifyContent: "center" },
  receiptEmptyText: { fontSize: 11, fontFamily: typo.caption.family },
  receiptActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  receiptButton: { borderRadius: 모서리.원, paddingHorizontal: 14, paddingVertical: 8 },
  receiptButtonText: { fontSize: 12, fontFamily: typo.label.family },
  receiptRemove: { fontSize: 12, fontFamily: typo.label.family },
  moneyBudgetTrack: { height: 7, borderRadius: 모서리.원, overflow: "hidden", marginTop: 7 },
  moneyBudgetFill: { height: 7, borderRadius: 모서리.원 },
  moneyBudgetFoot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  moneyBudgetStatus: { fontSize: 11, fontFamily: typo.caption.family },
  moneyBudgetPercent: { fontSize: 11, fontFamily: typo.data.family },
  moneyPaidTable: { marginTop: 16 },
  moneyPaidHead: { flexDirection: "row", alignItems: "center", paddingBottom: 6 },
  moneyPaidHeadName: { flex: 1, fontSize: 12, fontFamily: typo.caption.family },
  moneyPaidHeadCell: { width: 104, textAlign: "right", fontSize: 12, fontFamily: typo.caption.family },
  moneyPaidRow: { flexDirection: "row", alignItems: "center", borderTopWidth: 1, paddingVertical: 9 },
  moneyPaidNameBox: { flex: 1, paddingRight: 8 },
  moneyPaidName: { fontSize: 14, fontFamily: typo.label.family },
  moneyPaidGuest: { fontSize: 12, marginTop: 1, fontFamily: typo.caption.family },
  moneyPaidCell: { width: 104, textAlign: "right", fontSize: 14, fontFamily: typo.data.family },
  moneySettleBlock: { marginTop: 16, gap: 6 },
  moneySettleCopy: { flex: 1, minWidth: 0 },
  moneySettleWho: { fontSize: 12, fontFamily: typo.caption.family },
  moneySettleDone: { minHeight: 높이.칩, borderRadius: 모서리.원, paddingHorizontal: 14, alignItems: "center", justifyContent: "center" },
  moneySettleDoneText: { fontSize: 13, fontFamily: typo.label.family },
  moneyOthersHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 40 },
  moneyOthersLabel: { fontSize: 13, fontFamily: typo.caption.family },
  moneyOtherRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, minHeight: 높이.버튼, borderWidth: 1, borderRadius: 모서리.버튼, paddingHorizontal: 14 },
  moneyOtherText: { flex: 1, minWidth: 0, fontSize: 13, fontFamily: typo.label.family },
  moneyOtherAmount: { fontSize: 14, fontFamily: typo.data.family },
  moneyOtherUndo: { fontSize: 13, fontFamily: typo.label.family },
  moneySettleCopyButton: { minHeight: 높이.버튼, borderWidth: 1, borderRadius: 모서리.버튼, alignItems: "center", justifyContent: "center", marginTop: 4 },
  moneySettleCopyText: { fontSize: 13, fontFamily: typo.label.family },
  payWhy: { gap: 4, borderWidth: 1, borderRadius: 모서리.행, padding: 14, marginBottom: 16 },
  payWhyLabel: { fontSize: 12, fontFamily: typo.caption.family },
  payWhyLine: { fontSize: 13, lineHeight: 19, fontFamily: typo.label.family },
  moneySettle: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, borderRadius: 모서리.행, paddingHorizontal: 14, paddingVertical: 12 },
  moneySettleText: { flex: 1, fontSize: 14, fontFamily: typo.label.family },
  moneySettleAmount: { fontSize: 20, lineHeight: 28, fontFamily: typo.data.family },
  moneyInsightGrid: { flexDirection: "row" },
  moneyInsightItem: { flex: 1, minWidth: 0, paddingRight: 8 },
  moneyInsightDivider: { borderLeftWidth: 1, paddingLeft: 10, paddingRight: 4 },
  moneyInsightLabel: { fontSize: 11, fontFamily: typo.caption.family },
  moneyInsightValue: { fontSize: 15, marginTop: 4, fontFamily: typo.data.family },
  moneyInsightMeta: { fontSize: 12, marginTop: 1, fontFamily: typo.caption.family },
  moneyCategoryCard: { marginTop: 12 },
  moneyCategoryRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 높이.버튼, paddingHorizontal: 6, borderRadius: 모서리.버튼 },
  moneyCategoryName: { width: 44, fontSize: 12, fontFamily: typo.label.family },
  moneyBarTrack: { flex: 1, height: 6, borderRadius: 모서리.원, overflow: "hidden" },
  moneyBarFill: { height: 6, borderRadius: 모서리.원 },
  moneyCategoryAmount: { minWidth: 58, textAlign: "right", fontSize: 12, fontFamily: typo.data.family },
  moneyCategoryPercent: { minWidth: 30, textAlign: "right", fontSize: 11, fontFamily: typo.caption.family },
  moneyCategoryHint: { fontSize: 12, fontFamily: typo.caption.family, paddingHorizontal: 6, paddingTop: 4, paddingBottom: 7 },
  moneyDayRow: { gap: 6, paddingVertical: 2, paddingRight: 4 },
  moneyList: { gap: 14, marginTop: 8 },
  // 목록 제목줄 오른쪽. 분류를 걸러 둔 동안에는 「전체 보기」와 추가 버튼이
  // 나란히 선다.
  moneyListHeadActions: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 },
  moneyGroup: { gap: 6 },
  moneyGroupHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingHorizontal: 2 },
  moneyGroupDay: { fontSize: 13, fontFamily: typo.title.family },
  moneyGroupTotal: { fontSize: 12, fontFamily: typo.data.family },
  moneyRow: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 모서리.행, paddingHorizontal: 12, paddingVertical: 11 },
  moneyRowExcluded: { opacity: 불투명도.흐림 },
  moneyRowBody: { flex: 1, minWidth: 0 },
  moneyRowTitle: { fontSize: 14, fontFamily: typo.title.family },
  moneyRowMeta: { fontSize: 11, marginTop: 2, fontFamily: typo.caption.family },
  moneyRowAmount: { fontSize: 14, fontFamily: typo.data.family },
  moneyExport: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderRadius: 모서리.행, paddingHorizontal: 14, paddingVertical: 12, marginTop: 12 },
  moneyExportTitle: { fontSize: 13, fontFamily: typo.title.family },
  moneyExportHint: { fontSize: 11, marginTop: 2, fontFamily: typo.caption.family },
  // 금액이 길어져도 바로 가기가 밀려나지 않게 금액 쪽이 줄어든다.
  moneyTotalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  moneyJump: { flexDirection: "row", alignItems: "center", gap: 3, paddingVertical: 4, flexShrink: 0 },
  moneyTotalShrink: { flexShrink: 1 },
  moneyJumpText: { fontSize: 13, color: "#3F4C8F", fontFamily: typo.label.family },
});
