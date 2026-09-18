/**
 * 시각 고르기. 시와 분을 돌려 고르고, 숫자를 누르면 그 자리에서 칠 수도 있다.
 *
 * **떠 있는 창이 아니라 줄 아래에서 펼쳐진다.** 시각을 적는 칸은 거의 다 추가·수정
 * 시트 안에 있는데, 아이폰은 떠 있는 창 위에 창을 하나 더 얹지 못한다(사진 정보와
 * ChatGPT 시트가 안 뜨던 그 문제). 그래서 애플이 「인라인」이라 부르는 방식을 쓴다.
 *
 * 왜 이렇게 만들었나(2026-09-18 시장 조사):
 * - 시각을 자유롭게 정하는 앱은 **돌려 고르기 + 눌러서 치기**를 함께 둔다. 아이폰은
 *   15부터 돌림판을 되살리고 숫자를 누르면 키패드가 뜨고, 안드로이드 머티리얼은
 *   시계판에 키보드 전환 단추를 둔다. 당근도 자체 부품이 휠이다.
 * - 키패드만 주는 곳은 한 곳도 못 찾았다. 예전 Daymo 의 아이폰·웹이 그랬다.
 * - 분은 **5분 눈금**이 관행이다(당근 기본값, 카카오톡 예약 메시지). 애플 지침도
 *   「60을 나누어떨어지는 선에서 분 간격을 늘려도 된다」고 적는다. 다만 기차처럼
 *   19:44 도 있어서, 지금 값이 5의 배수가 아니면 그 분도 목록에 끼워 넣는다.
 * - 시각은 24시간으로 둔다. 앱의 다른 곳(카드·목록)이 모두 24시간이라 여기만
 *   오전·오후로 두면 같은 시각이 두 가지로 보인다.
 */
