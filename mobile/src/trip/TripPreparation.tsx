import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Chip } from "../ui/Chip";
import { SyncMark } from "../SyncMarks";
import {
  PACKING_SHARED,
  PACKING_UNASSIGNED,
  normalizePackingOwner,
  packingOwnerOptions,
  packingTags,
  자리에_넣기,
  type PackingItem,
  type Recipe,
} from "../tripPlanning";
import {
  DUPLICATE_TITLE,
  dedupePackingNames,
  duplicateLines,
  findSimilarPacking,
  ingredientOriginLabel,
  markPackedIngredients,
  packingKey,
  packingKeySet,
} from "../packingNames";
import { importMessage, planPackingImport } from "../pastTripImport";
import { useAnnounce } from "../announce";
import { PastTripEntry, PastTripList } from "../PastTripPicker";
import { usePastPacking } from "../usePastTripRows";
import type { RosterEntry } from "../tripSync";
import { josa } from "../tripExpenses";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Text, TextInput, type 입력칸 } from "../AppText";
import { CheckBox } from "../ui/CheckBox";
import { Glyph } from "../Glyph";
import { showAlert } from "../showAlert";
import { 높이, 모서리, 불투명도, 아이콘, 여백, 누름여유, 글자누름여유 } from "../theme/controls";
import { typo } from "../theme/typography";
import { 공용스타일 } from "./styles";
import {
  DetailEditableContext,
  DetailFeedbackContext,
  DetailField,
  DetailSheet,
  DetailThemeContext,
  EmptyState,
  OptionField,
  OptionalFormSection,
  TabActionHeader,
  newPlaceId,
  readClipboard,
  useDraftChanged,
  붙여넣기_한도,
} from "./parts";

/** 여행 상세의 「준비」 탭. 챙길 것과 메모를 사람별로 본다. */

