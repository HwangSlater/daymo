import { useContext, useMemo, useRef, useState } from "react";
import { Chip } from "../ui/Chip";
import {
  COOKING_UNASSIGNED,
  collapsedGroupsFor,
  cookingOwnerOptions,
  parseAiRecipes,
  요리메모_보이기,
  요리메모_읽기,
  자리에_넣기,
  type CookingItem,
  type Recipe,
} from "../tripPlanning";
import { type RecipeRow } from "../cookingSync";
import { importMessage, planRecipeImport } from "../pastTripImport";
import { useAnnounce } from "../announce";
import { PastTripEntry, PastTripList } from "../PastTripPicker";
import { usePastRecipes } from "../usePastTripRows";
import type { RosterEntry } from "../tripSync";

import { josa, parseAmount, currencyOf } from "../tripExpenses";
import { Linking, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Text, TextInput, type 입력칸 } from "../AppText";
import { CheckBox } from "../ui/CheckBox";
import { EmptyState as SharedEmptyState } from "../ui/EmptyState";
import { Glyph } from "../Glyph";
import { showAlert } from "../showAlert";
import { 높이, 모서리, 불투명도, 아이콘, 누름여유 } from "../theme/controls";
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
  금액_치기,
  금액_키보드,
  붙여넣기_한도,
} from "./parts";

/** 여행 상세의 「요리」 탭. 해 먹을 것과 장 볼 것을 본다. */

