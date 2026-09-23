/**
 * 카드를 사진으로 만드는 동안 보여 주는 「현상」 그림(2026-09-23 시안 ①).
 *
 * 전에는 검은 덮개에 글자 한 줄뿐이라 멈춘 것인지 도는 것인지 알 수 없었다. 필름을
 * 현상하듯 빛이 위에서 아래로 쓸고 지나가며 지금 만드는 그 카드가 드러난다. 아래에는
 * 끝을 알 수 없는 일이라 퍼센트 대신 흐르는 띠를 둔다.
 *
 * 카드 그림은 부르는 쪽이 넘긴다(`TripCards` 의 작은 카드). 여기서는 움직임만 맡는다.
 * 움직임은 전부 `transform` 이라 기기가 그린다 — 찍는 동안 자바스크립트가 바쁘기 때문에
 * 프레임마다 값을 넣는 방식이면 이 화면부터 끊긴다.
 */

import { useEffect, useState, type ReactNode } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

/** 한 번 현상하는 데 걸리는 시간(ms). 실제로 걸리는 시간과 상관없이 이 길이로 되풀이한다. */
const 한_바퀴 = 2600;
/** 빛줄기 높이. 카드 높이에 견줘 이만큼이면 「쓸고 지나간다」로 읽힌다. */
const 빛_높이 = 18;
/** 아래 흐르는 띠의 길이. 카드 폭과 상관없이 고정이라 카드 모양이 달라도 자리가 흔들리지 않는다. */
const 띠_폭 = 132;

export function CardDeveloping({
  width,
  height,
  accent,
  children,
}: {
  width: number;
  height: number;
  /** 빛줄기 색. 카드 도구의 강조색을 그대로 받는다. */
  accent: string;
  /** 현상되는 카드 그림. */
  children: ReactNode;
}) {
  const [진행] = useState(() => new Animated.Value(0));
  const [띠] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const 현상 = Animated.loop(
      Animated.timing(진행, { toValue: 1, duration: 한_바퀴, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    );
    const 흐름 = Animated.loop(
      Animated.timing(띠, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    );
    현상.start();
    흐름.start();
    return () => {
      현상.stop();
      흐름.stop();
    };
  }, [진행, 띠]);

  // 덮개는 위에서 아래로 물러나며 카드를 드러낸다. 다 내려간 뒤에는 잠깐 쉬었다 다시 시작한다.
  const 덮개_내림 = 진행.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0, height, height] });
  const 빛_내림 = 진행.interpolate({ inputRange: [0, 0.7, 1], outputRange: [-빛_높이, height, height] });
  const 빛_흐림 = 진행.interpolate({ inputRange: [0, 0.68, 0.72, 1], outputRange: [1, 1, 0, 0] });
  const 띠_흐름 = 띠.interpolate({ inputRange: [0, 1], outputRange: [-0.4 * 띠_폭, 1.2 * 띠_폭] });

  return (
    <View style={styles.자리}>
      <View style={[styles.카드칸, { width, height }]}>
        {children}
        <Animated.View
          pointerEvents="none"
          style={[styles.덮개, { backgroundColor: "rgba(12,12,14,0.86)", transform: [{ translateY: 덮개_내림 }] }]}
        />
        <Animated.View
          pointerEvents="none"
          style={[
            styles.빛,
            { height: 빛_높이, backgroundColor: accent, opacity: Animated.multiply(빛_흐림, 0.5), transform: [{ translateY: 빛_내림 }] },
          ]}
        />
      </View>
      <View style={[styles.띠길, { width: 띠_폭 }]}>
        <Animated.View style={[styles.띠, { backgroundColor: accent, transform: [{ translateX: 띠_흐름 }] }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  자리: { alignItems: "center", gap: 16 },
  // 카드가 넘치지 않게 자른다. 덮개와 빛줄기가 이 안에서만 움직인다.
  카드칸: { borderRadius: 9, overflow: "hidden" },
  덮개: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 },
  빛: { position: "absolute", left: 0, right: 0, top: 0 },
  띠길: { height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.14)", overflow: "hidden" },
  띠: { width: "40%", height: "100%", borderRadius: 2 },
});
