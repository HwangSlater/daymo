# 공통 부품 목록

화면을 새로 만들기 전에 이 문서를 먼저 본다. 여기 있는 것을 다시 만들지 않는다.

## 왜 모으나

시트(아래에서 올라오는 창) 껍데기가 `WarmAppShell.tsx`·`WarmTripDetail.tsx`·`NoticeImportSheet.tsx` 세 파일에 통째로 복사돼 있었다. 이름이 같은 스타일만 15개(`sheet`·`sheetHandle`·`sheetHead`·`sheetTitle`·`sheetSubtitle`·`sheetClose`·`sheetScroll`·`modalBack` …)였다. 시트 머리를 두 줄에서 한 줄로 줄이는 작은 변경에 세 군데를 따로 고쳐야 했고, 한 곳을 빠뜨려 사용자가 "적용된 거야?" 라고 물었다. 그래서 껍데기를 `mobile/src/ui/` 로 옮겼다. 한곳을 고치면 쓰는 화면이 같이 바뀐다.

이 문서는 **이미 저장소에 있는데 몰라서 다시 만들기 쉬운 것**까지 함께 적는다.

부품에 적는 문구(용어·어미)는 [13-copy-glossary.md](13-copy-glossary.md) 를 따른다.

## 한눈에

| 부품 | 무엇을 하나 | 어디에 있나 | 언제 쓰나 |
| --- | --- | --- | --- |
| `SheetShell` | 아래에서 올라오는 창의 껍데기 전부. 덮개, 시트 상자, 끌어내려 닫기, 제목 줄, 본문 스크롤, 맨 아래 저장 버튼, 잠김 안내, 지우기 확인 | `mobile/src/ui/SheetShell.tsx` | 시트를 만들 때. 예외 없이 |
| `sheetHeadStyles` | 머리를 직접 그리는 시트가 나눠 쓰는 제목 스타일 | 같은 파일 | `SheetShell` 의 `renderHead` 로 머리를 갈아 끼울 때 |
| `submitLabelOf`·`sheetHintOf` | 시트 버튼 글과 그 위 한 줄을 고르는 순수 계산 | `mobile/src/ui/sheetText.ts` | 시트 글 규칙을 고칠 때. 시험은 `sheetText.test.ts` |
| `Chip`·`ChipRow` | 고르는 칩 하나와 칩 줄. 켜짐·꺼짐, 누름 느낌, 접근성 라벨까지 | `mobile/src/ui/Chip.tsx` | 여섯 개 이상 중에 고르게 할 때 |
| `Segment`·`세그먼트_최대` | 한 줄 세그먼트. 배경 있는 트랙(높이 `높이.칩`, 모서리 `모서리.버튼`) 안에 같은 폭 칸, 고른 것만 흰 배경에 굵게. 옵션은 문자열이나 `{ value, label }`, 접근성은 `radiogroup`/`radio` | `mobile/src/ui/Segment.tsx` | 선택지가 다섯 개 이하일 때(날짜·종류·방향·나누기 방식). 여섯 개부터는 `Chip` |
| `높이`·`모서리`·`여백`·`누름여유` | 누르는 것의 크기 토큰. 칩 36, 버튼 44, 입력 52, 저장 56 | `mobile/src/theme/controls.ts` | 스타일시트에 크기를 적을 때마다 |
| `typo`·`fonts`·`sizes` | 글자 역할(hero·title·data·label·body·caption)과 서체 | `mobile/src/theme/typography.ts` | `fontFamily`·`fontSize` 를 적을 때 |
| `onAccent`·`status`·`domain`·`kindColor`·`tripTone`·`memoPaper` | 색. 강조색 위 글자색, 위험·경고색, 갈래별 색을 라이트/다크 둘 다 AA 로 맞춰 둔 것 | `mobile/src/theme/colors.ts` | 색값을 적을 때마다 |
| `resolveTheme`·`themeOptions` | 테마 일곱 개를 라이트·다크로 푸는 곳 | `mobile/src/theme/index.ts` | 화면에 테마를 넘길 때 |
| `Text`·`TextInput` | 웹에서 입력 칸 글자를 16px 아래로 내리지 않는 래퍼(아이폰 사파리 확대 막기) | `mobile/src/AppText.tsx` | 글자와 입력 칸 전부. `react-native` 것을 바로 쓰지 않는다 |
| `Glyph`·`Dot` | 쿠키런에 없는 기호(화살표·체크·더하기 …)를 SVG 로 그린다 | `mobile/src/Glyph.tsx` | 기호가 필요할 때. 이모지·특수문자로 때우지 않는다 |
| `showAlert` | 묻고 답을 받는 창. 웹에서도 실제로 뜬다 | `mobile/src/showAlert.ts` | `Alert.alert` 을 쓰고 싶을 때마다 |
| `useSheetDrag` | 손잡이를 끌어내려 창을 닫는다. 작성 중이면 먼저 묻게 넘길 수 있다 | `mobile/src/sheetDrag.ts` | `SheetShell` 이 이미 쓴다. 직접 쓸 일은 거의 없다 |
| `useWebBackClose` | 웹에서 브라우저 뒤로 가기로 시트를 닫는다(페이지를 벗어나지 않게) | `mobile/src/useWebBackClose.ts` | `SheetShell` 이 이미 쓴다. 시트가 아닌 겹침 화면에는 직접 |
| `useWebKeyboardInset` | 웹에서 키보드가 가린 만큼 시트를 밀어 올린다 | `mobile/src/useWebKeyboardInset.ts` | 위와 같다 |
| `useListSync`·`reloadOpenLists`·`retryBlockedRows`·`useSyncTrouble` | 여행에 딸린 목록 하나를 서버와 맞춘다. 열 때 합치고, 바뀌면 보내고, 막힌 줄을 표시한다 | `mobile/src/useListSync.ts` | 목록을 서버에 붙일 때 |
| `planListSync`·`bodyKey`·`isServerId`·`listTrouble` | 위의 순수 계산 부분. react-native 를 가져오지 않아 `node --test` 로 바로 시험한다 | `mobile/src/listSync.ts` | 동기화 규칙을 고칠 때 |
| `apiQueue`·`onGiveUp`·`backoffMs` | 서버로 나가는 요청을 다섯 개씩 줄 세우고, 막히면 쉬었다 다시 보낸다 | `mobile/src/requestQueue.ts` | 새 API 를 부를 때. 줄 밖으로 새는 요청이 있으면 묶는 뜻이 없다 |
| `photoUploads`·`usePhotoUploads`·`photoUploadHeadline` | 사진 올리기 앱 전역 대기열. 화면을 나가도 계속 올라간다 | `mobile/src/photoUploads.ts` | 사진을 올릴 때 |
| `uploadPhoto`·`downloadPhoto`·`isLivePhotoUri` | 사진 파일을 실제로 보내고 받는다. 폰은 파일, 웹은 blob | `mobile/src/photoTransfer.ts` | 위 대기열이 부른다. 직접 부를 일은 드물다 |
| `savePhotoFile` | 받아 둔 사진을 사용자 기기에 저장한다(폰은 공유 시트, 웹은 내려받기) | `mobile/src/photoSave.ts` | 「저장」 버튼 |
| `SyncNotice`·`SyncMark` | 못 올린 줄이 있을 때 화면 위 한 줄과 줄 옆 표시 | `mobile/src/SyncMarks.tsx` | 서버와 맞추는 목록을 그리는 화면 |
| `MapLink` | 지도 링크 칩. 어느 지도 앱으로 열지까지 정해져 있다 | `mobile/src/MapLink.tsx` | 주소·장소를 보여 줄 때 |
| `ParticipantPicker` | 함께 가는 사람 고르기 | `mobile/src/ParticipantPicker.tsx` | 담당자·참가자를 고를 때 |
| `PastTripEntry`·`PastTripList` | 추가 시트 맨 위의 「지난 여행에서 가져오기」 진입 줄과, 시트 안에서 내용을 갈아 끼워 보이는 지난 여행 목록(여행별 묶음, 하나 고르기·여럿 체크). 열리면 키보드를 내린다 | `mobile/src/PastTripPicker.tsx` | 요리·준비물 추가 시트. 새 `Modal` 을 띄우지 않고 단계 상태로 갈아 끼운다 |
| `usePastPacking`·`usePastRecipes` | 같은 공간의 끝난 여행들을 받아 그 준비물·요리를 여행별로 묶는다. 처음 열 때 한 번 받고 둔다 | `mobile/src/usePastTripRows.ts` | 위 목록에 줄을 줄 때. 순수 계산(끝난 여행 고르기·담당 옮기기·완료 풀기)은 `pastTripImport.ts` |
| `TripDateRangePicker`·`formatTripRange` | 여행 기간 고르기와 `9월 22일 — 9월 24일 · 2박 3일` 표기 | `mobile/src/TripDateRangePicker.tsx` | 기간을 고르거나 적을 때 |
| `TripRegionPicker` | 지역 고르기 | `mobile/src/TripRegionPicker.tsx` | 여행지를 고를 때 |
| `SocialLoginButton` | 구글·카카오·네이버 버튼. 각 사의 표기 규정에 맞춰 둔 것 | `mobile/src/SocialLoginButton.tsx` | 로그인 화면 |
| `PaperPeel` | 종이를 넘기는 듯한 전환 | `mobile/src/PaperPeel.tsx` | 여행 카드를 넘길 때 |
| `EmptyState` | 아무것도 없을 때의 안내 상자와 만들기 버튼 | `mobile/src/WarmTripDetail.tsx` (같은 파일 안) | 빈 목록 |
| `SectionLabel`·`TabActionHeader` | 구역 제목 한 줄과, 제목 + 개수 + 오른쪽 동작 | `mobile/src/WarmTripDetail.tsx` (같은 파일 안) | 목록 위 제목 줄 |
| `OptionField` | 라벨 + 고르기. 선택지가 다섯 개 이하면 `Segment`, 여섯 개부터는 칩 줄로 스스로 고른다 | `mobile/src/WarmTripDetail.tsx` (같은 파일 안) | 시트 안에서 고르게 할 때 |
| `TimeRow` | 「시간  11:00 ›」 한 줄. 안드로이드는 눌러서 돌리는 창, 그 밖에서는 자리에서 친다 | `mobile/src/WarmTripDetail.tsx` (같은 파일 안) | 시트 안의 시각 칸 |
| `OptionalFormSection` | 매번 쓰지 않는 칸을 「＋ 장소 · 메모 더 적기」 한 줄 아래로 접는다. 고칠 때 값이 있으면 부르는 쪽이 펼친 채로 연다 | `mobile/src/WarmTripDetail.tsx` (같은 파일 안) | 시트의 선택 칸 |