export function TripCooking({
  recipes,
  setRecipes,
  readyIngredientIds,
  setReadyIngredientIds,
  openPreparationImport,
  onRecordShopping,
  currency,
  participants,
  spaceId,
  tripId,
  roster,
}: {
  recipes: Recipe[];
  setRecipes: React.Dispatch<React.SetStateAction<Recipe[]>>;
  readyIngredientIds: string[];
  setReadyIngredientIds: React.Dispatch<React.SetStateAction<string[]>>;
  openPreparationImport: () => void;
  /** 장 본 금액을 비용 탭에 적는다. 부르면 지출 한 건이 생긴다. */
  onRecordShopping: (title: string, amount: number) => void;
  currency: string;
  /** 이번 여행에 가는 사람. 재료를 누가 챙기는지도 이 목록에서 고른다. */
  participants: string[];
  /** 지난 여행에서 가져오기에 쓴다. 서버에 올라간 여행일 때만 온다. */
  spaceId?: string;
  tripId?: string;
  roster: RosterEntry[];
}) {
  const theme = useContext(DetailThemeContext);
  const notify = useContext(DetailFeedbackContext);
  const canEdit = useContext(DetailEditableContext);
  const [activeId, setActiveId] = useState("mille");
  const [addingIngredient, setAddingIngredient] = useState(false);
  const [addingRecipe, setAddingRecipe] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState<CookingItem | null>(null);
  const [editingRecipe, setEditingRecipe] = useState(false);
  const [aiImporting, setAiImporting] = useState(false);
  const [aiResult, setAiResult] = useState("");
  const [showMyIngredients, setShowMyIngredients] = useState(false);
  // 장을 보고 나면 그 금액을 비용 탭에 또 손으로 옮겨 적게 된다. 목록을 보는
  // 자리에서 바로 적을 수 있게 한다.
  const [shoppingCost, setShoppingCost] = useState("");
  const [ingredientOwnerFilter, setIngredientOwnerFilter] = useState("전체");
  const [showAllRecipes, setShowAllRecipes] = useState(false);
  const [importing, setImporting] = useState(false);
  // 교체는 저장해 둔 것을 통째로 지운다. 되돌릴 수 없으니 기본은 추가로 둔다.
  const [importMode, setImportMode] = useState<"교체" | "추가">("추가");
  const [importText, setImportText] = useState("");
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [group, setGroup] = useState("기본");
  const [owner, setOwner] = useState(COOKING_UNASSIGNED);
  const [recipeName, setRecipeName] = useState("");
  const [recipeNote, setRecipeNote] = useState("");
  const [recipeUrl, setRecipeUrl] = useState("");
  // 재료·요리 시트의 「더 적기」가 펼쳐져 있는지. 고칠 때 값이 있으면 켜서 연다.
  const [ingredientGroupOpen, setIngredientGroupOpen] = useState(false);
  const [recipeExtrasOpen, setRecipeExtrasOpen] = useState(false);
  // 「요리 추가」 시트 안에서 내용을 갈아 끼우는 단계. iOS 는 창 위에 창을 못 쌓아서
  // 지난 여행 목록을 새 창이 아니라 이 시트 안에 보인다.
  const [recipeSheetStep, setRecipeSheetStep] = useState<"직접" | "지난 여행">("직접");
  const pastRecipes = usePastRecipes({
    spaceId,
    tripId,
    roster,
    active: addingRecipe && recipeSheetStep === "지난 여행",
    existingNames: recipes.map((recipe) => recipe.name),
  });
  const ingredientDraftChanged = useDraftChanged(addingIngredient, JSON.stringify([name, quantity, group, owner]));
  const recipeDraftChanged = useDraftChanged(addingRecipe, JSON.stringify([recipeName, recipeNote, recipeUrl]));
  const aiDraftChanged = useDraftChanged(aiImporting, aiResult);
  const cookingImportChanged = useDraftChanged(importing, JSON.stringify([importText, importMode]));
  const [collapsedCookingGroups, setCollapsedCookingGroups] = useState<string[]>(() =>
    collapsedGroupsFor(recipes.find((recipe) => recipe.id === "mille") ?? recipes[0]),
  );
  const activeRecipe =
    recipes.find((recipe) => recipe.id === activeId) || recipes[0];
  const menuRecipes = recipes.length > 4 && activeRecipe
    ? [activeRecipe, ...recipes.filter((recipe) => recipe.id !== activeRecipe.id)].slice(0, 4)
    : recipes;
  const ingredients = activeRecipe?.ingredients || [];
  const readyIngredientCount = ingredients.filter((item) =>
    readyIngredientIds.includes(item.id),
  ).length;
  const ingredientProgress = ingredients.length
    ? Math.round((readyIngredientCount / ingredients.length) * 100)
    : 0;
  const groups = Array.from(new Set(ingredients.map((item) => item.group)));
  const selectRecipe = (id: string) => {
    setCollapsedCookingGroups(collapsedGroupsFor(recipes.find((recipe) => recipe.id === id)));
    setActiveId(id);
  };
  const allCookingIngredients = recipes.flatMap((recipe) =>
    recipe.ingredients.map((item) => ({ ...item, recipeId: recipe.id, recipe: recipe.name })),
  );
  // 목록에 이미 적힌 담당 가운데 참가자에서 빠진 이름도 거를 수 있게 남긴다.
  // 여행 도중 참가자가 바뀌어도 예전에 적어 둔 재료가 안 보이면 곤란하다.
  const shoppingOwnerOptions = useMemo(() => {
    const known = cookingOwnerOptions(participants);
    const extra = Array.from(new Set(allCookingIngredients.map((item) => item.owner)))
      .filter((owner) => owner && !known.includes(owner));
    return ["전체", ...known, ...extra];
  }, [allCookingIngredients, participants]);
  const filteredShoppingCount = ingredientOwnerFilter === "전체"
    ? allCookingIngredients.length
    : allCookingIngredients.filter((item) => item.owner === ingredientOwnerFilter).length;
  const duplicateIngredient = Boolean(activeRecipe) && activeRecipe.ingredients.some(
    (item) => item.id !== editingIngredient?.id && item.name.trim().toLowerCase() === name.trim().toLowerCase(),
  );
  const ingredientFormValid = Boolean(name.trim()) && !duplicateIngredient;
  /**
   * 「다음」 키로 옮겨 갈 칸(2026-09-23 검토 #17). 접혀 있는 칸과 여러 줄 칸에는 붙이지
   * 않는다 — 안 보이는 칸으로 커서가 가거나 줄바꿈 키가 사라진다.
   */
  const ingredientQuantityRef = useRef<입력칸 | null>(null);
  const recipeUrlRef = useRef<입력칸 | null>(null);
  const duplicateRecipe = recipes.some(
    (recipe) => recipe.id !== (editingRecipe ? activeRecipe?.id : undefined) && recipe.name.trim().toLowerCase() === recipeName.trim().toLowerCase(),
  );
  const recipeUrlValid = !recipeUrl.trim() || /^(https?:\/\/)?[^\s]+\.[^\s]+/i.test(recipeUrl.trim());
  const recipeFormValid = Boolean(recipeName.trim()) && !duplicateRecipe && recipeUrlValid;
  const cookingPrompt = `아래 메모를 Daymo 요리 목록 형식으로 변환하라.
규칙:
1. 설명, 인사, 번호, 마크다운을 절대 쓰지 않는다.
2. 각 요리의 첫 줄은 반드시: 요리 | 이름 | 메모 | 참고 링크
3. 이어지는 재료는 반드시: 재료 | 이름 | 수량 | 분류 | 준비
4. 준비 값은 ${cookingOwnerOptions(participants).join(", ")} 중 하나만 쓴다.
5. 참고 링크는 메모에 URL이 있을 때만 쓰고, 없으면 비워둔다.
6. 모르는 값은 미정으로 쓰고, 구분자는 반드시 | 만 사용한다.
7. 결과만 출력한다.

[내 메모]
여기에 만들 요리와 재료 메모를 붙여넣어 주세요.`;
  const addIngredient = () => {
    if (!ingredientFormValid || !activeRecipe) return;
    const wasEditing = Boolean(editingIngredient);
    const next = {
      id: newPlaceId(),
      name: name.trim(),
      quantity: quantity.trim(),
      group,
      owner,
    };
    setRecipes((current) =>
      current.map((recipe) => {
        if (recipe.id !== activeRecipe.id) return recipe;
        return {
          ...recipe,
          ingredients: editingIngredient
            ? recipe.ingredients.map((item) =>
                item.id === editingIngredient.id ? { ...next, id: item.id } : item,
              )
            : [...recipe.ingredients, next],
        };
      }),
    );
    setName("");
    setQuantity("");
    setGroup("기본");
    setOwner(COOKING_UNASSIGNED);
    setEditingIngredient(null);
    setAddingIngredient(false);
    notify(wasEditing ? "재료를 수정했어요" : "재료를 추가했어요");
  };
  const openIngredientEdit = (item: CookingItem) => {
    setEditingIngredient(item);
    setName(item.name);
    setQuantity(item.quantity);
    setGroup(item.group);
    setOwner(item.owner);
    setIngredientGroupOpen(Boolean(item.group.trim()) && item.group !== "기본");
    setAddingIngredient(true);
  };
  const closeIngredientSheet = () => {
    setAddingIngredient(false);
    setEditingIngredient(null);
    setName("");
    setQuantity("");
    setGroup("기본");
    setOwner(COOKING_UNASSIGNED);
    setIngredientGroupOpen(false);
  };
  const addRecipe = () => {
    if (!recipeFormValid) return;
    if (editingRecipe && activeRecipe) {
      setRecipes((current) =>
        current.map((recipe) =>
          recipe.id === activeRecipe.id
            ? {
                ...recipe,
                name: recipeName.trim(),
                note: recipeNote.trim(),
                url: recipeUrl.trim(),
              }
            : recipe,
        ),
      );
      setRecipeName("");
      setRecipeNote("");
      setRecipeUrl("");
      setEditingRecipe(false);
      setAddingRecipe(false);
      notify("요리 정보를 수정했어요");
      return;
    }
    const id = newPlaceId();
    setRecipes((current) => [
      ...current,
      {
        id,
        name: recipeName.trim(),
        note: recipeNote.trim(),
        url: recipeUrl.trim(),
        ingredients: [],
      },
    ]);
    setCollapsedCookingGroups([]);
    setActiveId(id);
    setRecipeName("");
    setRecipeNote("");
    setRecipeUrl("");
    setAddingRecipe(false);
    notify("요리를 추가했어요");
  };
  // 요리 카드의 ... 도 여기로 온다. 전에는 경고창을 띄워 수정과 삭제를 고르게
  // 했는데, 경고창은 되돌릴 수 없는 일에 쓰는 것이라 수정하러 갈 때마다 한 번씩
  // 긴장하게 됐다. 다른 탭처럼 바로 수정 창을 열고 삭제는 그 창 아래에 둔다.
  const openRecipeEdit = () => {
    if (!activeRecipe) return;
    setRecipeName(activeRecipe.name);
    setRecipeNote(요리메모_읽기(activeRecipe.note));
    setRecipeUrl(activeRecipe.url || "");
    setRecipeExtrasOpen(Boolean(요리메모_읽기(activeRecipe.note) || activeRecipe.url));
    setEditingRecipe(true);
    setAddingRecipe(true);
  };
  const closeRecipeSheet = () => {
    setAddingRecipe(false);
    setEditingRecipe(false);
    setRecipeSheetStep("직접");
    setRecipeName("");
    setRecipeNote("");
    setRecipeUrl("");
    setRecipeExtrasOpen(false);
  };
  // 지난 여행의 요리 하나를 재료까지 그대로 복사한다. 재료의 준비 완료는 목록 밖에
  // 있어 저절로 풀리고, 담당은 이번 여행 참가자만 남는다(`planRecipeImport`).
  const takePastRecipe = (row: RecipeRow) => {
    const plan = planRecipeImport([row], recipes.map((recipe) => recipe.name), participants, newPlaceId);
    const taken = plan.taken[0];
    if (!taken) {
      notify(importMessage("요리", plan));
      return;
    }
    setRecipes((current) => [...current, taken]);
    setCollapsedCookingGroups([]);
    setActiveId(taken.id);
    closeRecipeSheet();
    notify(`${taken.name}${josa(taken.name, "을", "를")} 재료 ${taken.ingredients.length}개와 함께 가져왔어요`);
  };
  // 넣기 전에 몇 개가 읽혔는지 센다. 붙여넣고 나서 무엇이 들어갈지 모른 채
  // 버튼을 누르던 것이 이 흐름에서 가장 불안한 대목이었다.
  const aiParsed: Recipe[] = useMemo(() => parseAiRecipes(aiResult, () => ""), [aiResult]);
  const aiIngredientCount = aiParsed.reduce((sum, recipe) => sum + recipe.ingredients.length, 0);
  /**
   * 붙여넣은 글에서 무엇을 읽었는지 알리는 줄. 비어 있을 때의 안내는 늘 떠 있으니 읽지
   * 않고, 붙여넣은 뒤에 바뀌는 결과와 「못 읽었어요」만 읽어 준다(2026-09-23 검토 #29).
   */
  const aiReadNotice = !aiResult.trim()
    ? ""
    : aiParsed.length
      ? `요리 ${aiParsed.length}개와 재료 ${aiIngredientCount}개를 읽었어요. ${aiParsed.map((recipe) => recipe.name).join(", ")}`
      : "요리 줄을 찾지 못했어요. 각 줄이 ‘요리 |’ 나 ‘재료 |’ 로 시작하는지 확인해 주세요.";
  useAnnounce(aiReadNotice);
  const copyCookingPrompt = async () => {
    await Clipboard.setStringAsync(cookingPrompt);
    notify("프롬프트를 복사했어요");
  };
  // 복사한 뒤 브라우저까지 열어 준다. 앱을 나갔다 오는 건 그대로지만 사용자가
  // 직접 찾아 들어가는 한 단계가 줄고, 무엇을 하러 나가는지도 분명해진다.
  const copyPromptAndOpenGpt = async () => {
    // 브라우저는 누른 직후에만 복사도 새 창도 허락한다. 둘 다 기다리지 말고 곧장 부른다.
    // 아이폰 웹에서는 await 뒤의 복사가 조용히 실패해 「복사했어요」가 거짓말이 됐다.
    const copying = Clipboard.setStringAsync(cookingPrompt).then(
      () => true,
      () => false,
    );
    const opening = Linking.openURL("https://chatgpt.com/").then(
      () => true,
      () => false,
    );
    const [copied, opened] = await Promise.all([copying, opening]);
    if (!copied) {
      notify("복사하지 못했어요. 아래 프롬프트를 길게 눌러 복사해 주세요");
      return;
    }
    notify(opened ? "프롬프트를 복사했어요. 붙여넣고 결과를 다시 가져와 주세요" : "프롬프트를 복사했어요. ChatGPT 를 열어 붙여넣어 주세요");
  };
  const pasteAiResult = async () => {
    // 아이폰 웹은 붙여넣기 읽기를 허락하지 않을 때가 많다. 그때 아무 일도 없으면 고장으로
    // 보이니, 손으로 붙여넣을 칸으로 안내한다.
    const text = await readClipboard();
    if (!text.trim()) {
      notify("붙여넣기가 막혀 있어요. 아래 「붙여넣은 결과」 칸을 길게 눌러 붙여넣어 주세요");
      return;
    }
    setAiResult(text);
  };
  const importAiRecipes = () => {
    const parsed = parseAiRecipes(aiResult, newPlaceId);
    if (!parsed.length) {
      notify("요리 줄을 못 찾았어요. 형식이 맞는지 봐 주세요");
      return;
    }
    const existingRecipeNames = new Set(recipes.map((recipe) => recipe.name.trim().toLowerCase()));
    const uniqueParsed = parsed
      .filter((recipe, index, values) =>
        !existingRecipeNames.has(recipe.name.trim().toLowerCase()) &&
        values.findIndex((value) => value.name.trim().toLowerCase() === recipe.name.trim().toLowerCase()) === index,
      )
      .map((recipe) => ({
        ...recipe,
        ingredients: recipe.ingredients.filter((item, index, values) =>
          values.findIndex((value) => value.name.trim().toLowerCase() === item.name.trim().toLowerCase()) === index,
        ),
      }));
    if (!uniqueParsed.length) {
      notify("이미 추가한 요리뿐이에요");
      return;
    }
    setRecipes((current) => [...current, ...uniqueParsed]);
    setCollapsedCookingGroups(Array.from(new Set(uniqueParsed[0].ingredients.map((item) => item.group))));
    setActiveId(uniqueParsed[0].id);
    setAiResult("");
    setAiImporting(false);
    notify(`요리 ${uniqueParsed.length}개를 추가했어요`);
  };
  const deleteRecipe = () => {
    if (!activeRecipe) return;
    const 자리 = recipes.findIndex((recipe) => recipe.id === activeRecipe.id);
    const target = activeRecipe;
    const remaining = recipes.filter((recipe) => recipe.id !== activeRecipe.id);
    setRecipes(remaining);
    setCollapsedCookingGroups(Array.from(new Set(remaining[0]?.ingredients.map((item) => item.group) ?? [])));
    setActiveId(remaining[0]?.id || "");
    closeRecipeSheet();
    // 재료까지 한꺼번에 사라지는 삭제라 되돌릴 길이 가장 필요하다.
    notify("요리와 재료 목록을 삭제했어요", {
      label: "되돌리기",
      onPress: () => {
        setRecipes((current) => 자리에_넣기(current, target, 자리));
        setActiveId(target.id);
        setCollapsedCookingGroups(collapsedGroupsFor(target));
        notify("요리를 되돌렸어요");
      },
    });
  };
  const openRecipeLink = () => {
    if (!activeRecipe?.url) return;
    const target = /^https?:\/\//i.test(activeRecipe.url)
      ? activeRecipe.url
      : `https://${activeRecipe.url}`;
    Linking.openURL(encodeURI(target));
  };
  const removeIngredient = (item: CookingItem) =>
    showAlert("재료를 삭제할까요?", item.name, [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: () => {
          const 자리 = (recipes.find((recipe) => recipe.id === activeId)?.ingredients ?? [])
            .findIndex((value) => value.id === item.id);
          setRecipes((current) =>
            current.map((recipe) =>
              recipe.id === activeId
                ? {
                    ...recipe,
                    ingredients: recipe.ingredients.filter(
                      (value) => value.id !== item.id,
                    ),
                  }
                : recipe,
            ),
          );
          notify("재료를 삭제했어요", {
            label: "되돌리기",
            onPress: () => {
              setRecipes((current) => current.map((recipe) =>
                recipe.id === activeId
                  ? { ...recipe, ingredients: 자리에_넣기(recipe.ingredients, item, 자리) }
                  : recipe));
              notify("재료를 되돌렸어요");
            },
          });
        },
      },
    ]);
  const copyCooking = async () => {
    await Clipboard.setStringAsync(
      ingredients
        .map(
          (item) =>
            `${item.name} | ${item.quantity} | ${item.group} | ${item.owner}`,
        )
        .join("\n"),
    );
    notify("요리 재료 목록을 복사했어요");
  };
  const openImport = async () => {
    const copied = await readClipboard();
    setImportText(copied);
    setImporting(true);
    if (!copied) notify("복사한 내용을 읽지 못했어요. 칸에 직접 붙여넣어 주세요");
  };
  const importCooking = () => {
    const parsed = importText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [
          itemName,
          itemQuantity = "",
          itemGroup = "기본",
          itemOwner = "미정",
        ] = line.split("|").map((value) => value.trim());
        return {
          id: newPlaceId(),
          name: itemName,
          quantity: itemQuantity,
          group: itemGroup,
          owner: itemOwner,
        };
      })
      .filter((item, index, values) =>
        Boolean(item.name) &&
        values.findIndex((value) => value.name.trim().toLowerCase() === item.name.trim().toLowerCase()) === index,
      );
    if (!parsed.length) return;
    const existingNames = new Set(ingredients.map((item) => item.name.trim().toLowerCase()));
    const additions = importMode === "교체"
      ? parsed
      : parsed.filter((item) => !existingNames.has(item.name.trim().toLowerCase()));
    setRecipes((current) =>
      current.map((recipe) =>
        recipe.id === activeId
          ? {
              ...recipe,
              ingredients:
                importMode === "교체"
                  ? additions
                  : [...recipe.ingredients, ...additions],
            }
          : recipe,
      ),
    );
    setImporting(false);
    notify(additions.length ? `요리 재료 ${additions.length}개를 반영했어요` : "이미 추가한 재료뿐이에요");
  };
  return (
    <View>
      <TabActionHeader
        label="요리"
        count={`${recipes.length}개`}
        action="요리 추가"
        onPress={() => setAddingRecipe(true)}
      />
      {recipes.length > 0 && (
        <View style={styles.recipeSelector}>
          <View style={styles.recipeSelectorHead}>
            <Text style={[styles.recipeSelectorTitle, theme && { color: theme.muted }]}>메뉴</Text>
            <View style={styles.recipeSelectorActions}>
              {/* 개수는 바로 위 탭 머리글이 이미 보여준다. 넘칠 때만 더 보기를 낸다. */}
              {recipes.length > 4 && (
                <Pressable
                  accessibilityRole="button" onPress={() => setShowAllRecipes(true)}>
                  <View style={styles.inlineMore}>
                    <Text style={[styles.recipeSelectorMore, theme && { color: theme.primary }]}>전체 {recipes.length}개</Text>
                    <Glyph name="chevronRight" size={아이콘.작게} color={theme?.primary ?? "#3F4C8F"} />
                  </View>
                </Pressable>
              )}
            </View>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.cookV2MenuList}
          >
            {menuRecipes.map((recipe) => {
              const index = recipes.findIndex((item) => item.id === recipe.id);
              const selected = recipe.id === activeId;
              return (
                <Pressable
                  key={recipe.id}
                  onPress={() => selectRecipe(recipe.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${recipe.name} 메뉴, 재료 ${recipe.ingredients.length}개`}
                  style={[
                    styles.cookV2MenuCard,
                    theme && {
                      backgroundColor: selected ? theme.primarySoft : theme.surface,
                      borderColor: selected ? theme.primary : theme.border,
                    },
                  ]}
                >
                  <View style={styles.cookV2MenuTop}>
                    <Text style={[styles.cookV2MenuNumber, theme && { color: selected ? theme.primary : theme.muted }]}>{String(index + 1).padStart(2, "0")}</Text>
                    <Text style={[styles.cookV2MenuCount, theme && { color: selected ? theme.primary : theme.muted }]}>{recipe.ingredients.length}개</Text>
                  </View>
                  <Text numberOfLines={1} style={[styles.cookV2MenuName, theme && { color: theme.text }]}>{recipe.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}
      {allCookingIngredients.length > 0 && (
        <View
          style={[
            styles.myCookingBox,
            theme && {
              backgroundColor: theme.surface,
              borderColor: theme.border,
            },
          ]}
        >
          <Pressable
            onPress={() => setShowMyIngredients(true)}
            accessibilityRole="button"
            accessibilityLabel={`통합 장보기 목록, 전체 재료 ${allCookingIngredients.length}개`}
            style={styles.myCookingCompact}
          >
            <View style={[styles.myCookingIcon, theme && { backgroundColor: theme.primarySoft }]}>
              {[0, 1, 2].map((line) => (
                <View key={line} style={styles.cookV2MemoLine}>
                  <View style={[styles.cookV2MemoDot, theme && { backgroundColor: theme.primary }]} />
                  <View
                    style={[
                      styles.cookV2MemoRule,
                      line === 2 && styles.cookV2MemoRuleShort,
                      theme && { backgroundColor: theme.primary },
                    ]}
                  />
                </View>
              ))}
            </View>
            <View style={styles.myCookingCopy}>
              <Text style={[styles.cookV2MyEyebrow, theme && { color: theme.primary }]}>통합 장보기</Text>
              <Text style={[styles.myCookingTitle, theme && { color: theme.text }]}>전체 재료 {allCookingIngredients.length}개</Text>
              <Text numberOfLines={1} style={[styles.myCookingSummary, theme && { color: theme.muted }]}>현지 구매 {allCookingIngredients.filter((item) => item.owner === "구매").length}개 · 집에서 {allCookingIngredients.filter((item) => item.owner !== "구매").length}개</Text>
            </View>
            <Glyph name="chevronRight" size={아이콘.보통} color={theme?.primary ?? "#3F4C8F"} />
          </Pressable>
        </View>
      )}
      {!activeRecipe ? (
        <SharedEmptyState
          theme={theme ?? undefined}
          모양="세로"
          title="만들 요리를 추가해 보세요."
          description="요리별로 재료와 준비 방법을 나눌 수 있어요."
          action={canEdit ? "첫 요리 추가" : undefined}
          onPress={canEdit ? () => setAddingRecipe(true) : undefined}
        />
      ) : (
        <>
          <View
            style={[
              styles.cookingHero,
              styles.cookV2Hero,
              theme && { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <View style={styles.cookingHeroCopy}>
              <Text style={[styles.cookingEyebrow, theme && { color: theme.primary }]}>{ingredientProgress === 100 ? "재료 준비 완료" : "이번 여행의 한 끼"}</Text>
              <Text
                style={[styles.cookingTitle, theme && { color: theme.text }]}
              >
                {activeRecipe.name}
              </Text>
              <Text
                style={[styles.cookingNote, theme && { color: theme.muted }]}
              >
                {요리메모_보이기(activeRecipe.note)}
              </Text>
              {activeRecipe.url ? (
                <Pressable
                  onPress={openRecipeLink}
                  accessibilityRole="link"
                  style={styles.recipeLink}
                >
                  <Glyph name="play" size={아이콘.작게} color={theme?.primary ?? "#3F4C8F"} />
                  <Text style={[styles.recipeLinkText, theme && { color: theme.primary }]}>레시피 영상 보기</Text>
                </Pressable>
              ) : null}
            </View>
            <View style={styles.cookingHeroActions}>
              {canEdit && (
              <Pressable
                onPress={openRecipeEdit}
                accessibilityRole="button"
                accessibilityLabel={activeRecipe ? `${activeRecipe.name} 수정` : "요리 수정"}
                style={[
                  styles.cookingMoreButton,
                  theme && { backgroundColor: theme.surface },
                ]}
              >
                <Glyph name="more" size={아이콘.보통} color={theme?.muted ?? "#646C7A"} weight={2.6} />
              </Pressable>
              )}
              <View style={[styles.cookV2ProgressBadge, theme && { backgroundColor: theme.primarySoft }]}>
                <Text style={[styles.cookV2ProgressBadgeValue, theme && { color: theme.primary }]}>{ingredientProgress}%</Text>
                <Text style={[styles.cookV2ProgressBadgeLabel, theme && { color: theme.muted }]}>재료 준비</Text>
              </View>
            </View>
          </View>
          <View style={styles.cookingToolbar}>
            <Text style={[styles.cookingTip, theme && { color: theme.muted }]}>
              필요한 재료
            </Text>
            {canEdit && (
            <Pressable
              accessibilityRole="button"
              onPress={() => setAddingIngredient(true)}
              style={[styles.placeAdd, theme && { backgroundColor: theme.primarySoft }]}
            >
              <View style={공용스타일.더하기줄}>
                <Glyph name="plus" size={아이콘.작게} color={theme?.primary ?? "#3F4C8F"} weight={2.4} />
                <Text style={[styles.placeAddText, theme && { color: theme.primary }]}>재료 추가</Text>
              </View>
            </Pressable>
            )}
          </View>
          {ingredients.length === 0 && (
            <EmptyState
              title="아직 재료가 없어요"
              description="첫 재료를 추가하거나 목록을 붙여넣어 요리를 준비해 보세요."
              action="첫 재료 추가"
              onPress={canEdit ? () => setAddingIngredient(true) : undefined}
            />
          )}
          {groups.map((section, groupIndex) => {
            const sectionItems = ingredients.filter((item) => item.group === section);
            const sectionReadyCount = sectionItems.filter((item) => readyIngredientIds.includes(item.id)).length;
            const collapsed = collapsedCookingGroups.includes(section);
            const groupAccent = theme
              ? [theme.primary, theme.secondary, theme.accent][groupIndex % 3]
              : ["#E89B58", "#55BFB4", "#8B7CF6"][groupIndex % 3];
            return (
              <View
              key={section}
              style={[
                styles.cookingSection,
                theme && {
                  backgroundColor: theme.surface,
                  borderColor: `${groupAccent}55`,
                  transform: [
                    {
                      rotate: groups.indexOf(section) % 2 ? ".2deg" : "-.2deg",
                    },
                  ],
                },
              ]}
              >
              <Pressable
                onPress={() =>
                  setCollapsedCookingGroups((current) =>
                    current.includes(section)
                      ? current.filter((groupName) => groupName !== section)
                      : [...current, section],
                  )
                }
                accessibilityRole="button"
                accessibilityState={{ expanded: !collapsed }}
                style={[styles.cookV2SectionHead, { backgroundColor: `${groupAccent}0D` }]}
              >
                <View style={styles.cookV2SectionTitleRow}>
                  <View style={[styles.cookV2SectionLabel, { backgroundColor: `${groupAccent}20` }]}>
                    <Text style={[styles.cookV2SectionLabelText, { color: groupAccent }]}>{String(groupIndex + 1).padStart(2, "0")}</Text>
                  </View>
                  <Text style={[styles.cookingSectionTitle, styles.cookV2SectionTitle, theme && { color: theme.text }]}>{section}</Text>
                </View>
                <View style={styles.cookV2SectionActions}>
                  <Text style={[styles.cookV2SectionCount, theme && { color: theme.muted }]}>{sectionReadyCount}/{sectionItems.length} 준비</Text>
                  <Glyph name={collapsed ? "chevronRight" : "chevronDown"} size={아이콘.보통} color={theme?.muted ?? "#646C7A"} weight={2.2} />
                </View>
              </Pressable>
              {!collapsed && sectionItems.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => openIngredientEdit(item)}
                    onLongPress={canEdit ? () => removeIngredient(item) : undefined}
                    accessibilityRole="button"
                    accessibilityLabel={`${item.name}, ${item.quantity}, ${item.owner}, 수정`}
                    style={[
                      styles.ingredientRow,
                      readyIngredientIds.includes(item.id) && styles.cookV2IngredientDone,
                    ]}
                  >
                    <Pressable
                      onPress={(event) => {
                        event.stopPropagation();
                        setReadyIngredientIds((current) =>
                          current.includes(item.id)
                            ? current.filter((id) => id !== item.id)
                            : [...current, item.id],
                        );
                      }}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: readyIngredientIds.includes(item.id) }}
                      accessibilityLabel={`${item.name} ${readyIngredientIds.includes(item.id) ? "준비 완료 해제" : "준비 완료"}`}
                      disabled={!canEdit}
                      hitSlop={11}
                      style={공용스타일.체크칸}
                    >
                      <CheckBox theme={theme ?? undefined} on={readyIngredientIds.includes(item.id)} 모양="원" />
                    </Pressable>
                    <View style={styles.ingredientBody}>
                      <Text
                        style={[
                          styles.ingredientName,
                          theme && { color: theme.text },
                          readyIngredientIds.includes(item.id) && styles.cookV2IngredientNameDone,
                        ]}
                      >
                        {item.name}
                      </Text>
                      <Text
                        style={[
                          styles.ingredientOwner,
                          theme && { color: theme.muted },
                        ]}
                      >
                        {item.owner}
                      </Text>
                    </View>
                    <Text style={[styles.ingredientQuantity, theme && { color: theme.muted }]}>
                      {item.quantity}
                    </Text>
                  </Pressable>
                ))}
            </View>
            );
          })}
          {canEdit && (
          <Text style={[공용스타일.longPressHint, theme && { color: theme.muted }]}>
            왼쪽 원을 눌러 준비 여부를 체크하고, 재료 이름을 누르면 수정할 수 있어요. 길게 누르면 삭제할 수 있어요.
          </Text>
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
              onPress={copyCooking}
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
        </>
      )}
      <DetailSheet
        visible={showAllRecipes}
        title="전체 요리 메뉴"
        subtitle={`${recipes.length}개 요리 중 확인할 메뉴를 고르면 돼요`}
        submit="닫기"
        onClose={() => setShowAllRecipes(false)}
        onSubmit={() => setShowAllRecipes(false)}
      >
        <View style={[styles.recipeList, theme && { backgroundColor: theme.surface, borderColor: theme.border }]}>
          {recipes.map((recipe, index) => (
            <Pressable
              key={recipe.id}
              onPress={() => {
                selectRecipe(recipe.id);
                setShowAllRecipes(false);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: recipe.id === activeId }}
              style={[
                styles.recipeListRow,
                index > 0 && styles.recipeListRowBorder,
                theme && index > 0 && { borderTopColor: theme.border },
                recipe.id === activeId && theme && { backgroundColor: theme.primarySoft },
              ]}
            >
              <View style={[styles.recipeListNumber, theme && { backgroundColor: recipe.id === activeId ? theme.primary : theme.surfaceAlt }]}>
                <Text style={[styles.recipeListNumberText, theme && { color: recipe.id === activeId ? "#FFFFFF" : theme.muted }]}>{index + 1}</Text>
              </View>
              <View style={styles.recipeListCopy}>
                <Text numberOfLines={1} style={[styles.recipeListName, theme && { color: theme.text }]}>{recipe.name}</Text>
                <Text numberOfLines={1} style={[styles.recipeListNote, theme && { color: theme.muted }]}>{요리메모_보이기(recipe.note)}</Text>
              </View>
              <Text style={[styles.recipeListCount, theme && { color: theme.muted }]}>{recipe.ingredients.length}개</Text>
            </Pressable>
          ))}
        </View>
      </DetailSheet>
      <DetailSheet
        visible={showMyIngredients}
        title="통합 장보기 목록"
        subtitle={`요리 ${recipes.length}개에 들어가는 재료를 준비 방법별로 모아 봐요`}
        submit={canEdit ? "준비물에 추가" : "닫기"}
        onClose={() => {
          setShoppingCost("");
          setShowMyIngredients(false);
        }}
        onSubmit={() => {
          setShoppingCost("");
          setShowMyIngredients(false);
          if (canEdit) openPreparationImport();
        }}
      >
        {canEdit && (
        <View style={[styles.shoppingCost, theme && { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
          <View style={styles.shoppingCostCopy}>
            <Text style={[styles.shoppingCostTitle, theme && { color: theme.text }]}>장 본 금액 추가</Text>
            <Text style={[styles.shoppingCostHint, theme && { color: theme.muted }]}>
              비용 탭에 식비로 한 건 들어가요
            </Text>
          </View>
          <TextInput
            accessibilityLabel="장 본 금액"
            value={shoppingCost}
            onChangeText={(text) => setShoppingCost(금액_치기(text, currencyOf(currency).fraction))}
            keyboardType={금액_키보드(currencyOf(currency).fraction)}
            placeholder="예: 41,500"
            placeholderTextColor={theme?.muted ?? "#9AA1AE"}
            style={[styles.shoppingCostInput, theme && { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
          />
          <Pressable
            onPress={() => {
              const amount = parseAmount(shoppingCost, currencyOf(currency).fraction);
              if (!amount) {
                notify("금액을 입력해 주세요");
                return;
              }
              onRecordShopping("장보기", amount);
              setShoppingCost("");
              setShowMyIngredients(false);
            }}
            accessibilityRole="button"
            accessibilityLabel="장 본 금액을 비용에 추가"
            style={[styles.shoppingCostButton, theme && { backgroundColor: theme.primary }]}
          >
            <Text style={styles.shoppingCostButtonText}>추가</Text>
          </Pressable>
        </View>
        )}
        <OptionField
          label={`담당 · ${filteredShoppingCount}개`}
          options={shoppingOwnerOptions}
          value={ingredientOwnerFilter}
          onChange={setIngredientOwnerFilter}
        />
        {recipes.map((recipe) => {
          const matching = ingredientOwnerFilter === "전체"
            ? recipe.ingredients
            : recipe.ingredients.filter((item) => item.owner === ingredientOwnerFilter);
          if (!matching.length) return null;
          return (
            <View key={recipe.id} style={[styles.myIngredientGroup, theme && { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  selectRecipe(recipe.id);
                  setShowMyIngredients(false);
                }}
                style={styles.myIngredientGroupHead}
              >
                <Text numberOfLines={1} style={[styles.myIngredientGroupTitle, theme && { color: theme.text }]}>{recipe.name}</Text>
                <View style={styles.inlineMore}>
                  <Text style={[styles.myIngredientGroupCount, theme && { color: theme.primary }]}>{matching.length}개</Text>
                  <Glyph name="chevronRight" size={아이콘.작게} color={theme?.primary ?? "#3F4C8F"} />
                </View>
              </Pressable>
              {matching.map((item) => (
                <View key={item.id} style={[styles.myIngredientRow, theme && { borderTopColor: theme.border }]}>
                  <Text numberOfLines={1} style={[styles.myIngredientName, theme && { color: theme.text }]}>{item.name}</Text>
                  <Text numberOfLines={1} style={[styles.myIngredientQuantity, theme && { color: theme.muted }]}>{item.quantity} · {item.owner}</Text>
                </View>
              ))}
            </View>
          );
        })}
      </DetailSheet>
      <DetailSheet
        visible={addingIngredient}
        title={editingIngredient ? "요리 재료 수정" : "요리 재료 추가"}
        subtitle="분류와 담당은 저장한 뒤에도 바꿀 수 있어요"
        submit={editingIngredient ? "저장" : "재료 추가"}
        disabledHint={!ingredientFormValid ? (duplicateIngredient ? "이 요리에 이미 있는 재료예요" : "재료 이름을 입력해 주세요") : undefined}
        submitDisabled={!ingredientFormValid}
        destructiveLabel={editingIngredient ? "재료 삭제" : undefined}
        destructiveMessage="이 요리에서 재료를 삭제해요."
        onDestructive={() => {
          if (!editingIngredient) return;
          removeIngredient(editingIngredient);
          closeIngredientSheet();
        }}
        hasUnsavedChanges={ingredientDraftChanged}
        onClose={closeIngredientSheet}
        onSubmit={addIngredient}
      >
        <DetailField
          label="재료 이름"
          required
          value={name}
          onChangeText={setName}
          placeholder="예: 팽이버섯"
          returnKeyType="next"
          onSubmitEditing={() => ingredientQuantityRef.current?.focus()}
        />
        <DetailField
          label="수량 (선택)"
          value={quantity}
          onChangeText={setQuantity}
          placeholder="예: 1봉"
          inputRef={ingredientQuantityRef}
          returnKeyType="done"
          onSubmitEditing={() => ingredientFormValid && addIngredient()}
        />
        <OptionField
          label="담당 (선택)"
          options={cookingOwnerOptions(participants)}
          value={owner}
          onChange={setOwner}
        />
        <OptionalFormSection
          label="분류"
          summary={group.trim() && group !== "기본" ? group : undefined}
          open={ingredientGroupOpen}
          onToggle={() => setIngredientGroupOpen((current) => !current)}
        >
          <View style={공용스타일.tagEditor}>
            <Text
              style={[
                공용스타일.detailFieldLabel,
                공용스타일.selectorLabel,
                theme && { color: theme.muted },
              ]}
            >
              분류 (선택)
            </Text>
            <View style={공용스타일.tagSuggestions}>
              {["채소", "고기", "해산물", "양념", "소스", "토핑"].map(
                (category) => {
                  const selected = group === category;
                  return (
                    <Chip
                      key={category}
                      theme={theme ?? undefined}
                      label={category}
                      on={selected}
                      onPress={() => setGroup(category)}
                    />
                  );
                },
              )}
            </View>
            <TextInput
              accessibilityLabel="분류 직접 입력"
              value={group}
              onChangeText={setGroup}
              returnKeyType="done"
              onSubmitEditing={() => ingredientFormValid && addIngredient()}
              placeholder="직접 입력 · 예: 유제품"
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
          </View>
        </OptionalFormSection>
      </DetailSheet>
      <DetailSheet
        visible={addingRecipe}
        title={recipeSheetStep === "지난 여행" ? "지난 여행에서 요리 가져오기" : editingRecipe ? "요리 수정" : "요리 추가"}
        subtitle={recipeSheetStep === "지난 여행"
          ? "요리를 누르면 재료까지 함께 가져와요. 준비 완료 표시는 해제된 상태로 와요"
          : "이름만 먼저 저장하고 재료는 메뉴 안에서 추가할 수 있어요"}
        submit={recipeSheetStep === "지난 여행" ? "닫기" : editingRecipe ? "저장" : "요리 추가"}
        disabledHint={recipeSheetStep === "직접" && !recipeFormValid
          ? duplicateRecipe
            ? "이미 추가한 요리예요"
            : !recipeUrlValid
              ? "레시피 링크를 확인해 주세요"
              : "요리 이름을 입력해 주세요"
          : undefined}
        submitDisabled={recipeSheetStep === "직접" && !recipeFormValid}
        destructiveLabel={editingRecipe ? "요리 삭제" : undefined}
        destructiveMessage={editingRecipe ? `${recipeName || "이 요리"}${josa(recipeName || "이 요리", "과", "와")} 재료 목록을 함께 삭제해요.` : undefined}
        hasUnsavedChanges={recipeDraftChanged}
        onClose={closeRecipeSheet}
        onSubmit={recipeSheetStep === "지난 여행" ? closeRecipeSheet : addRecipe}
        onDestructive={deleteRecipe}
      >
        {recipeSheetStep === "지난 여행" ? (
          <PastTripList
            theme={theme}
            label="요리"
            mode="하나"
            groups={pastRecipes.groups}
            loading={pastRecipes.loading}
            error={pastRecipes.error}
            onRetry={pastRecipes.reload}
            onBack={() => setRecipeSheetStep("직접")}
            onPress={takePastRecipe}
            meta={(row) => [`재료 ${row.ingredients.length}개`, 요리메모_읽기(row.note)].filter(Boolean).join(" · ")}
            footnote="담당은 이번 여행 참가자만 유지되고 나머지는 ‘미정’이 돼요."
          />
        ) : (<>
        {!editingRecipe && spaceId && tripId && (
          <PastTripEntry
            theme={theme}
            hint="전에 해 먹은 요리를 재료까지 그대로 불러와요."
            onPress={() => setRecipeSheetStep("지난 여행")}
          />
        )}
        {!editingRecipe && <View
          style={[
            styles.aiRecipeCallout,
            theme && {
              backgroundColor: theme.surfaceAlt,
              borderColor: theme.border,
            },
          ]}
        >
          <View style={styles.aiRecipeCopy}>
            <Text style={[styles.aiRecipeTitle, theme && { color: theme.text }]}>여러 요리를 한 번에 추가</Text>
            <Text style={[styles.aiRecipeText, theme && { color: theme.muted }]}>ChatGPT가 정리한 요리와 재료를 붙여넣을 수 있어요.</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              // 요리 추가 시트와 ChatGPT 시트는 형제 Modal 이다. 같은 프레임에 하나를 닫고
              // 하나를 열면 iOS 가 뒤엣것을 세우지 못해 아무 일도 없는 것처럼 보였다.
              // 먼저 닫고, 내려가는 시간을 준 뒤 연다(교통편 수정과 같은 처방).
              setAddingRecipe(false);
              setTimeout(() => setAiImporting(true), Platform.OS === "ios" ? 380 : 0);
            }}
            style={[공용스타일.aiRecipeButton, theme && { backgroundColor: theme.primarySoft }]}
          >
            <Text style={[공용스타일.aiRecipeButtonText, theme && { color: theme.primary }]}>ChatGPT로 추가</Text>
          </Pressable>
        </View>}
        <DetailField
          label="요리 이름"
          required
          value={recipeName}
          onChangeText={setRecipeName}
          placeholder="예: 김치볶음밥"
          returnKeyType="done"
          onSubmitEditing={() => recipeFormValid && addRecipe()}
        />
        <OptionalFormSection
          label="메모 · 레시피 링크"
          summary={[recipeNote.trim() && "메모", recipeUrl.trim() && "링크"].filter(Boolean).join(" · ") || undefined}
          open={recipeExtrasOpen}
          onToggle={() => setRecipeExtrasOpen((current) => !current)}
        >
          <DetailField
            label="메모 (선택)"
            value={recipeNote}
            onChangeText={setRecipeNote}
            placeholder="예: 둘째 날 아침 · 남은 재료 활용"
            returnKeyType="next"
            onSubmitEditing={() => recipeUrlRef.current?.focus()}
          />
          <DetailField
            label="레시피 링크 (선택)"
            value={recipeUrl}
            onChangeText={setRecipeUrl}
            placeholder="예: https://youtu.be/…"
            maxLength={2048}
            autoComplete="url"
            textContentType="URL"
            inputRef={recipeUrlRef}
            returnKeyType="done"
            onSubmitEditing={() => recipeFormValid && addRecipe()}
          />
        </OptionalFormSection>
        </>)}
      </DetailSheet>
      <DetailSheet
        visible={aiImporting}
        title="ChatGPT로 여러 요리 추가"
        subtitle="프롬프트를 복사해 ChatGPT에 물어보고 돌아와 답을 붙여넣으면 돼요"
        submit={
          aiParsed.length
            ? `요리 ${aiParsed.length}개 추가`
            : "요리 추가"
        }
        disabledHint={!aiParsed.length ? (aiResult.trim() ? "읽을 수 있는 줄이 없어요" : "ChatGPT 답을 붙여넣어 주세요") : undefined}
        submitDisabled={!aiParsed.length}
        hasUnsavedChanges={aiDraftChanged}
        onClose={() => setAiImporting(false)}
        onSubmit={importAiRecipes}
      >
        <View
          style={[
            styles.aiPromptBox,
            theme && {
              backgroundColor: theme.surfaceAlt,
              borderColor: theme.border,
            },
          ]}
        >
          <View style={styles.aiPromptHead}>
            <View style={styles.aiRecipeCopy}>
              <Text style={[styles.aiRecipeTitle, theme && { color: theme.text }]}>1. 프롬프트 복사하고 ChatGPT 열기</Text>
              <Text style={[styles.aiRecipeText, theme && { color: theme.muted }]}>ChatGPT에 붙여넣고 그 아래에 요리와 재료 메모를 적어 주세요.</Text>
            </View>
            <Pressable
              onPress={copyPromptAndOpenGpt}
              accessibilityRole="button"
              accessibilityLabel="프롬프트를 복사하고 ChatGPT 열기"
              style={styles.aiPromptCopyButton}
            >
              <Text style={styles.aiPromptCopyText}>복사하고 열기</Text>
            </Pressable>
          </View>
          <Text numberOfLines={4} style={[styles.aiPromptPreview, theme && { color: theme.muted }]}>{cookingPrompt}</Text>
          {/* 브라우저가 안 열리는 기기도 있다. 복사만 하는 길을 남긴다. */}
          <Pressable
            onPress={copyCookingPrompt}
            accessibilityRole="button"
            style={styles.aiPromptCopyOnly}
          >
            <Text style={[styles.aiRecipeText, theme && { color: theme.primary }]}>복사만 하기</Text>
          </Pressable>
        </View>
        <View style={styles.aiPasteRow}>
          <View>
            <Text style={[styles.aiRecipeTitle, theme && { color: theme.text }]}>2. 돌아와서 결과 붙여넣기</Text>
            <Text style={[styles.aiRecipeText, theme && { color: theme.muted }]}>ChatGPT 답을 복사한 뒤 이 버튼을 눌러 주세요.</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={pasteAiResult}
            style={[공용스타일.aiRecipeButton, theme && { backgroundColor: theme.primarySoft }]}
          >
            <Text style={[공용스타일.aiRecipeButtonText, theme && { color: theme.primary }]}>붙여넣기</Text>
          </Pressable>
        </View>
        <DetailField
          label="붙여넣은 결과"
          value={aiResult}
          onChangeText={setAiResult}
          multiline
          maxLength={붙여넣기_한도}
          placeholder={"요리 | 김치볶음밥 | 둘째 날 아침 | https://youtu.be/...\n재료 | 김치 | 1컵 | 기본 | 구매"}
        />
        {/* 읽힌 결과를 넣기 전에 보여준다. 형식이 어긋나면 여기서 바로 안다. */}
        <Text
          accessibilityLiveRegion="polite"
          style={[공용스타일.settingHint, theme && { color: aiResult.trim() && !aiParsed.length ? theme.accent : theme.muted }]}
        >
          {aiReadNotice || "여러 요리와 각 재료가 한 번에 추가돼요."}
        </Text>
      </DetailSheet>
      <DetailSheet
        visible={importing}
        title="요리 목록 붙여넣기"
        subtitle="메모에서 고친 목록을 한 번에 반영해요"
        submit={importMode === "교체" ? "목록 교체" : "목록에 추가"}
        confirmSubmit={
          importMode === "교체" && recipes.length
            ? `저장한 요리 ${recipes.length}개를 삭제하고 붙여넣은 목록으로 바꿔요. 되돌릴 수 없어요.`
            : undefined
        }
        disabledHint={!importText.trim() ? "목록을 입력해 주세요" : undefined}
        submitDisabled={!importText.trim()}
        hasUnsavedChanges={cookingImportChanged}
        onClose={() => setImporting(false)}
        onSubmit={importCooking}
      >
        <DetailField
          label="붙여넣을 재료 목록"
          required
          value={importText}
          onChangeText={setImportText}
          multiline
          maxLength={붙여넣기_한도}
          placeholder="한 줄에 재료 하나씩"
        />
        <OptionField
          label="목록 반영 방법"
          options={["교체", "추가"]}
          value={importMode}
          onChange={(value) => setImportMode(value as "교체" | "추가")}
        />
      </DetailSheet>
    </View>
  );
}

/**
 * 기록 탭 격자 위의 필터.
 *
 * 사진과 꾸미는 중인 추억 카드(초안)를 한 격자에 놓았다. 완성한 카드는 사진이 되어
 * 사진 칸에 섞이고, 아직 꾸미는 중인 것만 「꾸미는 중」 표를 달고 선다. 카드만 아래에
 * 따로 두면 같은 여행을 두 군데서 훑게 된다. 대신 종류별로 보고 싶을 때가 있어
 * 격자 위에 이 세 칩을 둔다. 「카드」 칩은 꾸미는 중인 것만 보여 준다.
 *
 * 개수는 이 칩들이 든다. 머리에 세 줄이나 더 얹어 같은 것을 세 번 세던 자리를
 * 없앴다(`memoryFilter.ts`).
 */

/** 초안이 아직 오지 않았을 때. 렌더마다 새 배열을 만들면 격자가 매번 다시 계산된다. */

const styles = StyleSheet.create({
  placeAddText: { fontSize: 12, fontFamily: typo.label.family },
  shoppingCost: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 모서리.구역, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 16 },
  shoppingCostCopy: { flex: 1, minWidth: 0 },
  shoppingCostTitle: { fontSize: 13, fontFamily: typo.title.family },
  shoppingCostHint: { fontSize: 11, marginTop: 2, fontFamily: typo.caption.family },
  shoppingCostInput: { width: 92, borderWidth: 1, borderRadius: 모서리.행, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, textAlign: "right", fontFamily: typo.data.family },
  shoppingCostButton: { borderRadius: 모서리.행, paddingHorizontal: 14, paddingVertical: 9 },
  shoppingCostButtonText: { color: "#FFFFFF", fontSize: 13, fontFamily: typo.label.family },
  inlineMore: { flexDirection: "row", alignItems: "center", gap: 3 },
  cookV2Hero: { borderWidth: 1, overflow: "hidden" },
  cookV2ProgressBadge: {
    width: 64,
    minHeight: 58,
    borderRadius: 모서리.구역,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
  },
  cookV2ProgressBadgeValue: { fontSize: 18, lineHeight: 22, fontFamily: typo.data.family },
  cookV2ProgressBadgeLabel: { fontSize: 12, fontFamily: typo.label.family, marginTop: 2 },
  recipeSelector: { marginBottom: 12 },
  recipeSelectorHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  recipeSelectorTitle: { fontSize: 14, fontFamily: typo.title.family },
  recipeSelectorActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  recipeSelectorMore: { fontSize: 14, fontFamily: typo.label.family },
  cookV2MenuList: { gap: 8, paddingRight: 12 },
  cookV2MenuCard: {
    width: 124,
    minHeight: 56,
    borderWidth: 1,
    borderRadius: 모서리.행,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  cookV2MenuTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  cookV2MenuNumber: { fontSize: 14, fontFamily: typo.data.family, letterSpacing: 0.5 },
  cookV2MenuCount: { fontSize: 14, fontFamily: typo.data.family },
  cookV2MenuName: { fontSize: 14, fontFamily: typo.title.family },
  recipeList: {
    borderRadius: 모서리.행,
    borderWidth: 1,
    borderColor: "#E5DED6",
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  recipeListRow: {
    minHeight: 53,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  recipeListRowBorder: { borderTopWidth: 1, borderTopColor: "#EEEAE5" },
  recipeListNumber: {
    width: 27,
    height: 27,
    borderRadius: 모서리.상자,
    backgroundColor: "#F6F2ED",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  recipeListNumberText: { fontSize: 14, fontFamily: typo.data.family },
  recipeListCopy: { flex: 1, minWidth: 0 },
  recipeListName: { fontSize: 14, fontFamily: typo.title.family },
  recipeListNote: { fontSize: 14, fontFamily: typo.body.family, marginTop: 2 },
  recipeListCount: { fontSize: 14, fontFamily: typo.data.family, marginLeft: 8 },
  myCookingBox: {
    borderRadius: 모서리.행,
    borderWidth: 1,
    borderColor: "#E5DED6",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 12,
  },
  myCookingTitle: { fontSize: 14, fontFamily: typo.title.family },
  myCookingSummary: { fontSize: 12, fontFamily: typo.label.family, marginTop: 2 },
  myCookingCompact: { flexDirection: "row", alignItems: "center" },
  myCookingIcon: {
    width: 32,
    height: 32,
    borderRadius: 모서리.행,
    backgroundColor: "#F0EDFF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  cookV2MemoLine: {
    height: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  cookV2MemoDot: { width: 3, height: 3, borderRadius: 모서리.원 },
  cookV2MemoRule: { width: 15, height: 1.5, borderRadius: 모서리.원, opacity: 0.5 },
  cookV2MemoRuleShort: { width: 10 },
  cookV2MyEyebrow: { fontSize: 12, fontFamily: typo.label.family, letterSpacing: 0.5, marginBottom: 2 },
  myCookingCopy: { flex: 1, minWidth: 0 },
  myIngredientGroup: {
    borderRadius: 모서리.행,
    borderWidth: 1,
    borderColor: "#E5DED6",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  myIngredientGroupHead: {
    minHeight: 43,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  myIngredientGroupTitle: { fontSize: 14, fontFamily: typo.title.family },
  myIngredientGroupCount: { fontSize: 14, fontFamily: typo.data.family },
  myIngredientRow: {
    minHeight: 38,
    borderTopWidth: 1,
    borderTopColor: "#EEEAE5",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  myIngredientName: { flex: 1, minWidth: 0, fontSize: 14, fontFamily: typo.title.family },
  myIngredientQuantity: { flexShrink: 0, marginLeft: 8, fontSize: 14, fontFamily: typo.data.family },
  aiRecipeCallout: {
    borderRadius: 모서리.행,
    borderWidth: 1,
    borderColor: "#E5DED6",
    backgroundColor: "#F6F2ED",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  aiRecipeCopy: { flex: 1, paddingRight: 8 },
  aiRecipeTitle: { fontSize: 14, fontFamily: typo.title.family },
  aiRecipeText: { fontSize: 12, fontFamily: typo.label.family, lineHeight: 15, marginTop: 2 },
  aiPromptBox: {
    borderRadius: 모서리.행,
    borderWidth: 1,
    borderColor: "#E5DED6",
    backgroundColor: "#F6F2ED",
    padding: 12,
    marginBottom: 16,
  },
  aiPromptHead: { flexDirection: "row", alignItems: "center" },
  aiPromptCopyButton: {
    borderRadius: 모서리.상자,
    backgroundColor: "#17233D",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  aiPromptCopyOnly: { alignSelf: "flex-start", marginTop: 8, paddingVertical: 4 },
  aiPromptCopyText: { color: "#FFFFFF", fontSize: 14, fontFamily: typo.body.family },
  aiPromptPreview: {
    fontSize: 11,
    fontFamily: typo.caption.family,
    lineHeight: 13,
    marginTop: 8,
  },
  aiPasteRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  cookingNote: { fontSize: 14, marginTop: 4 },
  recipeLink: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 8,
    paddingVertical: 4,
  },
  recipeLinkText: { fontSize: 14, fontFamily: typo.label.family },
  cookingEyebrow: {
    fontSize: 12,
    fontFamily: typo.label.family,
    marginBottom: 4,
  },
  cookingHeroCopy: { flex: 1, paddingRight: 12 },
  cookingHeroActions: { alignItems: "center", gap: 6 },
  cookingMoreButton: {
    width: 30,
    height: 24,
    borderRadius: 모서리.상자,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  cookingTitle: {
    fontSize: 24,
    lineHeight: 34,
    fontFamily: typo.title.family,
    letterSpacing: -0.5,
  },
  cookingToolbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cookingTip: { fontSize: 12 },
  cookingSectionTitle: {
    color: "#A16E35",
    fontSize: 14,
    fontFamily: typo.title.family,
    marginBottom: 6,
  },
  cookV2SectionHead: {
    minHeight: 높이.버튼,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cookV2SectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  cookV2SectionTitle: { marginBottom: 0 },
  cookV2SectionLabel: { borderRadius: 모서리.표식, paddingHorizontal: 6, paddingVertical: 4 },
  cookV2SectionLabelText: { fontSize: 12, fontFamily: typo.label.family },
  cookV2SectionActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  cookV2SectionCount: { fontSize: 14, fontFamily: typo.data.family },
  ingredientRow: {
    minHeight: 높이.버튼,
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#F2EEE9",
  },
  cookV2IngredientDone: { opacity: 불투명도.흐림 },
  cookV2IngredientNameDone: { textDecorationLine: "line-through" },
  ingredientBody: { flex: 1 },
  ingredientName: { fontSize: 14, fontFamily: typo.title.family },
  ingredientOwner: { fontSize: 12, marginTop: 2 },
  ingredientQuantity: { fontSize: 14, fontFamily: typo.data.family },
  placeAdd: { borderRadius: 모서리.상자, paddingHorizontal: 12, paddingVertical: 8 },
  cookingHero: {
    borderRadius: 모서리.상자,
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  cookingSection: {
    borderRadius: 모서리.행,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
});

/**
 * 옛 이름. `WarmTripDetail.tsx` 가 아직 이 이름으로 부른다.
 * 부르는 쪽을 새 이름으로 바꾸면 이 줄을 지운다.
 */
export { TripCooking as Cooking };
