/**
 * 카드에 놓이는 사진 차례 줄. 꾸미기 도구 「사진」 시트(`CardDecorEditor.tsx`)가 쓴다.
 *
 * 카드의 사진 칸(`KeepsakeCardView` 의 SwapCell)과 같게, 꾹 누르면 들려 흔들리고 옆으로 끌면
 * 따라온다. 지나가는 자리의 사진이 한 칸씩 비키고, 손을 떼면 그 자리에 놓인다. 제자리에서
 * 놓으면 돌아간다.
 *
 * 들기 전에 손가락이 움직이면 도구 칸의 세로 스크롤에 넘긴다. 화면 낭독기에서는 끌 수 없으니
 * 「앞으로·뒤로」 동작을 따로 둔다.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, PanResponder, StyleSheet, View } from "react-native";

import { Text } from "./AppText";
import { LIFT_DELAY, LIFT_SLOP, startLift } from "./KeepsakeCardView";
import { 모서리 } from "./theme/controls";
import { typo } from "./theme/typography";
import { slideTargetOf } from "./tripCard";

/** 차례 줄 한 칸의 폭. 사진(54)과 사이(6)를 더한 것이다(`pickStyles.pick`, `styles.row`). */
const 차례_칸 = 60;

export function CardOrderStrip({
  ids,
  accent,
  onPlace,
  onStep,
  renderPhoto,
}: {
  ids: string[];
  accent: string;
  onPlace: (from: number, to: number) => void;
  onStep: (id: string, 앞으로: boolean) => void;
  renderPhoto: (id: string) => React.ReactNode;
}) {
  const [끄는, 끄는_중] = useState<{ from: number; to: number } | null>(null);
  return (
    <View style={styles.row}>
      {ids.map((id, 차례) => {
        const 잡은_것 = 끄는?.from === 차례;
        // 끄는 사진이 지나간 자리의 사진은 한 칸 비킨다.
        const 비킴 = !끄는 || 잡은_것
          ? 0
          : 끄는.from < 끄는.to && 차례 > 끄는.from && 차례 <= 끄는.to
            ? -차례_칸
            : 끄는.from > 끄는.to && 차례 >= 끄는.to && 차례 < 끄는.from
              ? 차례_칸
              : 0;
        return (
          <OrderItem
            key={`order-${id}`}
            index={차례}
            count={ids.length}
            lifted={잡은_것}
            shift={비킴}
            accent={accent}
            onMoveTo={(to) => 끄는_중({ from: 차례, to })}
            onDrop={(to) => {
              끄는_중(null);
              if (to !== 차례) onPlace(차례, to);
            }}
            onStep={(앞으로) => onStep(id, 앞으로)}
          >
            {renderPhoto(id)}
          </OrderItem>
        );
      })}
    </View>
  );
}