마지막 여섯 줄은 아직 `WarmTripDetail.tsx` 안에 있다. 다른 화면에서 쓰게 되면 그때 `ui/` 로 옮긴다.

## 추가·수정 시트의 배치

2026-09-18 에 여행 화면의 시트를 한 규칙으로 맞췄다(시안 「2번 — 지금 구조 다듬기」). 위에서부터
**주 입력 → 세그먼트(최대 두 줄) → 한 줄 행(시간) → 더 적기 → 저장 버튼** 이다.

- 주 입력칸(이름·제목·항목)이 머리 바로 아래 첫째다. 미리보기 카드나 고르기 줄을 위에 두지 않는다. 키보드가 올라오면 시트가 좁아지는데(웹 300px 남짓) 첫째 칸이 보여야 적을 수 있다.
- 자주 고르는 것은 세그먼트 한 줄, 여섯 개부터는 칩 줄. `OptionField` 가 개수로 스스로 고른다.
- 시각처럼 값 하나인 칸은 `TimeRow` 한 줄.
- 매번 쓰지 않는 칸은 `OptionalFormSection` 으로 접는다. 필수 칸은 접지 않는다. 수정으로 열 때 그 칸에 값이 있으면 열어 둔다.
- 「지난 여행에서 가져오기」·지도 링크 붙여넣기 같은 **진입 상자**는 주 입력 위에 그대로 둔다. 입력이 아니라 다른 길로 가는 문이라서다.

