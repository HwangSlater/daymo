import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from "react-native";

import { Text } from "../AppText";
import { AppTheme } from "../theme";
import { 높이, 모서리, 불투명도, 누름여유 } from "../theme/controls";
import { typo } from "../theme/typography";

/** 세그먼트로 둘 수 있는 선택지 수. 이보다 많으면 칸이 좁아져 글자가 잘린다. 칩(`Chip`)으로 간다. */
export const 세그먼트_최대 = 5;

/** 값과 보이는 글이 다를 때만 객체로. 같으면 문자열 하나로 넘긴다. */
type SegmentOption = string | { value: string; label: string };

const optionValue = (option: SegmentOption) => (typeof option === "string" ? option : option.value);
const optionLabel = (option: SegmentOption) => (typeof option === "string" ? option : option.label);

/**
 * 한 줄짜리 고르기. **선택지가 다섯 개 이하면 이걸 쓴다.**
 *
 * 배경 있는 트랙 안에 같은 폭의 칸이 나란히 있고, 고른 칸만 흰 배경에 굵은 글씨다.
 * 날짜·종류·가는 편/오는 편·나누기 방식처럼 매번 고르는 것에 쓴다. 칩 줄(44)보다
 * 낮은 36 이라, 키보드가 올라와 시트가 좁아져도 주 입력 아래에 한두 줄이 들어간다.
 * 여섯 개부터는 칸이 좁아 글자가 잘리니 가로로 미는 `ChipRow` 로 간다.
 *
 *     <Segment theme={theme} label="종류" options={["방문", "식사", "이동"]}
 *       value={종류} onChange={set종류} />
 */
export function Segment({
  theme,
  options,
  value,
  onChange,
  label,
  disabled,
  style,
}: {
  theme?: AppTheme;
  options: SegmentOption[];
  value: string;
  onChange: (value: string) => void;
  /** 무엇을 고르는 줄인지. 화면에는 안 보이고 각 칸의 접근성 라벨 앞에 붙는다. */
  label?: string;
  /** 보기만 할 수 있는 화면. 고른 칸은 그대로 두고 흐리게만 해서 무엇이 골라져 있는지는 보인다. */
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={[styles.track, theme && { backgroundColor: theme.surfaceAlt }, disabled && styles.disabled, style]}
    >
      {options.map((option) => {
        const on = optionValue(option) === value;
        const text = optionLabel(option);
        return (
          <Pressable
            key={optionValue(option)}
            onPress={() => onChange(optionValue(option))}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{ checked: on, selected: on, disabled: Boolean(disabled) }}
            accessibilityLabel={label ? `${label} ${text}` : text}
            hitSlop={누름여유(높이.칩)}
            style={({ pressed }) => [
              styles.cell,
              on && styles.cellOn,
              on && theme && { backgroundColor: theme.surface },
              pressed && styles.pressed,
            ]}
          >
            <Text
              numberOfLines={1}
              style={[
                styles.text,
                theme && { color: theme.muted },
                on && styles.textOn,
                on && theme && { color: theme.text },
              ]}
            >
              {text}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// 트랙과 고른 칸 사이의 2px 은 controls 의 네 단계에 들어가지 않는다. 칸이 트랙에
// 딱 붙으면 고른 칸이 트랙 위에 얹힌 것이 아니라 트랙이 끊긴 것처럼 보인다.
const 트랙여유 = 2;

const styles = StyleSheet.create({
  track: {
    height: 높이.칩,
    borderRadius: 모서리.버튼,
    backgroundColor: "#EFEEE9",
    padding: 트랙여유,
    flexDirection: "row",
  },
  cell: {
    flex: 1,
    minWidth: 0,
    borderRadius: 모서리.버튼 - 트랙여유,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  cellOn: {
    backgroundColor: "#FFFFFF",
    // 얹힌 느낌은 그림자로만 낸다. 테두리를 주면 옆 칸과의 경계가 두 줄이 된다.
    shadowColor: "#17233D",
    shadowOpacity: 0.08,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  text: { fontSize: 13, fontFamily: typo.label.family, color: "#646C7A" },
  textOn: { fontFamily: typo.title.family, color: "#17233D" },
  pressed: { opacity: 불투명도.눌림 },
  disabled: { opacity: 불투명도.비활성 },
});