/** 차례 줄의 사진 한 칸. 꾹 누르면 들고, 옆으로 끄는 동안 놓일 자리를 위로 알린다. */
function OrderItem({
  index,
  count,
  lifted,
  shift,
  accent,
  onMoveTo,
  onDrop,
  onStep,
  children,
}: {
  index: number;
  count: number;
  lifted: boolean;
  /** 다른 사진이 지나가서 비킨 거리. */
  shift: number;
  accent: string;
  onMoveTo: (to: number) => void;
  onDrop: (to: number) => void;
  onStep: (앞으로: boolean) => void;
  children: React.ReactNode;
}) {
  // 처음 한 번만 만든다. 이 뒤로는 손가락 이벤트가 직접 민다.
  const [움직임] = useState(() => new Animated.Value(0));
  const [들림] = useState(() => new Animated.Value(0));
  const [흔들림] = useState(() => new Animated.Value(0));
  // 손가락 이벤트에서 읽는 값. 렌더 중에는 읽지 않는다.
  const 지금 = useRef({ index, count, onMoveTo, onDrop });
  useEffect(() => {
    지금.current = { index, count, onMoveTo, onDrop };
  }, [index, count, onMoveTo, onDrop]);
  /** 한 번 누르는 동안의 값. 손가락 이벤트에서만 고친다. */
  const 손 = useRef<{
    타이머?: ReturnType<typeof setTimeout>;
    들었다: boolean;
    to: number;
    흔들기?: Animated.CompositeAnimation;
  }>({ 들었다: false, to: 0 });

  const pan = useMemo(() => {
    const 이번 = 손.current;
    const 끝낸다 = () => {
      if (이번.타이머) clearTimeout(이번.타이머);
      이번.타이머 = undefined;
      if (!이번.들었다) return;
      이번.들었다 = false;
      이번.흔들기?.stop();
      흔들림.setValue(0);
      const to = 이번.to;
      if (to !== 지금.current.index) {
        // 사진이 새 자리로 옮겨 그려진다. 끌던 거리는 바로 지운다.
        움직임.setValue(0);
        들림.setValue(0);
        지금.current.onDrop(to);
        return;
      }
      // 제자리에서 놓으면 돌아간다.
      const 놓기 = 지금.current.onDrop;
      Animated.parallel([
        Animated.spring(움직임, { toValue: 0, useNativeDriver: true, friction: 7 }),
        Animated.spring(들림, { toValue: 0, useNativeDriver: true, friction: 7 }),
      ]).start(() => 놓기(to));
    };
    // PanResponder 가 이 콜백들을 손가락 이벤트 때만 부른다. ref 는 렌더 중에 읽지 않는다.
    // eslint-disable-next-line react-hooks/refs
    return PanResponder.create({
      onStartShouldSetPanResponder: () => 지금.current.count > 1,
      // 들기 전에는 스크롤이 가져가도 된다. 든 뒤에는 놓을 때까지 붙든다.
      onPanResponderTerminationRequest: () => !이번.들었다,
      onPanResponderGrant: () => {
        이번.들었다 = false;
        이번.to = 지금.current.index;
        이번.타이머 = setTimeout(() => {
          이번.타이머 = undefined;
          이번.들었다 = true;
          움직임.setValue(0);
          지금.current.onMoveTo(지금.current.index);
          이번.흔들기 = startLift(들림, 흔들림);
        }, LIFT_DELAY);
      },
      onPanResponderMove: (_, g) => {
        if (!이번.들었다) {
          // 들기 전에 움직였으면 꾹 누른 것이 아니다.
          if (이번.타이머 && (Math.abs(g.dx) > LIFT_SLOP || Math.abs(g.dy) > LIFT_SLOP)) {
            clearTimeout(이번.타이머);
            이번.타이머 = undefined;
          }
          return;
        }
        움직임.setValue(g.dx);
        const 다음 = slideTargetOf(지금.current.index, g.dx, 차례_칸, 지금.current.count);
        if (다음 !== 이번.to) {
          이번.to = 다음;
          지금.current.onMoveTo(다음);
        }
      },
      onPanResponderRelease: 끝낸다,
      onPanResponderTerminate: 끝낸다,
    });
  }, [움직임, 들림, 흔들림]);

  return (
    <Animated.View
      {...(count > 1 ? pan.panHandlers : {})}
      accessible
      accessibilityLabel={`${index + 1}번째 사진`}
      accessibilityHint={count > 1 ? "꾹 누른 채 옆으로 끌어 차례를 바꿔요" : undefined}
      accessibilityActions={count > 1 ? [{ name: "decrement", label: "앞으로" }, { name: "increment", label: "뒤로" }] : undefined}
      onAccessibilityAction={(event) => onStep(event.nativeEvent.actionName === "decrement")}
      style={[
        pickStyles.pick,
        lifted
          ? [
              styles.lifted,
              {
                borderColor: accent,
                transform: [
                  { translateX: 움직임 },
                  { scale: 들림.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) },
                  { rotate: 흔들림.interpolate({ inputRange: [-1, 1], outputRange: ["-3deg", "3deg"] }) },
                ],
              },
            ]
          : { transform: [{ translateX: shift }] },
      ]}
    >
      {children}
      <View style={pickStyles.pickOrder} pointerEvents="none">
        <Text style={pickStyles.pickOrderText}>{index + 1}</Text>
      </View>
    </Animated.View>
  );
}

/**
 * 사진 한 칸과 그 위의 차례 표시. 「사진」 시트의 고르는 줄과 이 차례 줄이 같은 모양이라 같이 쓴다.
 */
export const pickStyles = StyleSheet.create({
  // 사진 칸은 누르는 것이기 전에 그림이다. 44 로 줄이면 무엇이 찍혔는지 안 보여서
  // 토큰 높이를 따르지 않는다. 모서리만 버튼과 맞춘다.
  pick: { width: 54, height: 54, borderRadius: 모서리.버튼, borderWidth: 2, borderColor: "transparent", overflow: "hidden" },
  // 고른 차례.
  pickOrder: {
    position: "absolute",
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(17,16,15,0.7)",
  },
  pickOrderText: { fontSize: 10, color: "#FFFFFF", fontFamily: typo.label.family },
});

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  // 들고 있는 사진. 옆 사진 위로 지나가도 가리지 않는다.
  lifted: { zIndex: 2, elevation: 6 },
});