## 쓰는 법

시트. 안에 들어갈 것만 넘긴다.

```tsx
<SheetShell theme={theme} visible={open} title="장소 추가"
  subtitle="이름만 있어도 저장돼요" submit="저장" onSubmit={save} onClose={close}>
  {칸들}
</SheetShell>
```

고칠 수 없는 사람에게 열거나, 저장이 곧 삭제이거나, 작성 중인 값이 있을 때.

```tsx
<SheetShell ... locked={!canEdit} lockedHint="보기만 할 수 있는 공간이에요"
  confirmSubmit="지금 목록은 사라져요" hasUnsavedChanges={dirty}
  destructiveLabel="이 장소 지우기" onDestructive={remove} />
```

칩.

```tsx
<ChipRow>
  {여행들.map((t) => <Chip key={t.id} theme={theme} label={t.name}
    on={t.id === 고른} onPress={() => 고르기(t.id)} />)}
</ChipRow>
```

크기와 색.

```tsx
import { 높이, 모서리, 여백, 누름여유 } from "./theme/controls";
저장: { height: 높이.저장, borderRadius: 모서리.버튼, paddingHorizontal: 여백.가로 },
<Pressable hitSlop={누름여유(높이.칩)} />
```

묻는 창.

```tsx
import { showAlert } from "./showAlert";
showAlert("지울까요?", "되돌릴 수 없어요", [
  { text: "취소", style: "cancel" },
  { text: "지우기", style: "destructive", onPress: remove },
]);
```