import { useEffect, useRef, useState } from "react";
import { NativeScrollEvent, NativeSyntheticEvent, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";

import { Text } from "../AppText";
import { maskClockTime, settleClockTime } from "../clock";
import { AppTheme } from "../theme";
import { 높이, 모서리 } from "../theme/controls";
import { typo } from "../theme/typography";

/** 한 칸 높이. 가운데 한 칸과 위아래로 두 칸씩 보인다. */
const 칸 = 38;
const 보이는_칸 = 5;
const 통_높이 = 칸 * 보이는_칸;

const 시_목록 = Array.from({ length: 24 }, (_, i) => i);
const 기본_분 = Array.from({ length: 12 }, (_, i) => i * 5);

/** 지금 분이 5의 배수가 아니면(19:44 같은 기차 시각) 그 분도 끼워 넣는다. */
const 분_목록 = (지금: number) =>
  기본_분.includes(지금) ? 기본_분 : [...기본_분, 지금].sort((a, b) => a - b);

/** 웹에서만 뜻이 있는 스타일. 기기에서는 무시된다. */
const 굴림_가두기 = Platform.OS === "web" ? ({ overscrollBehavior: "contain" } as object) : null;

const 두자리 = (n: number) => String(n).padStart(2, "0");
const 시각_읽기 = (value: string, fallback: string) => {
  const [h, m] = (value || fallback).split(":").map(Number);
  return {
    시: Number.isFinite(h) ? Math.min(23, Math.max(0, h)) : 12,
    분: Number.isFinite(m) ? Math.min(59, Math.max(0, m)) : 0,
  };
};

function WheelColumn({
  theme,
  label,
  values,
  value,
  onChange,
}: {
  theme?: AppTheme;
  label: string;
  values: number[];
  value: number;
  onChange: (value: number) => void;
}) {
  const ref = useRef<ScrollView>(null);
  const 고른칸 = Math.max(0, values.indexOf(value));
  // 손가락이 닿아 있는 동안에는 밖에서 자리를 옮기지 않는다. 옮기면 돌리는 중에
  // 스크롤이 되돌아가 손 아래에서 숫자가 튄다.
  const 돌리는중 = useRef(false);
  const 멈춤_시계 = useRef<ReturnType<typeof setTimeout> | null>(null);
  const 마지막_자리 = useRef(고른칸);
  const 자리로 = (자리: number, 부드럽게: boolean) =>
    ref.current?.scrollTo({ y: 자리 * 칸, animated: 부드럽게 });
  // 밖에서 값이 바뀌면(숫자를 쳐서 고쳤을 때) 그 자리로 옮겨 준다.
  useEffect(() => {
    if (돌리는중.current) return;
    마지막_자리.current = 고른칸;
    자리로(고른칸, false);
  }, [고른칸]);
  useEffect(() => () => {
    if (멈춤_시계.current) clearTimeout(멈춤_시계.current);
  }, []);
  /**
   * 돌리는 내내 값을 바꾼다. 멈춘 뒤에만 바꾸면 칸과 칸 사이에 선 채로 위의 큰
   * 숫자가 그대로라 「안 고쳐졌다」로 보였다. 웹은 스냅이 걸리지 않아 더 그렇다.
   * 손을 뗀 뒤에는 가까운 칸에 딱 맞춰 세운다.
   */
  const 돌아가는중 = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    돌리는중.current = true;
    const 자리 = Math.min(values.length - 1, Math.max(0, Math.round(event.nativeEvent.contentOffset.y / 칸)));
    마지막_자리.current = 자리;
    const 다음 = values[자리];
    if (다음 !== undefined && 다음 !== value) onChange(다음);
    if (멈춤_시계.current) clearTimeout(멈춤_시계.current);
    멈춤_시계.current = setTimeout(() => {
      돌리는중.current = false;
      자리로(마지막_자리.current, true);
    }, 140);
  };
  return (
    <View style={styles.column}>
      <ScrollView
        ref={ref}
        // 안드로이드는 이 줄이 없으면 바깥 시트가 손가락을 먼저 가져간다.
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={칸}
        decelerationRate="fast"
        scrollEventThrottle={16}
        onScroll={돌아가는중}
        // 처음 그릴 때 이미 적힌 시각이 가운데 오게 한다. 자리를 잡기 전에 옮기면
        // 아무 일도 일어나지 않아서, 높이가 정해진 뒤에 한 번 더 맞춘다.
        onLayout={() => 자리로(고른칸, false)}
        contentContainerStyle={{ paddingVertical: (통_높이 - 칸) / 2 }}
        // 웹: 칸의 끝에 닿아도 시트로 굴림이 넘어가지 않게 막는다.
        style={[{ height: 통_높이 }, 굴림_가두기]}
      >
        {values.map((item) => {
          const 골랐나 = item === value;
          return (
            <Pressable
              key={item}
              onPress={() => onChange(item)}
              accessibilityRole="radio"
              accessibilityState={{ selected: 골랐나 }}
              accessibilityLabel={`${label} ${item}`}
              style={styles.cell}
            >
              <Text
                style={[
                  styles.cellText,
                  theme && { color: theme.muted },
                  골랐나 && styles.cellTextOn,
                  골랐나 && theme && { color: theme.text },
                ]}
              >
                {두자리(item)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export function TimeWheel({
  theme,
  value,
  fallback,
  optional = false,
  label,
  onChange,
}: {
  theme?: AppTheme;
  /** 「HH:MM」. 비어 있으면 시간 미정이다. */
  value: string;
  /** 비어 있을 때 돌림칸이 처음 가리킬 시각. */
  fallback: string;
  /** 「시간 미정」으로 비울 수 있는 칸인지. */
  optional?: boolean;
  label: string;
  onChange: (value: string) => void;
}) {
  const [치는중, set치는중] = useState(false);
  const [친_글자, set친_글자] = useState(value);
  const { 시, 분 } = 시각_읽기(value, fallback);
  const 맞추기 = (다음시: number, 다음분: number) => onChange(`${두자리(다음시)}:${두자리(다음분)}`);
  return (
    <View style={[styles.box, theme && { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
      <View style={styles.head}>
        {치는중 ? (
          <TextInput
            autoFocus
            accessibilityLabel={`${label} 직접 입력`}
            value={친_글자}
            onChangeText={(text) => {
              const 다듬은 = maskClockTime(text);
              set친_글자(다듬은);
              if (/^\d{2}:\d{2}$/.test(다듬은)) onChange(다듬은);
            }}
            onBlur={() => {
              set치는중(false);
              // 아무것도 안 치고 나가면 고치려던 게 아니다. 있던 시각을 그대로 둔다.
              if (친_글자.trim()) onChange(settleClockTime(친_글자));
            }}
            keyboardType="numeric"
            maxLength={5}
            placeholder={value || fallback}
            placeholderTextColor={theme?.muted ?? "#9AA1AE"}
            style={[styles.typed, theme && { color: theme.text, borderColor: theme.primary }]}
          />
        ) : (
          <Pressable
            onPress={() => {
              // 빈 칸으로 연다. 「11:15」가 그대로 들어 있으면 다섯 자리가 꽉 차서
              // 한 글자도 더 칠 수 없었다. 있던 시각은 흐린 글씨로 남겨 둔다.
              set친_글자("");
              set치는중(true);
            }}
            accessibilityRole="button"
            accessibilityLabel={`${label} 직접 입력, 지금 ${value || "시간 미정"}`}
            style={({ pressed }) => [styles.big, pressed && styles.pressed]}
          >
            <Text style={[styles.bigText, theme && { color: value ? theme.text : theme.muted }]}>
              {value || "시간 미정"}
            </Text>
            <Text style={[styles.bigHint, theme && { color: theme.muted }]}>눌러서 직접 입력</Text>
          </Pressable>
        )}
        {optional && (
          <Pressable
            onPress={() => onChange("")}
            accessibilityRole="button"
            accessibilityLabel={`${label} 시간 미정으로 두기`}
            style={({ pressed }) => [
              styles.clear,
              theme && { backgroundColor: theme.surface, borderColor: theme.border },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.clearText, theme && { color: theme.muted }]}>시간 미정</Text>
          </Pressable>
        )}
      </View>
      {/* 두 칸이 상자를 반씩 나눠 가진다. 숫자 폭(74)만 손가락을 받던 때에는
          조금만 빗나가도 시트가 대신 움직였다. 가운뎃점은 띄워 두어 손가락을
          먹지 않는다. */}
      <View style={styles.wheels}>
        {/* 가운데 한 칸을 띠로 덮어 「여기가 고른 것」임을 보인다. */}
        <View pointerEvents="none" style={[styles.band, theme && { backgroundColor: theme.primarySoft }]} />
        <WheelColumn theme={theme} label="시" values={시_목록} value={시} onChange={(다음) => 맞추기(다음, 분)} />
        <WheelColumn theme={theme} label="분" values={분_목록(분)} value={분} onChange={(다음) => 맞추기(시, 다음)} />
        <Text pointerEvents="none" style={[styles.colon, theme && { color: theme.muted }]}>:</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: 모서리.버튼, paddingHorizontal: 12, paddingBottom: 10, marginBottom: 12 },
  head: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 10 },
  big: { flex: 1, minWidth: 0 },
  bigText: { fontSize: 26, fontFamily: typo.data.family, letterSpacing: 0.5 },
  bigHint: { fontSize: 11, fontFamily: typo.body.family, marginTop: 1 },
  typed: {
    flex: 1,
    minWidth: 0,
    height: 높이.버튼,
    borderBottomWidth: 2,
    fontSize: 26,
    fontFamily: typo.data.family,
    paddingHorizontal: 0,
  },
  clear: { height: 높이.칩, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" },
  clearText: { fontSize: 12.5, fontFamily: typo.label.family },
  wheels: { flexDirection: "row", alignItems: "center", marginTop: 6 },
  band: { position: "absolute", left: 0, right: 0, top: (통_높이 - 칸) / 2, height: 칸, borderRadius: 10 },
  column: { flex: 1 },
  cell: { height: 칸, alignItems: "center", justifyContent: "center" },
  cellText: { fontSize: 18, fontFamily: typo.data.family },
  cellTextOn: { fontSize: 22 },
  colon: {
    position: "absolute",
    left: 0,
    right: 0,
    top: (통_높이 - 칸) / 2,
    height: 칸,
    textAlign: "center",
    lineHeight: 칸,
    fontSize: 18,
    fontFamily: typo.data.family,
  },
  pressed: { opacity: 0.7 },
});