export function TripPreparation({
  done,
  toggle,
  participants,
  items,
  setItems,
  recipes,
  readyIngredientIds,
  onMarkIngredientReady,
  openCookingPickerOnMount,
  onCookingPickerOpened,
  spaceId,
  tripId,
  roster,
}: {
  done: string[];
  toggle: (item: string) => void;
  /** 이번 여행에 가는 사람. 담당으로 고를 수 있는 이름이 여기서 온다. */
  participants: string[];
  items: PackingItem[];
  setItems: React.Dispatch<React.SetStateAction<PackingItem[]>>;
  recipes: Recipe[];
  /** 요리 탭에서 `준비 완료` 로 표시한 재료 id. */
  readyIngredientIds: string[];
  onMarkIngredientReady: (ingredientId: string) => void;
  openCookingPickerOnMount?: boolean;
  onCookingPickerOpened?: () => void;
  /** 지난 여행에서 가져오기에 쓴다. 서버에 올라간 여행일 때만 온다. */
  spaceId?: string;
  tripId?: string;
  roster: RosterEntry[];
}) {
  const theme = useContext(DetailThemeContext);
  const notify = useContext(DetailFeedbackContext);
  const canEdit = useContext(DetailEditableContext);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [names, setNames] = useState("");
  const [quantity, setQuantity] = useState("");
  const [owner, setOwner] = useState(PACKING_UNASSIGNED);
  const [tagText, setTagText] = useState("");
  // 「수량 · 태그 더 적기」가 펼쳐져 있는지. 고칠 때 값이 있으면 켜서 연다.
  const [packingExtrasOpen, setPackingExtrasOpen] = useState(false);
  // 「준비물 추가」 시트 안에서 내용을 갈아 끼우는 단계. iOS 는 창 위에 창을 못 쌓아서
  // 지난 여행 목록을 새 창이 아니라 이 시트 안에 보인다.
  const [packingSheetStep, setPackingSheetStep] = useState<"직접" | "지난 여행">("직접");
  const [pastPicked, setPastPicked] = useState<string[]>([]);
  const pastPacking = usePastPacking({
    spaceId,
    tripId,
    roster,
    active: adding && packingSheetStep === "지난 여행",
    existingNames: items.map((item) => item.name),
  });
  const [filter, setFilter] = useState<"전체" | "남은 준비" | "완료">("남은 준비");
  const [ownerFilter, setOwnerFilter] = useState("전체");
  const [tagFilter, setTagFilter] = useState("전체 태그");
  const [tagPicker, setTagPicker] = useState(false);
  // 사람이 둘 이상이면 담당 칩을 펴 둔다. 누가 뭘 챙기는지가 이 탭의 절반인데
  // 접힌 버튼 뒤에 있으면 그런 게 있는 줄도 모른다.
  const [packingFiltersOpen, setPackingFiltersOpen] = useState(participants.length > 1);
  const [assigningItem, setAssigningItem] = useState<PackingItem | null>(null);
  const [importing, setImporting] = useState(false);
  const [importText, setImportText] = useState("");
  // 교체는 저장해 둔 것을 통째로 지운다. 되돌릴 수 없으니 기본은 추가로 둔다.
  const [importMode, setImportMode] = useState<"교체" | "추가">("추가");
  const packingDraftChanged = useDraftChanged(adding, JSON.stringify([names, quantity, owner, tagText, pastPicked]));
  const packingImportChanged = useDraftChanged(importing, JSON.stringify([importText, importMode]));
  const [cookingPicker, setCookingPicker] = useState(Boolean(openCookingPickerOnMount));
  const [selectedCookingItems, setSelectedCookingItems] = useState<string[]>([]);
  /**
   * 재료 불러오기 시트가 줄마다 보는 답(2026-09-23 검토 #60).
   *
   * 줄마다 `findSimilarPacking` 으로 준비물 전체를 훑었다. 재료 500개 × 준비물 300개면
   * 체크 하나 누를 때마다 15만 번이다. 재료와 준비물이 그대로인 동안은 지도를 다시
   * 만들지 않고, 줄은 자기 id 로 답만 꺼내 본다.
   */
  const packedIngredients = useMemo(
    () => markPackedIngredients(recipes, packingKeySet(items.map((item) => item.name))),
    [items, recipes],
  );
  const [showCompleted, setShowCompleted] = useState(false);
  // 처음에는 분류와 남은 개수만 보여준다. 30개 항목을 한꺼번에 펼치면 사용자가
  // 무엇부터 봐야 하는지 알기 어렵고 다른 분류가 화면 아래로 밀린다.
  const [collapsedPackingTags, setCollapsedPackingTags] = useState<string[]>(() =>
    Array.from(new Set(items.map((item) => packingTags(item)[0] || "태그 없음"))),
  );
  useEffect(() => {
    if (openCookingPickerOnMount) {
      // 요리 탭에서 전달된 한 번성 열기 요청을 로컬 시트 상태에 반영한다.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCookingPicker(true);
      onCookingPickerOpened?.();
    }
  }, [onCookingPickerOpened, openCookingPickerOnMount]);
  const completedCount = items.filter((item) => done.includes(item.id)).length;
  const selectedCookingUniqueCount = new Set(
    recipes.flatMap((recipe) => recipe.ingredients)
      .filter((ingredient) => selectedCookingItems.includes(ingredient.id))
      .map((ingredient) => ingredient.name.trim().toLowerCase()),
  ).size;
  const percentage = items.length
    ? Math.round((completedCount / items.length) * 100)
    : 0;
  const visibleItems = items.filter((item) => {
    const matchesFilter =
      filter === "전체" ||
      (filter === "남은 준비" && !done.includes(item.id)) ||
      (filter === "완료" && done.includes(item.id));
    const matchesOwner = ownerFilter === "전체" || item.owner === ownerFilter;
    const matchesTag =
      tagFilter === "전체 태그" || packingTags(item).includes(tagFilter);
    return matchesFilter && matchesOwner && matchesTag;
  });
  // 참가자가 바뀌어도 그 사람 이름으로 적어 둔 준비물이 걸러지지 않으면 안 되니,
  // 목록에 실제로 적힌 담당을 뒤에 붙인다.
  const ownerSections = useMemo(() => {
    const known = packingOwnerOptions(participants);
    const extra = Array.from(new Set(items.map((item) => item.owner)))
      .filter((owner) => owner && !known.includes(owner));
    return [...known, ...extra];
  }, [items, participants]);
  const managementTags = useMemo(
    () => [
      "전체 태그",
      ...Array.from(new Set(items.flatMap((item) => packingTags(item)))),
    ],
    [items],
  );
  useEffect(() => {
    if (tagFilter !== "전체 태그" && !managementTags.includes(tagFilter)) {
      // 목록 교체로 사라진 태그를 계속 선택한 상태로 두지 않는다.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTagFilter("전체 태그");
    }
  }, [managementTags, tagFilter]);
  const draftPackingTags = tagText
    .split(/[,#\n]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .filter((tag, index, tags) => tags.indexOf(tag) === index);
  const parsedPackingNames = dedupePackingNames(
    names.split(/[\n,]/).map((name) => name.trim()).filter(Boolean),
  );
  // 고칠 때는 첫 줄만 쓴다. 담당은 보지 않는다 — 둘이 나눠 챙기다 겹치는 게 알리고 싶은 일이다.
  const packingHits = findSimilarPacking(
    editingId ? parsedPackingNames.slice(0, 1) : parsedPackingNames,
    items,
    editingId ?? undefined,
  );
  const newPackingCount = editingId ? Number(Boolean(parsedPackingNames[0])) : parsedPackingNames.length;
  /**
   * 이름을 적는 동안 갑자기 뜨는 중복 안내(2026-09-23 검토 #29).
   *
   * 줄에 붙여 둔 `accessibilityLiveRegion` 은 안드로이드만 듣는다. iOS VoiceOver 는
   * live region 을 몰라, 손가락이 그 자리에 닿기 전에는 「이미 있어요」를 못 듣는다.
   */
  const packingDuplicateNotice = adding && packingHits.length
    ? `이미 있어요 · ${duplicateLines(packingHits).join(", ")}`
    : "";
  useAnnounce(packingDuplicateNotice);
  /**
   * 「다음」 키로 옮겨 갈 칸(2026-09-23 검토 #17).
   *
   * 준비물 이름 칸은 새로 적을 때 여러 줄이라(한 번에 여러 개를 적는다) 「다음」을 붙이지
   * 않는다. 고칠 때만 한 줄이 되고, 그때는 이름 하나로 끝이라 바로 저장으로 간다.
   */
  const packingTagRef = useRef<입력칸 | null>(null);
  const availableTags = managementTags.slice(1);
  const quickTags = Array.from(
    new Set([
      ...(tagFilter !== "전체 태그" ? [tagFilter] : []),
      ...availableTags,
    ]),
  ).slice(0, 4);
  const groupByPrimaryTag = (source: PackingItem[]) =>
    Array.from(
      source.reduce((groups, item) => {
        const tag = packingTags(item)[0] || "태그 없음";
        groups.set(tag, [...(groups.get(tag) ?? []), item]);
        return groups;
      }, new Map<string, PackingItem[]>()),
    );
  const remainingGroups = groupByPrimaryTag(
    visibleItems.filter((item) => !done.includes(item.id)),
  );
  const completedGroups = groupByPrimaryTag(
    visibleItems.filter((item) => done.includes(item.id)),
  );
  const countForOwner = (target: string) =>
    items.filter((item) => {
      const matchesOwner = target === "전체" || item.owner === target;
      const matchesStatus = filter === "전체" || (filter === "완료" ? done.includes(item.id) : !done.includes(item.id));
      const matchesTag = tagFilter === "전체 태그" || packingTags(item).includes(tagFilter);
      return matchesOwner && matchesStatus && matchesTag;
    }).length;
  const openPackingCreate = () => {
    setEditingId(null);
    setNames("");
    setQuantity("");
    setOwner(PACKING_UNASSIGNED);
    setTagText("");
    setAdding(true);
  };
  const applyPackingForm = () => {
    if (editingId) {
      const nextName = parsedPackingNames[0];
      setItems((current) => current.map((item) => item.id === editingId
        ? { ...item, name: nextName, quantity: quantity.trim(), owner, tags: draftPackingTags }
        : item));
    } else {
      setItems((current) => [
        ...current,
        ...parsedPackingNames.map((name) => ({ id: newPlaceId(), name, quantity: quantity.trim(), owner, tags: draftPackingTags })),
      ]);
    }
    setNames("");
    setQuantity("");
    setTagText("");
    setEditingId(null);
    setAdding(false);
    notify(editingId ? "준비물 정보를 수정했어요" : `준비물 ${parsedPackingNames.length}개를 추가했어요`);
  };
  const submit = () => {
    if (!newPackingCount) return;
    // 이미 있는 것과 비슷하면 알리기만 한다. 같은 이름이라도 둘 다 챙겨야 할 때가 있다.
    if (packingHits.length) {
      showAlert(editingId ? "이미 있어요. 그래도 저장할까요?" : DUPLICATE_TITLE, duplicateLines(packingHits).join("\n"), [
        { text: "취소", style: "cancel" },
        { text: editingId ? "그래도 저장" : "그래도 추가", onPress: applyPackingForm },
      ]);
      return;
    }
    applyPackingForm();
  };
  const assignOwner = (item: PackingItem, nextOwner: string) => {
    const move = () => {
      setItems((current) =>
        current.map((value) =>
          value.id === item.id ? { ...value, owner: nextOwner } : value,
        ),
      );
      setAssigningItem(null);
      notify(`${item.name} 담당을 바꿨어요 · ${nextOwner}`);
    };
    const hits = findSimilarPacking(
      [item.name],
      items.filter((value) => value.owner === nextOwner),
      item.id,
    );
    if (hits.length) {
      showAlert("이미 있어요. 그래도 옮길까요?", duplicateLines(hits).join("\n"), [
        { text: "취소", style: "cancel" },
        { text: "그래도 옮기기", onPress: move },
      ]);
      return;
    }
    move();
  };
  /**
   * 재료에서 가져온 준비물이면 그 재료를 찾는다.
   *
   * 요리나 재료를 지우면 찾지 못한다. 그때도 준비물은 그대로 두고 연결만 잊는다
   * (서버도 `sourceIngredientId` 만 비운다). 재료 이름을 바꾸면 id 로 찾으므로
   * 연결은 그대로고, 바뀐 이름이 바로 보인다.
   */
  const findSource = (item: PackingItem) => {
    const id = item.sourceIngredientId;
    if (!id) return undefined;
    const recipe = recipes.find((value) => value.ingredients.some((ingredient) => ingredient.id === id));
    const ingredient = recipe?.ingredients.find((value) => value.id === id);
    return recipe && ingredient ? { recipe, ingredient } : undefined;
  };
  const packingOrigin = (item: PackingItem) => {
    const source = findSource(item);
    return source ? ingredientOriginLabel(source.recipe.name, source.ingredient.name, item.name) : "";
  };
  const complete = (item: PackingItem) => {
    const checking = !done.includes(item.id);
    toggle(item.id);
    // 재료에서 가져온 준비물을 챙겼으면 재료 쪽도 준비 완료로 할지 묻는다. 여러 요리의
    // 같은 재료를 하나로 가져온 경우가 있어 스스로 바꾸지 않는다.
    const source = findSource(item);
    if (!checking || !source || readyIngredientIds.includes(source.ingredient.id)) return;
    const { recipe, ingredient } = source;
    showAlert("요리 재료에서도 준비 완료로 표시할까요?", `${recipe.name} · ${ingredient.name}`, [
      { text: "취소", style: "cancel" },
      {
        text: "표시하기",
        onPress: () => {
          onMarkIngredientReady(ingredient.id);
          notify(`${ingredient.name}${josa(ingredient.name, "을", "를")} 요리 재료에서도 준비 완료로 표시했어요`);
        },
      },
    ]);
  };
  const openPackingEdit = (item: PackingItem) => {
    setAssigningItem(null);
    setEditingId(item.id);
    setNames(item.name);
    setQuantity(item.quantity);
    setOwner(item.owner);
    setTagText(packingTags(item).join(", "));
    setPackingExtrasOpen(Boolean(item.quantity.trim() || packingTags(item).length));
    setAdding(true);
  };
  const closePackingForm = () => {
    setAdding(false);
    setEditingId(null);
    setPackingSheetStep("직접");
    setPastPicked([]);
    setNames("");
    setQuantity("");
    setTagText("");
    setOwner(PACKING_UNASSIGNED);
    setPackingExtrasOpen(false);
  };
  // 체크해 둔 지난 여행 준비물을 한꺼번에 복사한다. 완료 표시는 목록 밖에 있어 저절로
  // 풀리고, 담당은 이번 여행 참가자만 남는다(`planPackingImport`).
  const takePastPacking = () => {
    const rows = pastPacking.groups.flatMap((group) => group.rows).filter((row) => pastPicked.includes(row.key)).map((row) => row.row);
    const plan = planPackingImport(rows, items.map((item) => item.name), participants, newPlaceId);
    if (plan.taken.length) setItems((current) => [...current, ...plan.taken]);
    closePackingForm();
    notify(importMessage("준비물", plan));
  };
  const togglePastPacking = (key: string) =>
    setPastPicked((current) => (current.includes(key) ? current.filter((value) => value !== key) : [...current, key]));
  const toggleAllPastPacking = () => {
    const pickable = pastPacking.groups.flatMap((group) => group.rows).filter((row) => !row.mine).map((row) => row.key);
    setPastPicked((current) => (pickable.every((key) => current.includes(key)) ? [] : pickable));
  };
  const deletePacking = () => {
    const 자리 = items.findIndex((item) => item.id === editingId);
    if (자리 < 0) return;
    const target = items[자리];
    setItems((current) => current.filter((item) => item.id !== target.id));
    closePackingForm();
    notify("준비물을 삭제했어요", {
      label: "되돌리기",
      onPress: () => {
        setItems((current) => 자리에_넣기(current, target, 자리));
        notify("준비물을 되돌렸어요");
      },
    });
  };
  const copyPacking = async () => {
    await Clipboard.setStringAsync(
      items
        .map(
          (item) =>
            `${item.name} | ${item.quantity} | ${item.owner} | ${packingTags(
              item,
            )
              .map((tag) => `#${tag}`)
              .join(" ")}`,
        )
        .join("\n"),
    );
    notify("준비물 목록을 복사했어요");
  };
  const openImport = async () => {
    const copied = await readClipboard();
    setImportText(copied);
    setImporting(true);
    if (!copied) notify("복사한 내용을 읽지 못했어요. 칸에 직접 붙여넣어 주세요");
  };
  const importPacking = () => {
    // 참가자 이름은 그대로 받고, 옛 목록에서 복사해 온 자리 이름만 옮긴다.
    const readOwner = (raw: string) => {
      const moved = normalizePackingOwner(raw, participants);
      return ownerSections.includes(moved) ? moved : PACKING_UNASSIGNED;
    };
    const parsed = importText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, quantity = "", rawOwner = "미정", rawTags = ""] = line
          .split("|")
          .map((value) => value.trim());
        return {
          id: newPlaceId(),
          name,
          quantity,
          owner: readOwner(rawOwner),
          tags: rawTags.split(/[# ,]+/).filter(Boolean),
        };
      })
      .filter((item, index, values) =>
        Boolean(item.name) &&
        values.findIndex((value) => value.owner === item.owner && value.name.toLowerCase() === item.name.toLowerCase()) === index,
      );
    if (!parsed.length) return;
    const existing = new Set(items.map((item) => `${item.owner}:${item.name.toLowerCase()}`));
    const additions = importMode === "교체"
      ? parsed
      : parsed.filter((item) => !existing.has(`${item.owner}:${item.name.toLowerCase()}`));
    setItems((current) => importMode === "교체" ? additions : [...current, ...additions]);
    setImporting(false);
    notify(additions.length ? `준비물 ${additions.length}개를 반영했어요` : "이미 있는 준비물뿐이에요");
  };
  const toggleCookingItem = (id: string) =>
    setSelectedCookingItems((current) =>
      current.includes(id)
        ? current.filter((itemId) => itemId !== id)
        : [...current, id],
    );
  const importCookingItems = () => {
    const selected = recipes.flatMap((recipe) =>
      recipe.ingredients
        .filter((ingredient) => selectedCookingItems.includes(ingredient.id))
        .map((ingredient) => ({ recipe, ingredient })),
    );
    // 여러 요리에 같은 재료가 있으면 준비물은 하나만 만든다.
    const uniqueSelected = selected.filter(({ ingredient }, index, values) =>
      values.findIndex(({ ingredient: value }) => packingKey(value.name) === packingKey(ingredient.name)) === index,
    );
    if (!uniqueSelected.length) {
      setCookingPicker(false);
      return;
    }
    const take = () => {
      setItems((current) => [
        ...current,
        ...uniqueSelected.map(({ recipe, ingredient }) => ({
          id: newPlaceId(),
          name: ingredient.name,
          quantity: ingredient.quantity,
          // 재료의 담당도 같은 참가자 목록을 쓰므로 이름이 맞으면 그대로 가져온다.
          // 현지에서 산다는 표시는 담당이 아니라 태그라 여기서는 미정이 된다.
          owner: participants.includes(ingredient.owner) ? ingredient.owner : PACKING_UNASSIGNED,
          tags: Array.from(new Set(["요리 재료", recipe.name, ingredient.group, ...(ingredient.owner === "구매" ? ["구매"] : [])])),
          // 어느 재료에서 왔는지 남긴다. 줄에 출처를 보이고, 체크할 때 재료 쪽도 표시할지 묻는 데 쓴다.
          sourceIngredientId: ingredient.id,
        })),
      ]);
      setSelectedCookingItems([]);
      setCookingPicker(false);
      notify(`요리 재료 ${uniqueSelected.length}개를 준비에 추가했어요`);
    };
    // 이미 챙기기로 한 것과 비슷하면 알리기만 한다. 요리 몫으로 더 필요할 수 있다.
    const hits = findSimilarPacking(uniqueSelected.map(({ ingredient }) => ingredient.name), items);
    if (hits.length) {
      showAlert(DUPLICATE_TITLE, duplicateLines(hits).join("\n"), [
        { text: "취소", style: "cancel" },
        { text: "그래도 추가", onPress: take },
      ]);
      return;
    }
    take();
  };
  const renderPackingRow = (item: PackingItem, index: number) => {
    const completed = done.includes(item.id);
    // 요리 재료에서 가져온 줄이면 어느 요리에서 왔는지 옅게 붙인다. 재료를 지우면
    // 찾을 수 없으니 표시만 사라지고 준비물은 그대로 남는다.
    const origin = packingOrigin(item);
    return (
      // 줄 전체가 체크박스였다. 요리 탭은 같은 모양인데 줄이 「수정」이라, 준비물
      // 이름을 보려고 누르면 완료 처리되고 재료에서 온 줄이면 확인창까지 떴다
      // (2026-09-23). 요리 탭 쪽으로 맞춘다: 줄은 수정, 왼쪽 원이 체크다.
      <Pressable
        key={item.id}
        onPress={() => openPackingEdit(item)}
        disabled={!canEdit}
        accessibilityRole="button"
        accessibilityLabel={`${item.name}${origin ? ` ${origin}` : ""} 수정`}
        style={({ pressed }) => [
          styles.packingV2Row,
          index > 0 && styles.packingV2RowBorder,
          index > 0 && theme && { borderTopColor: theme.border },
          pressed && 공용스타일.packingCardPressed,
        ]}
      >
        <Pressable
          onPress={(event) => {
            event.stopPropagation();
            complete(item);
          }}
          disabled={!canEdit}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: completed }}
          accessibilityLabel={`${item.name} ${completed ? "완료 해제" : "완료"}`}
          // 원은 22px 안팎이라 손가락에 모자란다. 둘레로 누름 여유를 준다.
          hitSlop={11}
          style={공용스타일.체크칸}
        >
          <CheckBox theme={theme ?? undefined} on={completed} 모양="원" />
        </Pressable>
        <View style={styles.packingV2Body}>
          <View style={styles.packingV2TitleRow}>
            <Text
              numberOfLines={1}
              style={[
                styles.checkName,
                styles.packingV2Name,
                theme && { color: completed ? theme.muted : theme.text },
                completed && styles.checkNameDone,
              ]}
            >
              {item.name}
            </Text>
            {item.quantity ? (
              <Text style={[styles.packingV2Quantity, theme && { color: theme.muted }]}>{item.quantity}</Text>
            ) : null}
          </View>
          {origin ? (
            <Text numberOfLines={1} style={[styles.packingV2Origin, theme && { color: theme.muted }]}>
              {origin}
            </Text>
          ) : null}
          {packingTags(item).slice(1).length > 0 && (
            <Text numberOfLines={1} style={[styles.packingV2SubTags, theme && { color: theme.muted }]}>
              {packingTags(item).slice(1).map((tag) => `# ${tag}`).join("  ")}
            </Text>
          )}
          <SyncMark id={item.id} />
        </View>
        <Pressable
          onPress={(event) => {
            event.stopPropagation();
            setAssigningItem(item);
          }}
          disabled={!canEdit}
          hitSlop={글자누름여유}
          accessibilityRole="button"
          accessibilityLabel={`${item.name} 담당 및 정보 관리`}
          style={[styles.packingV2Assignee, theme && { backgroundColor: theme.primarySoft }]}
        >
          <Text numberOfLines={1} style={[styles.packingOwnerChangeText, theme && { color: theme.primary }]}>
            {item.owner}
          </Text>
        </Pressable>
      </Pressable>
    );
  };

  return (
    <View>
      <TabActionHeader
        label="준비물"
        count={`${items.length}개`}
        action="준비물 추가"
        onPress={openPackingCreate}
      />
      <View
        style={[
          styles.packingJourney,
          theme && { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        <View style={[styles.packingJourneyStamp, theme && { backgroundColor: theme.primarySoft }]}>
          <View style={[styles.packingSuitcaseHandle, theme && { borderColor: theme.primary }]} />
          <View style={[styles.packingSuitcaseBody, theme && { backgroundColor: theme.primary, borderColor: theme.primary }]}>
            <View style={styles.packingSuitcaseStrap} />
            <View style={styles.packingSuitcaseSticker}>
              <Text style={[styles.packingSuitcaseStickerText, theme && { color: theme.primary }]}>D</Text>
            </View>
          </View>
          <View style={styles.packingSuitcaseFeet}>
            <View style={[styles.packingSuitcaseFoot, theme && { backgroundColor: theme.primary }]} />
            <View style={[styles.packingSuitcaseFoot, theme && { backgroundColor: theme.primary }]} />
          </View>
        </View>
        <View style={styles.packingJourneyBody}>
          <View style={styles.packingJourneyCopy}>
            <View>
              <Text style={[styles.packingJourneyEyebrow, theme && { color: theme.primary }]}>출발 준비</Text>
              <Text style={[styles.packingJourneyTitle, theme && { color: theme.text }]}>
                {percentage === 100
                  ? "짐 꾸리기 완료"
                  : percentage >= 60
                    ? "거의 다 챙겼어요"
                    : percentage > 0
                      ? "하나씩 챙기는 중"
                      : "이제 짐을 꾸려 볼까요?"}
              </Text>
            </View>
          </View>
          <View style={styles.packingJourneyProgressRow}>
            <View style={[styles.packingJourneyTrack, theme && { backgroundColor: theme.primarySoft }]}>
              <View style={[styles.packingJourneyFill, { width: `${percentage}%` }, theme && { backgroundColor: theme.primary }]} />
            </View>
            <Text style={[styles.packingJourneyPercent, theme && { color: theme.primary }]}>{percentage}%</Text>
          </View>
        </View>
      </View>
      {/* 다섯 개 이하면 한눈에 다 보인다. 거르는 도구가 목록보다 커지지
          않도록 접어 둔다. 이미 거르고 있으면 끄는 길이 필요하니 남긴다. */}
      {(items.length > 5 || filter !== "전체" || ownerFilter !== "전체" || tagFilter !== "전체 태그") && (
      <View
        style={[
          styles.packingV2Controls,
          theme && { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        <View style={styles.packingV2StatusRow}>
          <View style={styles.packingV2StatusTabs}>
            {(["전체", "남은 준비", "완료"] as const).map((item) => {
              const active = filter === item;
              return (
                <Chip
                  key={item}
                  theme={theme ?? undefined}
                  label={item}
                  on={active}
                  onPress={() => setFilter(item)}
                />
              );
            })}
          </View>
          <Chip
            theme={theme ?? undefined}
            label={ownerFilter === "전체" && tagFilter === "전체 태그" ? "필터" : "필터 적용 중"}
            trailing={packingFiltersOpen ? "chevronUp" : "chevronDown"}
            on={packingFiltersOpen}
            onPress={() => setPackingFiltersOpen((value) => !value)}
            accessibilityLabel="담당과 태그 필터"
          />
        </View>
        {packingFiltersOpen && (
        <>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.packingV2Owners}>
          {["전체", ...ownerSections].map((ownerName) => {
            const active = ownerFilter === ownerName;
            const matchingCount = countForOwner(ownerName);
            return (
              <Chip
                key={ownerName}
                theme={theme ?? undefined}
                label={ownerName}
                count={matchingCount}
                on={active}
                onPress={() => setOwnerFilter(ownerName)}
              />
            );
          })}
        </ScrollView>
        <Pressable
          onPress={() => setTagPicker(true)}
          accessibilityRole="button"
          accessibilityLabel="준비물 태그 선택"
          style={[styles.packingV2TagChoice, theme && { backgroundColor: theme.surfaceAlt }]}
        >
          <Text style={[styles.packingV2TagChoiceLabel, theme && { color: theme.muted }]}>태그</Text>
          <Text style={[styles.packingV2TagChoiceValue, theme && { color: theme.text }]}>
            {tagFilter === "전체 태그" ? `전체 ${availableTags.length}개` : `# ${tagFilter}`}
          </Text>
          <Glyph name="chevronRight" size={아이콘.작게} color={theme?.muted ?? "#646C7A"} />
        </Pressable>
        </>
        )}
      </View>
      )}
      <View style={[styles.packingManageHead, styles.packingV2Hidden]}>
        <View>
          <Text
            style={[styles.packingManageTitle, theme && { color: theme.text }]}
          >
            담당별 준비물
          </Text>
          <Text
            style={[styles.packingManageHint, theme && { color: theme.muted }]}
          >
            이름을 누르면 해당 준비물만 보여요
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => setOwnerFilter("전체")}
          style={[
            styles.packingShowAll,
            theme && {
              backgroundColor:
                ownerFilter === "전체" ? theme.primarySoft : theme.surface,
              borderColor: theme.border,
            },
          ]}
        >
          <Text
            style={[
              styles.packingShowAllText,
              theme && {
                color: ownerFilter === "전체" ? theme.primary : theme.muted,
              },
            ]}
          >
            전체 {items.length}
          </Text>
        </Pressable>
      </View>
      <View
        style={[
          styles.ownerStats,
          styles.packingV2Hidden,
          theme && {
            backgroundColor: theme.surface,
            borderColor: theme.border,
          },
        ]}
      >
        {ownerSections.map((ownerName, index) => {
          const remaining = items.filter(
            (item) => item.owner === ownerName && !done.includes(item.id),
          ).length;
          const active = ownerFilter === ownerName;
          return (
            <View key={ownerName} style={styles.ownerStatSlot}>
              {index > 0 && (
                <View
                  style={[
                    styles.ownerDivider,
                    theme && { backgroundColor: theme.border },
                  ]}
                />
              )}
              <Pressable
                accessibilityRole="button"
                onPress={() => setOwnerFilter(active ? "전체" : ownerName)}
                style={[
                  styles.ownerStat,
                  active && styles.ownerStatActive,
                  active && theme && { backgroundColor: theme.primarySoft },
                ]}
              >
                <Text
                  style={[
                    styles.ownerStatName,
                    theme && { color: active ? theme.primary : theme.text },
                  ]}
                >
                  {ownerName}
                </Text>
                <Text
                  style={[
                    styles.ownerStatCount,
                    ownerName === "미정" && styles.unassignedText,
                    theme && ownerName !== "미정" && { color: theme.muted },
                  ]}
                >
                  {remaining}개 남음
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>
      <View
        style={[
          styles.packingFilterBoard,
          styles.packingV2Hidden,
          theme && {
            backgroundColor: theme.surface,
            borderColor: theme.border,
          },
        ]}
      >
        <View style={styles.packingFilterLine}>
          <Text
            style={[styles.packingFilterLabel, theme && { color: theme.muted }]}
          >
            태그
          </Text>
          <ScrollView
            style={styles.packingFilterScroll}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.packingFilters}
          >
            {["전체 태그", ...quickTags.slice(0, 2)].map((tag) => {
              const active = tagFilter === tag;
              return (
                <Chip
                  key={tag}
                  theme={theme ?? undefined}
                  label={tag === "전체 태그" ? "모든 태그" : `# ${tag}`}
                  on={active}
                  onPress={() => setTagFilter(tag)}
                />
              );
            })}
          </ScrollView>
          {availableTags.length > 2 && (
            <Chip
              theme={theme ?? undefined}
              label="전체"
              count={availableTags.length}
              on={false}
              onPress={() => setTagPicker(true)}
            />
          )}
        </View>
        <View
          style={[
            styles.packingFilterRule,
            theme && { backgroundColor: theme.border },
          ]}
        />
        <View style={styles.packingFilterLine}>
          <Text
            style={[styles.packingFilterLabel, theme && { color: theme.muted }]}
          >
            상태
          </Text>
          <View style={styles.packingFilters}>
            {(["전체", "남은 준비", "완료"] as const).map((item) => {
              const active = filter === item;
              return (
                <Pressable
                  accessibilityRole="button"
                  key={item}
                  onPress={() => setFilter(item)}
                  style={[
                    styles.packingFilterChip,
                    active && theme && { backgroundColor: theme.primarySoft },
                  ]}
                >
                  <Text
                    style={[
                      styles.packingFilterChipText,
                      theme && { color: active ? theme.primary : theme.muted },
                    ]}
                  >
                    {item}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
      <View style={styles.packingList}>
        {remainingGroups.map(([sourceTag, taggedItems], groupIndex) => {
          const collapsed = collapsedPackingTags.includes(sourceTag);
          const groupAccent = theme
            ? [theme.primary, theme.secondary, theme.accent][groupIndex % 3]
            : ["#FF6B63", "#55BFB4", "#8B7CF6"][groupIndex % 3];
          // 두 숫자가 같은 기준을 봐야 한다. 하나는 전체를, 하나는 걸러진 것을
          // 세면 "1/5 완료 · 1개 남음" 처럼 서로 안 맞는 말이 나란히 놓인다.
          const allInGroup = visibleItems.filter(
            (item) => (packingTags(item)[0] || "태그 없음") === sourceTag,
          );
          const doneInGroup = allInGroup.filter((item) =>
            done.includes(item.id),
          ).length;
          return (
            <View
              key={sourceTag}
              style={[
                styles.packingV2Group,
                theme && {
                  backgroundColor: theme.surface,
                  borderColor: `${groupAccent}55`,
                },
              ]}
            >
              <Pressable
                onPress={() =>
                  setCollapsedPackingTags((current) =>
                    current.includes(sourceTag)
                      ? current.filter((tag) => tag !== sourceTag)
                      : [...current, sourceTag],
                  )
                }
                accessibilityRole="button"
                accessibilityState={{ expanded: !collapsed }}
                accessibilityLabel={`${sourceTag} 준비물 ${collapsed ? "펼치기" : "접기"}`}
                style={({ pressed }) => [
                  styles.packingV2GroupHead,
                  { backgroundColor: `${groupAccent}0D` },
                  pressed && styles.packingV2GroupHeadPressed,
                ]}
              >
                <View>
                  <View style={styles.packingV2GroupTitleRow}>
                    <View style={[styles.packingV2GroupSticker, { backgroundColor: `${groupAccent}20` }]}>
                      <Text style={[styles.packingV2GroupStickerText, { color: groupAccent }]}>{String(groupIndex + 1).padStart(2, "0")}</Text>
                    </View>
                    <Text style={[styles.packingV2GroupTitle, theme && { color: theme.text }]}>{sourceTag}</Text>
                  </View>
                  <Text style={[styles.packingV2GroupProgress, theme && { color: theme.muted }]}>
                    {doneInGroup}/{allInGroup.length} 완료
                  </Text>
                </View>
                <View style={styles.packingV2GroupActions}>
                  <View style={[styles.packingV2GroupCount, { backgroundColor: `${groupAccent}18` }]}>
                    <Text style={[styles.packingV2GroupCountText, { color: groupAccent }]}>
                      {taggedItems.length}개 남음
                    </Text>
                  </View>
                  <Glyph
                    name={collapsed ? "chevronRight" : "chevronDown"}
                    size={아이콘.보통}
                    color={theme?.muted ?? "#646C7A"}
                    weight={2.2}
                  />
                </View>
              </Pressable>
              {!collapsed && taggedItems.map(renderPackingRow)}
            </View>
          );
        })}
        {completedGroups.length > 0 && (
          <View
            style={[
              styles.packingV2Completed,
              theme && {
                backgroundColor: theme.surfaceAlt,
                borderColor: theme.border,
              },
            ]}
          >
            <Pressable
              onPress={() => {
                // 상태를 "완료" 로 걸러 둔 동안에는 이 목록이 화면 전부다.
                // 그때 접으라는 말은 걸러 둔 것을 푸는 뜻이어야 한다.
                if (filter === "완료") {
                  setFilter("전체");
                  setShowCompleted(false);
                  return;
                }
                setShowCompleted((value) => !value);
              }}
              accessibilityRole="button"
              accessibilityState={{ expanded: filter === "완료" || showCompleted }}
              style={styles.packingV2CompletedHead}
            >
              <Text style={[styles.packingV2CompletedTitle, theme && { color: theme.text }]}>
                완료한 준비물 {completedGroups.reduce((sum, [, groupItems]) => sum + groupItems.length, 0)}개
              </Text>
              <Text style={[styles.packingV2CompletedToggle, theme && { color: theme.primary }]}>
                {filter === "완료" || showCompleted ? "접기" : "보기"}
              </Text>
            </Pressable>
            {(filter === "완료" || showCompleted) &&
              completedGroups.flatMap(([, groupItems]) => groupItems).map(renderPackingRow)}
          </View>
        )}
      </View>
      {/* 줄 동작이 바뀌었으니 어디를 눌러야 하는지 요리 탭과 같은 말로 적는다. */}
      {canEdit && visibleItems.length > 0 && (
        <Text style={[공용스타일.longPressHint, theme && { color: theme.muted }]}>
          왼쪽 원을 눌러 챙겼는지 체크하고, 준비물 이름을 누르면 수정할 수 있어요.
        </Text>
      )}
      {visibleItems.length === 0 && (
        <EmptyState
          title={items.length === 0 ? "아직 준비물이 없어요" : "조건에 맞는 준비물이 없어요"}
          description={items.length === 0
            ? spaceId && tripId
              // 새 여행은 여기서 시작한다. 처음부터 다시 적지 않아도 된다는 걸 이 자리에서 알린다.
              ? "하나씩 추가하거나, 「준비물 추가」에서 지난 여행 준비물을 그대로 가져올 수 있어요."
              : "여행에 필요한 준비물을 추가해 보세요."
            : "상태·담당·태그 필터를 초기화해 보세요."}
          action={items.length === 0 ? "준비물 추가" : "필터 초기화"}
          onPress={items.length === 0 && !canEdit ? undefined : () => {
            if (items.length === 0) openPackingCreate();
            else {
              setFilter("전체");
              setOwnerFilter("전체");
              setTagFilter("전체 태그");
            }
          }}
        />
      )}
      {canEdit && (
      <View
        style={[
          공용스타일.packingListTools,
          theme && { borderTopColor: theme.border },
        ]}
      >
        <View style={공용스타일.packingListToolsCopy}>
          <Text
            style={[
              공용스타일.packingListToolsTitle,
              theme && { color: theme.text },
            ]}
          >
            목록 한꺼번에 수정
          </Text>
          <Text
            style={[
              공용스타일.packingListToolsHint,
              theme && { color: theme.muted },
            ]}
          >
            복사해 수정한 뒤 다시 붙여넣을 수 있어요
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={copyPacking}
          hitSlop={누름여유(높이.칩)}
          style={[
            공용스타일.packingToolButton,
            theme && { borderColor: theme.border },
          ]}
        >
          <Text
            style={[
              공용스타일.packingToolButtonText,
              theme && { color: theme.text },
            ]}
          >
            복사
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={openImport}
          hitSlop={누름여유(높이.칩)}
          style={[
            공용스타일.packingToolButton,
            theme && { borderColor: theme.border },
          ]}
        >
          <Text
            style={[
              공용스타일.packingToolButtonText,
              theme && { color: theme.text },
            ]}
          >
            붙여넣기
          </Text>
        </Pressable>
      </View>
      )}
      <DetailSheet
        visible={tagPicker}
        title="태그 선택"
        subtitle="보고 싶은 준비물의 태그를 골라 주세요"
        submit="닫기"
        onClose={() => setTagPicker(false)}
        onSubmit={() => setTagPicker(false)}
      >
        <View style={styles.tagPickerGrid}>
          {["전체 태그", ...availableTags].map((tag) => {
            const active = tagFilter === tag;
            const count =
              tag === "전체 태그"
                ? items.length
                : items.filter((item) => packingTags(item).includes(tag))
                    .length;
            return (
              <Pressable
                accessibilityRole="button"
                key={tag}
                onPress={() => {
                  setTagFilter(tag);
                  setTagPicker(false);
                }}
                style={[
                  styles.tagPickerItem,
                  theme && {
                    backgroundColor: active ? theme.primarySoft : theme.surface,
                    borderColor: active ? theme.primary : theme.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.tagPickerName,
                    theme && { color: active ? theme.primary : theme.text },
                  ]}
                >
                  {tag === "전체 태그" ? tag : `# ${tag}`}
                </Text>
                <Text
                  style={[
                    styles.tagPickerCount,
                    theme && { color: theme.muted },
                  ]}
                >
                  {count}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </DetailSheet>
      <DetailSheet
        visible={Boolean(assigningItem)}
        title="준비물 관리"
        subtitle={
          assigningItem
            ? `‘${assigningItem.name}’${josa(assigningItem.name, "을", "를")} 누가 챙길지 골라 주세요`
            : undefined
        }
        submit="닫기"
        onClose={() => setAssigningItem(null)}
        onSubmit={() => setAssigningItem(null)}
      >
        <View style={styles.assignmentOptions}>
          {ownerSections.map((ownerName) => {
            const selected = assigningItem?.owner === ownerName;
            const description =
              ownerName === PACKING_SHARED
                ? "공용 준비물로 이동"
                : ownerName === PACKING_UNASSIGNED
                  ? "나중에 담당 정하기"
                  : `${ownerName}의 준비물로 이동`;
            return (
              <Pressable
                key={ownerName}
                onPress={() =>
                  assigningItem && assignOwner(assigningItem, ownerName)
                }
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                style={[
                  styles.assignmentOption,
                  theme && {
                    backgroundColor: selected
                      ? theme.primarySoft
                      : theme.surface,
                    borderColor: selected ? theme.primary : theme.border,
                  },
                ]}
              >
                <View
                  style={[
                    styles.assignmentAvatar,
                    theme && {
                      backgroundColor: selected
                        ? theme.primary
                        : theme.surfaceAlt,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.assignmentAvatarText,
                      theme && {
                        color: selected ? "#FFFFFF" : theme.text,
                      },
                    ]}
                  >
                    {ownerName === PACKING_UNASSIGNED ? "?" : ownerName.slice(-1)}
                  </Text>
                </View>
                <View style={styles.assignmentCopy}>
                  <Text
                    style={[
                      styles.assignmentName,
                      theme && { color: theme.text },
                    ]}
                  >
                    {ownerName}
                  </Text>
                  <Text
                    style={[
                      styles.assignmentDescription,
                      theme && { color: theme.muted },
                    ]}
                  >
                    {description}
                  </Text>
                </View>
                <View
                  style={[
                    styles.assignmentRadio,
                    theme && {
                      borderColor: selected ? theme.primary : theme.border,
                    },
                  ]}
                >
                  {selected && (
                    <View
                      style={[
                        styles.assignmentRadioDot,
                        theme && { backgroundColor: theme.primary },
                      ]}
                    />
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
        {assigningItem && (
          <Pressable
            onPress={() => openPackingEdit(assigningItem)}
            accessibilityRole="button"
            hitSlop={누름여유(높이.칩)}
            style={[공용스타일.infoManageButton, theme && { backgroundColor: theme.primarySoft }]}
          >
            <Text style={[공용스타일.infoManageButtonText, theme && { color: theme.primary }]}>이 준비물 정보 수정</Text>
          </Pressable>
        )}
      </DetailSheet>
      <DetailSheet
        visible={adding}
        title={packingSheetStep === "지난 여행" ? "지난 여행에서 준비물 가져오기" : editingId ? "준비물 수정" : "준비물 추가"}
        subtitle={packingSheetStep === "지난 여행"
          ? "가져올 준비물을 골라 주세요. 완료 표시는 해제된 상태로 와요"
          : editingId ? "이름, 수량, 담당과 태그를 바꿀 수 있어요" : "한 줄에 하나씩 적으면 여러 개를 한 번에 추가할 수 있어요"}
        submit={packingSheetStep === "지난 여행"
          ? pastPicked.length ? `${pastPicked.length}개 가져오기` : "준비물 가져오기"
          : newPackingCount && !editingId ? `${newPackingCount}개 추가` : editingId ? "저장" : "준비물 추가"}
        disabledHint={packingSheetStep === "지난 여행"
          ? !pastPicked.length ? "가져올 준비물을 골라 주세요" : undefined
          : !newPackingCount ? "준비물을 입력해 주세요" : undefined}
        submitDisabled={packingSheetStep === "지난 여행" ? !pastPicked.length : !newPackingCount}
        destructiveLabel={editingId ? "준비물 삭제" : undefined}
        destructiveMessage={editingId ? `${names || "이 준비물"}${josa(names || "이 준비물", "을", "를")} 목록에서 삭제해요.` : undefined}
        onDestructive={deletePacking}
        hasUnsavedChanges={packingDraftChanged}
        onClose={closePackingForm}
        onSubmit={packingSheetStep === "지난 여행" ? takePastPacking : submit}
      >
        {packingSheetStep === "지난 여행" ? (
          <PastTripList
            theme={theme}
            label="준비물"
            mode="여럿"
            groups={pastPacking.groups}
            loading={pastPacking.loading}
            error={pastPacking.error}
            onRetry={pastPacking.reload}
            onBack={() => setPackingSheetStep("직접")}
            selected={pastPicked}
            onPress={(_row, key) => togglePastPacking(key)}
            onToggleAll={toggleAllPastPacking}
            meta={(row) => [row.quantity, row.owner].map((value) => value.trim()).filter(Boolean).join(" · ")}
            footnote="담당은 이번 여행 참가자만 유지되고 나머지는 ‘미정’이 돼요."
          />
        ) : (<>
        {!editingId && spaceId && tripId && (
          <PastTripEntry
            theme={theme}
            hint="전에 챙긴 준비물을 골라서 그대로 불러와요."
            onPress={() => setPackingSheetStep("지난 여행")}
          />
        )}
        <DetailField
          label="준비물 이름"
          required
          value={names}
          onChangeText={setNames}
          placeholder="예: 충전기, 안경, 갈아입을 옷"
          multiline={!editingId}
          returnKeyType={editingId ? "done" : undefined}
          onSubmitEditing={editingId ? submit : undefined}
        />
        {packingDuplicateNotice ? (
          <Text accessibilityLiveRegion="polite" style={[styles.packingDuplicateHint, theme && { color: theme.muted }]}>
            {packingDuplicateNotice}
          </Text>
        ) : null}
        <OptionField
          label="담당 (선택)"
          options={ownerSections}
          value={owner}
          onChange={setOwner}
        />
        <OptionalFormSection
          label="수량 · 태그"
          summary={[quantity.trim(), draftPackingTags.length && `태그 ${draftPackingTags.length}개`].filter(Boolean).join(" · ") || undefined}
          open={packingExtrasOpen}
          onToggle={() => setPackingExtrasOpen((current) => !current)}
        >
          <DetailField
            label="수량 (선택)"
            value={quantity}
            onChangeText={setQuantity}
            placeholder="예: 각 2개, 250g"
            returnKeyType="next"
            onSubmitEditing={() => packingTagRef.current?.focus()}
          />
          <View style={공용스타일.tagEditor}>
            <Text
              style={[
                공용스타일.detailFieldLabel,
                공용스타일.selectorLabel,
                theme && { color: theme.muted },
              ]}
            >
              태그
            </Text>
            <Text style={[공용스타일.placeRecommendLabel, theme && { color: theme.muted }]}>추천 태그</Text>
            <View style={공용스타일.tagSuggestions}>
              {["전자기기", "세면", "의류", "숙소", "출발 전"].map((tag) => {
                const selected = draftPackingTags.includes(tag);
                return (
                  <Chip
                    key={tag}
                    theme={theme ?? undefined}
                    label={`# ${tag}`}
                    on={selected}
                    onPress={() =>
                      setTagText(
                        selected
                          ? draftPackingTags
                              .filter((item) => item !== tag)
                              .join(", ")
                          : [...draftPackingTags, tag].join(", "),
                      )
                    }
                  />
                );
              })}
            </View>
            <TextInput
              ref={packingTagRef}
              accessibilityLabel="태그"
              value={tagText}
              onChangeText={setTagText}
              returnKeyType="done"
              onSubmitEditing={submit}
              placeholder="쉼표로 구분 · 예: 전자기기, 출발 전, 숙소"
              placeholderTextColor={theme?.muted ?? "#9AA1AE"}
              style={[
                공용스타일.tagInput,
                theme && {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                  color: theme.text,
                },
              ]}
            />
            <View style={공용스타일.draftTags}>
              {draftPackingTags.map((tag) => (
                <Chip
                  key={tag}
                  theme={theme ?? undefined}
                  label={`# ${tag}`}
                  on
                  trailing="close"
                  onPress={() =>
                    setTagText(
                      draftPackingTags
                        .filter((currentTag) => currentTag !== tag)
                        .join(", "),
                    )
                  }
                />
              ))}
            </View>
          </View>
        </OptionalFormSection>
        {recipes.some((recipe) => recipe.ingredients.length > 0) && (
          <View style={[styles.cookingImportCallout, theme && { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
            <View style={styles.cookingImportCopy}>
              <Text style={[styles.cookingImportTitle, theme && { color: theme.text }]}>요리 재료에서 가져오기</Text>
              <Text style={[styles.cookingImportText, theme && { color: theme.muted }]}>직접 입력하지 않고 요리에 적어 둔 재료를 고를 수 있어요.</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setAdding(false);
                setCookingPicker(true);
              }}
              style={[공용스타일.aiRecipeButton, theme && { backgroundColor: theme.primarySoft }]}
            >
              <Text style={[공용스타일.aiRecipeButtonText, theme && { color: theme.primary }]}>재료 선택</Text>
            </Pressable>
          </View>
        )}
        </>)}
      </DetailSheet>
      <DetailSheet
        visible={cookingPicker}
        title="요리 재료 불러오기"
        subtitle="준비물에 추가할 재료를 골라 주세요"
        submit={
          selectedCookingUniqueCount
            ? `${selectedCookingUniqueCount}개 준비물에 추가`
            : "준비물에 추가"
        }
        disabledHint={!selectedCookingUniqueCount ? "재료를 선택해 주세요" : undefined}
        submitDisabled={!selectedCookingUniqueCount}
        onClose={() => {
          setCookingPicker(false);
          setSelectedCookingItems([]);
        }}
        onSubmit={importCookingItems}
      >
        {recipes.map((recipe) => (
          <View
            key={recipe.id}
            style={[
              styles.cookingImportGroup,
              theme && {
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
            ]}
          >
            <View style={styles.cookingImportGroupHead}>
              <Text
                style={[
                  styles.cookingImportGroupTitle,
                  theme && { color: theme.text },
                ]}
              >
                {recipe.name}
              </Text>
              <Text
                style={[
                  styles.cookingImportGroupCount,
                  theme && { color: theme.muted },
                ]}
              >
                {recipe.ingredients.length}개
              </Text>
            </View>
            {recipe.ingredients.map((ingredient) => {
              const selected = selectedCookingItems.includes(ingredient.id);
              // 이미 비슷한 준비물이 있어도 고를 수 있게 둔다. 알리기만 한다.
              const alreadyAdded = packedIngredients.get(ingredient.id) ?? false;
              return (
                <Pressable
                  accessibilityRole="button"
                  key={ingredient.id}
                  onPress={() => toggleCookingItem(ingredient.id)}
                  style={[
                    styles.cookingImportRow,
                    theme && { borderTopColor: theme.border },
                    selected &&
                      theme && { backgroundColor: theme.primarySoft },
                  ]}
                >
                  <CheckBox theme={theme ?? undefined} on={selected} style={공용스타일.체크칸} />
                  <View style={styles.cookingImportItemCopy}>
                    <Text
                      style={[
                        styles.cookingImportItemName,
                        theme && { color: theme.text },
                      ]}
                    >
                      {ingredient.name}
                    </Text>
                    <Text
                      style={[
                        styles.cookingImportItemMeta,
                        theme && { color: theme.muted },
                      ]}
                    >
                      {ingredient.quantity} · {ingredient.owner}
                      {alreadyAdded ? " · 이미 비슷한 준비물이 있어요" : ""}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </DetailSheet>
      <DetailSheet
        visible={importing}
        title="준비물 목록 붙여넣기"
        subtitle="메모에서 고친 목록을 한 번에 반영해요"
        submit={importMode === "교체" ? "목록 교체" : "목록에 추가"}
        confirmSubmit={
          importMode === "교체" && items.length
            ? `저장한 준비물 ${items.length}개를 삭제하고 붙여넣은 목록으로 바꿔요. 되돌릴 수 없어요.`
            : undefined
        }
        disabledHint={!importText.trim() ? "목록을 입력해 주세요" : undefined}
        submitDisabled={!importText.trim()}
        hasUnsavedChanges={packingImportChanged}
        onClose={() => setImporting(false)}
        onSubmit={importPacking}
      >
        <DetailField
          label="붙여넣을 준비물 목록"
          required
          value={importText}
          onChangeText={setImportText}
          multiline
          maxLength={붙여넣기_한도}
          placeholder="한 줄에 준비물 하나씩"
        />
        <OptionField
          label="목록 반영 방법"
          options={["교체", "추가"]}
          value={importMode}
          onChange={(value) => setImportMode(value as "교체" | "추가")}
        />
        <Text style={[공용스타일.settingHint, theme && { color: theme.muted }]}>
          담당: {ownerSections.join("·")} / 태그는 #으로 여러 개 적을 수 있어요
        </Text>
      </DetailSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  checkName: { color: "#593934", fontSize: 14, fontFamily: typo.title.family },
  checkNameDone: { color: "#B29B92", textDecorationLine: "line-through" },
  packingManageHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  packingManageTitle: { fontSize: 18, lineHeight: 25, fontFamily: typo.title.family },
  packingManageHint: { fontSize: 11, fontFamily: typo.caption.family, marginTop: 2 },
  packingShowAll: {
    borderWidth: 1,
    borderRadius: 모서리.원,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  packingShowAllText: { fontSize: 12, fontFamily: typo.label.family },
  ownerStatSlot: { flex: 1, flexDirection: "row", alignItems: "center" },
  ownerStat: { flex: 1, alignItems: "center" },
  ownerStatActive: { borderRadius: 모서리.상자, paddingVertical: 8 },
  ownerStatName: { fontSize: 14, fontFamily: typo.title.family },
  ownerStatCount: {
    color: "#89909C",
    fontSize: 14,
    fontFamily: typo.data.family,
    marginTop: 4,
  },
  unassignedText: { },
  ownerDivider: { width: 1, height: 26, backgroundColor: "#ECEAE5" },
  packingFilterBoard: {
    borderWidth: 1,
    borderRadius: 모서리.행,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 20,
  },
  packingFilterLine: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
  },
  packingFilterLabel: { width: 38, fontSize: 12, fontFamily: typo.label.family },
  packingFilterScroll: { flex: 1 },
  packingFilterRule: { height: StyleSheet.hairlineWidth },
  packingFilterChip: {
    borderRadius: 모서리.원,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  packingFilterChipText: { fontSize: 12, fontFamily: typo.label.family },
  packingFilters: { flexDirection: "row", gap: 6 },
  packingList: { gap: 8 },
  packingOwnerChangeText: { maxWidth: 72, fontSize: 12, fontFamily: typo.label.family },
  packingV2Hidden: { display: "none" },
  packingJourney: {
    minHeight: 82,
    borderWidth: 1,
    borderRadius: 모서리.구역,
    marginTop: 0,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  packingJourneyStamp: {
    width: 49,
    height: 54,
    borderRadius: 모서리.행,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    transform: [{ rotate: "-3deg" }],
  },
  packingSuitcaseHandle: {
    width: 18,
    height: 7,
    borderWidth: 2,
    borderBottomWidth: 0,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    marginBottom: -1,
  },
  packingSuitcaseBody: {
    width: 31,
    height: 34,
    borderWidth: 1,
    borderRadius: 모서리.상자,
    overflow: "hidden",
    flexDirection: "row",
    justifyContent: "center",
  },
  packingSuitcaseStrap: {
    width: 4,
    height: "100%",
    backgroundColor: "rgba(255,255,255,0.34)",
  },
  packingSuitcaseSticker: {
    position: "absolute",
    right: 4,
    top: 5,
    width: 10,
    height: 10,
    borderRadius: 모서리.원,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  packingSuitcaseStickerText: { fontSize: 12, fontFamily: typo.label.family },
  packingSuitcaseFeet: {
    width: 24,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  packingSuitcaseFoot: { width: 4, height: 3, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },
  packingJourneyBody: { flex: 1 },
  packingJourneyCopy: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  packingJourneyEyebrow: {
    fontSize: 12,
    lineHeight: 15,
    fontFamily: typo.label.family,
    letterSpacing: 0.5,
  },
  packingJourneyTitle: { fontSize: 14, lineHeight: 20, fontFamily: typo.title.family, marginTop: 2 },
  packingJourneyPercent: { width: 34, fontSize: 12, lineHeight: 16, fontFamily: typo.label.family, textAlign: "right" },
  packingJourneyTrack: {
    flex: 1,
    height: 6,
    borderRadius: 모서리.원,
    position: "relative",
    marginHorizontal: 6,
  },
  packingJourneyProgressRow: { flexDirection: "row", alignItems: "center" },
  packingJourneyFill: { height: 6, borderRadius: 모서리.원 },
  packingV2Controls: {
    borderWidth: 1,
    borderRadius: 모서리.행,
    marginTop: 12,
    marginBottom: 12,
    padding: 8,
    gap: 8,
  },
  packingV2StatusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  packingV2StatusTabs: { flexDirection: "row", alignItems: "center", gap: 2 },
  packingV2Owners: { flexDirection: "row", gap: 6, paddingRight: 16 },
  packingV2TagChoice: {
    minHeight: 높이.버튼,
    borderRadius: 모서리.버튼,
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
  },
  packingV2TagChoiceLabel: { width: 42, fontSize: 11, fontFamily: typo.caption.family },
  packingV2TagChoiceValue: { flex: 1, fontSize: 12, fontFamily: typo.label.family },
  packingV2Group: {
    borderWidth: 1,
    borderRadius: 모서리.행,
    overflow: "hidden",
  },
  packingV2GroupHead: {
    minHeight: 높이.버튼,
    paddingHorizontal: 여백.가로좁게,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  packingV2GroupHeadPressed: { opacity: 불투명도.눌림 },
  packingV2GroupTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  packingV2GroupSticker: {
    borderRadius: 모서리.표식,
    paddingHorizontal: 6,
    paddingVertical: 2,
    transform: [{ rotate: "-2deg" }],
  },
  packingV2GroupStickerText: {
    fontSize: 12,
    lineHeight: 15,
    fontFamily: typo.label.family,
    letterSpacing: 0.5,
  },
  packingV2GroupActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  packingV2GroupTitle: { fontSize: 14, fontFamily: typo.title.family },
  packingV2GroupProgress: { fontSize: 12, fontFamily: typo.label.family, marginTop: 2 },
  packingV2GroupCount: {
    borderRadius: 모서리.원,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  packingV2GroupCountText: { fontSize: 14, fontFamily: typo.data.family },
  packingV2Row: {
    minHeight: 높이.입력,
    paddingHorizontal: 여백.가로좁게,
    flexDirection: "row",
    alignItems: "center",
  },
  packingV2RowBorder: { borderTopWidth: StyleSheet.hairlineWidth },
  packingV2Body: { flex: 1, minWidth: 0 },
  packingV2TitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  packingV2Name: { flexShrink: 1, fontSize: 14 },
  packingV2Quantity: { fontSize: 14, fontFamily: typo.data.family },
  packingV2SubTags: { fontSize: 12, fontFamily: typo.label.family, marginTop: 2 },
  packingV2Origin: { fontSize: 11, fontFamily: typo.label.family, marginTop: 2, opacity: 0.8 },
  packingDuplicateHint: { fontSize: 12, fontFamily: typo.label.family, marginTop: -4, marginBottom: 12 },
  packingV2Assignee: {
    minWidth: 38,
    borderRadius: 모서리.원,
    paddingHorizontal: 8,
    paddingVertical: 6,
    alignItems: "center",
    marginLeft: 8,
  },
  packingV2Completed: {
    borderWidth: 1,
    borderRadius: 모서리.행,
    overflow: "hidden",
  },
  packingV2CompletedHead: {
    minHeight: 높이.입력,
    paddingHorizontal: 여백.가로좁게,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  packingV2CompletedTitle: { fontSize: 14, fontFamily: typo.title.family },
  packingV2CompletedToggle: { fontSize: 12, fontFamily: typo.label.family },
  tagPickerGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingBottom: 8,
  },
  tagPickerItem: {
    width: "48.7%",
    minHeight: 높이.저장,
    borderWidth: 1,
    borderRadius: 모서리.버튼,
    paddingHorizontal: 여백.가로좁게,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tagPickerName: { fontSize: 14, fontFamily: typo.title.family, flex: 1 },
  tagPickerCount: { fontSize: 14, fontFamily: typo.data.family },
  assignmentOptions: { gap: 8, paddingBottom: 8 },
  assignmentOption: {
    minHeight: 68,
    borderWidth: 1,
    borderRadius: 모서리.행,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  assignmentAvatar: {
    width: 39,
    height: 39,
    borderRadius: 모서리.원,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  assignmentAvatarText: { fontSize: 12, fontFamily: typo.label.family },
  assignmentCopy: { flex: 1 },
  assignmentName: { fontSize: 14, fontFamily: typo.title.family },
  assignmentDescription: { fontSize: 14, fontFamily: typo.body.family, marginTop: 2 },
  assignmentRadio: {
    width: 20,
    height: 20,
    borderRadius: 모서리.원,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  assignmentRadioDot: { width: 10, height: 10, borderRadius: 모서리.원 },
  cookingImportCallout: {
    borderRadius: 모서리.행,
    borderWidth: 1,
    borderColor: "#E5E3DD",
    backgroundColor: "#F6F2ED",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  cookingImportCopy: { flex: 1, paddingRight: 8 },
  cookingImportTitle: { fontSize: 14, fontFamily: typo.title.family },
  cookingImportText: { fontSize: 12, fontFamily: typo.label.family, marginTop: 2 },
  cookingImportGroup: {
    borderRadius: 모서리.행,
    borderWidth: 1,
    borderColor: "#E5E3DD",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    marginBottom: 8,
    overflow: "hidden",
  },
  cookingImportGroupHead: {
    minHeight: 43,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cookingImportGroupTitle: { fontSize: 14, fontFamily: typo.title.family },
  cookingImportGroupCount: { fontSize: 14, fontFamily: typo.data.family },
  cookingImportRow: {
    minHeight: 높이.버튼,
    borderTopWidth: 1,
    borderTopColor: "#EEEAE5",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 2,
  },
  cookingImportItemCopy: { flex: 1 },
  cookingImportItemName: { fontSize: 14, fontFamily: typo.title.family },
  cookingImportItemMeta: { fontSize: 11, fontFamily: typo.caption.family, marginTop: 2 },
  ownerStats: {
    minHeight: 61,
    borderRadius: 모서리.상자,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
});

/**
 * 옛 이름. `WarmTripDetail.tsx` 가 아직 이 이름으로 부른다.
 * 부르는 쪽을 새 이름으로 바꾸면 이 줄을 지운다.
 */
export { TripPreparation as Preparation };