## 하지 말 것

- **시트를 `Modal` 부터 짜지 않는다.** 껍데기를 또 복사하면 다음 변경 때 고칠 자리가 하나 더 는다. 실제로 그렇게 한 곳을 빠뜨렸다. `ui/SheetShell` 을 쓰고, 모자란 것이 있으면 부품에 prop 을 뚫는다.
- **높이·모서리·여백 숫자를 스타일시트에 직접 적지 않는다.** 한 화면 안에 38·39·40·42·43·44 가 나란히 놓였던 적이 있다. 그 6px 차이에는 아무 뜻이 없었고 고칠 때 몇 군데를 고쳐야 하는지 알 수 없었다. `theme/controls.ts` 의 네 단계를 쓴다. 정말 달라야 하는 자리는 스타일 옆에 왜 다른지 적는다.
- **웹에서 `Alert.alert` 를 쓰지 않는다.** react-native-web 의 `Alert` 은 아무 일도 하지 않는 빈 함수다. 브라우저에서 「삭제」를 눌러도 확인창이 없고 아무 일도 일어나지 않는다. `showAlert` 을 쓴다.
- **`react-native` 의 `Text`·`TextInput` 을 바로 가져오지 않는다.** 아이폰 사파리는 16px 보다 작은 입력 칸에 포커스하면 화면을 통째로 확대하고 그대로 남는다. `AppText` 의 것을 쓴다.
- **화살표·체크를 이모지나 특수문자로 적지 않는다.** 쿠키런에 그 글리프가 없어 시스템 폰트로 떨어지고 플랫폼마다 모양이 달라진다. `Glyph` 를 쓴다.
- **색을 직접 적지 않는다.** 강조색 위 글자색은 라이트와 다크가 서로 달라야 대비가 나온다(`onAccent(dark)`). 위험·경고색도 `theme/colors.ts` 의 것을 쓴다.
- **`fetch` 를 줄(`apiQueue`) 밖에서 부르지 않는다.** 앞단(nginx)의 초당 제한에 걸려 몇 개가 429 로 떨어지고, 브라우저에서는 그냥 연결 오류로 보여 화면이 까닭 없이 빈다.
- **부품에서 차이를 지우지 않는다.** 잠김 안내, 저장 재확인, 보기 전용 문구처럼 한 화면만 쓰는 것도 기능이다. 없애지 말고 prop 으로 받는다.

## 아직 옮기지 않은 복사본

시트 껍데기는 다 옮겼다. `WarmTripDetail.tsx` 의 `DetailSheet` 와 `InfoPanel` 도 `SheetShell` 을 쓴다. 두 곳은 이제 이 화면에만 있는 것만 얹는다.

- `DetailSheet` — 공간 권한으로 잠글지 정하고(저장 버튼이 이미 「닫기」인 둘러보는 시트는 빼고), 잠긴 시트 안의 칸까지 흐려지도록 `DetailEditableContext` 를 시트 안에서 다시 내리고, 제목으로 색 막대 색을 고른다. 나머지(잠김 안내·저장 재확인·지우기 확인·작성 중 닫기 확인·기다리는 동안의 버튼 글)는 전부 부품의 prop 으로 넘어갔고 새로 뚫은 prop 은 없다.
- `InfoPanel` — 머리에 저장 버튼 대신 「완료」가 있어 `renderHead` 로 머리만 갈아 끼운다. `WarmAppShell` 의 `InfoSheet` 와 같은 방식이다.

옮기면서 뜻 없이 달랐던 두 값은 부품 쪽에 맞췄다. 머리 아래 여백 20 → 16, 닫기 버튼의 `marginLeft: 8` 제거. 그만큼 시트 내용이 4px 위로 올라간다. 그 둘만 앞 모습에 맞춰 두고 찍으면 장소·일정·숙소·교통편·예약·지출·잠김·지우기 확인·저장 재확인·정보 패널 두 개, 열한 화면이 0픽셀로 같다.

`CardDecorEditor.tsx` 와 `PhotoViewer.tsx` 의 칩은 아직 따로 있다. 둘은 사진 위에 얹는 어두운 칩이라 테마를 따르지 않는다. `Chip` 의 `colors` 로 받을 수 있다. 남은 복사본은 이 둘뿐이다.
