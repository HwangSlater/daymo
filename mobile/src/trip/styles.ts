import { StyleSheet } from "react-native";
import { 높이, 모서리, 불투명도, 여백 } from "../theme/controls";
import { typo } from "../theme/typography";

/**
 * 여행 상세의 탭 여럿이 함께 쓰는 스타일.
 *
 * 한 탭만 쓰는 스타일은 그 탭 파일이 들고 있다. 두 곳 이상에서 쓰는 것만 여기 모아
 * 같은 모양이 파일마다 갈라지지 않게 한다.
 */
export const 공용스타일 = StyleSheet.create({
  controlPressed: { opacity: 불투명도.눌림, transform: [{ scale: 0.99 }] },
  /** 「＋ 무엇 추가」 한 줄. ＋ 는 쿠키런에 없는 글자라 Glyph 로 그린다. */
  더하기줄: { flexDirection: "row", alignItems: "center", gap: 4 },
  infoManageButton: { minHeight: 높이.칩, borderRadius: 모서리.버튼, alignItems: "center", justifyContent: "center", marginTop: 6 },
  infoManageButtonText: { fontSize: 14, fontFamily: typo.label.family },
  memoryPhotoImage: { position: "absolute", inset: 0, width: "100%", height: "100%" },
  // 홈 화면에 쓰는 중이라는 표시. 사진 위에 얹히니 밝은 사진에서도 읽히게 어둡게 깐다.
  coverBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    height: 18,
    paddingHorizontal: 6,
    borderRadius: 모서리.원,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "rgba(17,16,15,0.72)",
  },
  coverBadgeText: { fontSize: 11, color: "#FFFFFF", fontFamily: typo.label.family },
  fieldLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  fieldLabelDot: { width: 5, height: 5, borderRadius: 모서리.표식, marginRight: 6 },
  detailFieldLabel: {
    color: "#6F7888",
    fontSize: 12,
    fontFamily: typo.label.family,
    marginBottom: 0,
  },
  optionField: { marginBottom: 16 },
  optionChipActive: { backgroundColor: "#17233D", borderColor: "#17233D" },
  optionText: { fontSize: 12, fontFamily: typo.label.family },
  optionTextActive: { color: "#FFFFFF" },
  naverHead: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  naverLogo: {
    width: 30,
    height: 30,
    borderRadius: 모서리.상자,
    backgroundColor: "#03C75A",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  naverLogoText: { color: "#FFFFFF", fontSize: 16, fontFamily: typo.label.family },
  naverTitle: { color: "#184D36", fontSize: 14, fontFamily: typo.title.family },
  naverHint: { color: "#648172", fontSize: 11, marginTop: 2 },
  // 색은 부르는 쪽에서 `naverInk(dark)` 로 준다. 여기 고정하면 다크에서 4.0:1 로
  // 떨어져 AA 에 못 미쳤다.
  linkState: { fontSize: 14, fontFamily: typo.label.family, marginTop: 8 },
  tagEditor: { marginBottom: 16 },
  selectorLabel: { marginBottom: 8 },
  placeRecommendLabel: { fontSize: 12, fontFamily: typo.label.family, marginBottom: 6 },
  tagSuggestions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 8,
  },
  tagInput: {
    minHeight: 높이.입력,
    borderRadius: 모서리.버튼,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E0DA",
    fontSize: 12,
    paddingHorizontal: 12,
  },
  draftTags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  packingCardPressed: { opacity: 불투명도.눌림, transform: [{ scale: 0.99 }] },
  /** 체크 칸을 줄에서 띄우는 여백. 칸 자체는 `ui/CheckBox` 가 그린다. */
  체크칸: { marginRight: 8 },
  packingListTools: {
    borderTopWidth: 1,
    marginTop: 20,
    paddingTop: 12,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  packingListToolsCopy: { flex: 1 },
  packingListToolsTitle: { fontSize: 14, fontFamily: typo.title.family },
  packingListToolsHint: { fontSize: 11, fontFamily: typo.caption.family, marginTop: 2 },
  packingToolButton: {
    minWidth: 48,
    height: 높이.칩,
    borderWidth: 1,
    borderRadius: 모서리.버튼,
    alignItems: "center",
    justifyContent: "center",
  },
  packingToolButtonText: { fontSize: 14, fontFamily: typo.label.family },
  settingHint: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: -6,
    marginBottom: 16,
  },
  aiRecipeButton: {
    borderRadius: 모서리.상자,
    backgroundColor: "#F0EDFF",
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  aiRecipeButtonText: { fontSize: 14, fontFamily: typo.label.family },
  longPressHint: {
    fontSize: 13,
    textAlign: "center",
    marginTop: 2,
    marginBottom: 20,
  },
  sectionAction: { fontSize: 14, fontFamily: typo.label.family },
  sectionActionHit: { minHeight: 높이.버튼, justifyContent: "center", paddingLeft: 여백.가로좁게 },
  sectionActionRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  tabActionHeader: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
    marginBottom: 8,
  },
  tabActionTitleRow: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  tabActionCount: {
    fontSize: 12,
    fontFamily: typo.data.family,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 모서리.원,
    overflow: "hidden",
  },
  tabActionReadOnly: { flexShrink: 1, marginLeft: 12, fontSize: 12, textAlign: "right", fontFamily: typo.caption.family },
  sectionTitle: { fontSize: 18, lineHeight: 23, fontFamily: typo.title.family, letterSpacing: -0.5 },
});
