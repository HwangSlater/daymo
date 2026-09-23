import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Image,
  LayoutChangeEvent,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "../AppText";
import {
  COVER_FOCUS_DEFAULT,
  coverLayout,
  dragFocus,
  zoomFocus,
  type Box,
  type CoverFocus,
} from "../coverCrop";
import { 높이, 모서리, 불투명도 } from "../theme/controls";
import { typo } from "../theme/typography";

/** 홈 카드의 사진 틀과 같은 비율. 여기서 보이는 만큼이 홈에 들어간다. */
export const COVER_FRAME_RATIO = 1.62;

const 두_손가락_거리 = (터치: { pageX: number; pageY: number }[]) =>
  Math.hypot(터치[0].pageX - 터치[1].pageX, 터치[0].pageY - 터치[1].pageY);

/**
 * 대표 사진에서 홈 카드에 보여 줄 부분을 맞추는 화면.
 *
 * 홈 카드의 사진 틀은 가로로 넓어서(1.62:1) 세로 사진은 가운데 띠만 남는다. 어디를
 * 남길지는 사람이 정한다. 틀은 가만히 두고 사진을 끌어 옮기며, 두 손가락으로 벌리면
 * 키운다. 카카오톡 프로필 배경·인스타그램에서 쓰는 손놀림 그대로다.
 *
 * 틀 밖은 어둡게 깔되 사진이 비쳐 보인다. 무엇이 잘려 나가는지 보고 고르라는 뜻이다.
 *
 * 셈은 `coverCrop.ts` 가 한다. 이 파일은 손가락을 받아 그리기만 한다.
 */
export function CoverFocusScreen({
  uri,
  initial,
  onCancel,
  onDone,
  ratio = COVER_FRAME_RATIO,
  title = "홈에 보일 부분",
  hint = "밝은 부분이 홈 카드에 들어가요",
}: {
  /** 맞출 사진. 아직 못 받았으면 빈 틀만 보여 준다. */
  uri?: string;
  /** 저장돼 있던 자리. 처음 고르는 사진이면 가운데다. 열 때 한 번만 읽는다. */
  initial?: CoverFocus;
  onCancel: () => void;
  onDone: (focus: CoverFocus) => void;
  /**
   * 틀의 가로:세로. 기본은 홈 카드의 사진 틀이다. 추억 카드의 사진 칸도 이 화면을 쓴다
   * (칸마다 비율이 달라 그 칸의 비율을 넘긴다).
   */
  ratio?: number;
  title?: string;
  /** 틀 아래 첫 줄. 밝은 부분이 어디에 들어가는지 알린다. */
  hint?: string;
}) {
  const inset = useSafeAreaInsets();
  // 이 겹은 맞출 때만 붙었다 떨어진다. 그래서 처음 값은 붙을 때 한 번만 읽으면 된다.
  const [focus, setFocus] = useState<CoverFocus>(initial ?? COVER_FOCUS_DEFAULT);
  /** 사진의 본디 크기. 이것을 알아야 어디까지 움직일 수 있는지 셈한다. */
  const [잰_것, 재기] = useState<{ uri: string; size: Box } | null>(null);
  const [frame, setFrame] = useState<Box>({ width: 0, height: 0 });
  // 사진이 바뀌면 잰 값도 버린다. 다시 재기 전까지는 모르는 것으로 둔다.
  const photo = 잰_것 && uri && 잰_것.uri === uri ? 잰_것.size : undefined;

  useEffect(() => {
    if (!uri) return;
    let 살아있다 = true;
    Image.getSize(
      uri,
      (width, height) => {
        if (살아있다) 재기({ uri, size: { width, height } });
      },
      () => undefined,
    );
    return () => {
      살아있다 = false;
    };
  }, [uri]);

  const onFrameLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setFrame((지금) => (지금.width === width && 지금.height === height ? 지금 : { width, height }));
  }, []);
  /**
   * 틀이 놓일 자리. 세로로 긴 칸(네컷 세로 등)은 폭을 다 쓰면 화면 밖으로 넘치므로
   * 폭과 높이 가운데 모자란 쪽에 맞춘다.
   */
  const [무대, 무대재기] = useState<Box>({ width: 0, height: 0 });
  const onStageLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    무대재기((지금) => (지금.width === width && 지금.height === height ? 지금 : { width, height }));
  }, []);
  const 틀_폭 = 무대.width > 0 ? Math.min(무대.width - 32, (무대.height - 16) * ratio) : 0;

  // 손가락 이벤트에서 읽는 값. 렌더 중에는 읽지 않는다.
  const 지금 = useRef({ focus, photo, frame });
  useEffect(() => {
    지금.current = { focus, photo, frame };
  });
  /** 손을 댄 순간의 값. 끄는 동안 여기에 견줘서 셈한다. */
  const 잡은_것 = useRef({ focus: COVER_FOCUS_DEFAULT, 거리: 0, 두_손가락: false });

  const pan = useMemo(() => {
    // 아래 콜백들은 손가락 이벤트 때만 부른다. ref 는 렌더 중에 읽지 않는다.
    // eslint-disable-next-line react-hooks/refs
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => {
        const 터치 = event.nativeEvent.touches;
        잡은_것.current = {
          focus: 지금.current.focus,
          거리: 터치.length >= 2 ? 두_손가락_거리(터치) : 0,
          두_손가락: 터치.length >= 2,
        };
      },
      onPanResponderMove: (event, gesture) => {
        const { photo: 사진, frame: 틀 } = 지금.current;
        const 터치 = event.nativeEvent.touches;
        if (터치.length >= 2) {
          const 거리 = 두_손가락_거리(터치);
          // 한 손가락으로 끌다가 두 손가락이 되면 그 순간부터 다시 센다.
          if (!잡은_것.current.두_손가락 || !잡은_것.current.거리) {
            잡은_것.current = { focus: 지금.current.focus, 거리, 두_손가락: true };
            return;
          }
          setFocus(zoomFocus(잡은_것.current.focus, 사진, 틀, 거리 / 잡은_것.current.거리));
          return;
        }
        if (잡은_것.current.두_손가락) {
          잡은_것.current = { focus: 지금.current.focus, 거리: 0, 두_손가락: false };
          return;
        }
        setFocus(dragFocus(잡은_것.current.focus, 사진, 틀, gesture.dx, gesture.dy));
      },
      onPanResponderTerminationRequest: () => false,
    });
  }, []);

  const 자리 = coverLayout(photo, frame, focus);
  const 사진_자리 = {
    left: 자리.left,
    top: 자리.top,
    width: 자리.width,
    height: 자리.height,
  };

  return (
      <View style={[styles.screen, { paddingTop: inset.top, paddingBottom: inset.bottom }]}>
        <View style={styles.head}>
          <Pressable
            onPress={onCancel}
            accessibilityRole="button"
            accessibilityLabel="보일 부분 맞추기 취소"
            style={({ pressed }) => [styles.headSide, pressed && styles.pressed]}
          >
            <Text style={styles.cancel}>취소</Text>
          </Pressable>
          <Text style={styles.title}>{title}</Text>
          <Pressable
            onPress={() => onDone(focus)}
            accessibilityRole="button"
            accessibilityLabel="보일 부분 맞추기 완료"
            style={({ pressed }) => [styles.headSide, styles.headRight, pressed && styles.pressed]}
          >
            <Text style={styles.done}>완료</Text>
          </Pressable>
        </View>

        {/* 손가락은 틀이 아니라 틀 둘레 전체에서 받는다. 틀이 작으면(추억 카드의 좁은 칸)
            두 번째 손가락이 틀 밖 어두운 곳에 닿아 벌리기가 먹지 않았다. */}
        <View style={styles.stage} onLayout={onStageLayout} {...pan.panHandlers}>
          <View
            style={[styles.frame, 틀_폭 > 0 && { width: 틀_폭, height: 틀_폭 / ratio }]}
            onLayout={onFrameLayout}
            pointerEvents="none"
          >
            {/* 틀 밖으로 삐져나온 부분. 잘려 나갈 곳이 어디인지 비쳐 보인다. */}
            {uri && <Image source={{ uri }} style={[styles.spill, 사진_자리]} />}
            <View style={styles.window}>
              {uri && <Image source={{ uri }} style={[styles.shown, 사진_자리]} />}
            </View>
            {/* 삼분할 선. 사진 위에 얹기만 하고 손가락은 받지 않는다. */}
            <View style={styles.guide} pointerEvents="none">
              <View style={[styles.guideLine, styles.guideV, { left: "33.33%" }]} />
              <View style={[styles.guideLine, styles.guideV, { left: "66.66%" }]} />
              <View style={[styles.guideLine, styles.guideH, { top: "33.33%" }]} />
              <View style={[styles.guideLine, styles.guideH, { top: "66.66%" }]} />
            </View>
          </View>
        </View>

        <Text style={styles.hint}>{hint}</Text>
        <Text style={styles.hintSub}>끌어서 옮기고, 두 손가락으로 벌려서 키워요</Text>
      </View>
  );
}

const styles = StyleSheet.create({
  // 크게 보는 창 위에 통째로 얹는 겹이다. 사진이 주인공이라 바탕이 검다.
  screen: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#000000" },
  head: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  headSide: { minWidth: 64, minHeight: 높이.버튼, justifyContent: "center", paddingHorizontal: 10 },
  headRight: { alignItems: "flex-end" },
  cancel: { fontSize: 15, color: "#C9CCD4", fontFamily: typo.label.family },
  title: { flex: 1, textAlign: "center", fontSize: 16, color: "#FFFFFF", fontFamily: typo.title.family },
  done: { fontSize: 15, color: "#FFFFFF", fontFamily: typo.title.family },
  stage: { flex: 1, justifyContent: "center", alignItems: "center" },
  // 틀 자체는 자르지 않는다. 자르는 것은 안쪽의 `window` 뿐이라, 삐져나온 사진이
  // 위아래로 비쳐 보인다.
  frame: { justifyContent: "center" },
  spill: { position: "absolute", opacity: 0.28 },
  window: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    borderRadius: 모서리.표식,
  },
  shown: { position: "absolute" },
  guide: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  guideLine: { position: "absolute", backgroundColor: "rgba(255,255,255,0.35)" },
  guideV: { top: 0, bottom: 0, width: 1 },
  guideH: { left: 0, right: 0, height: 1 },
  hint: { textAlign: "center", fontSize: 14, color: "#FFFFFF", fontFamily: typo.label.family, marginTop: 8 },
  hintSub: {
    textAlign: "center",
    fontSize: 13,
    color: "#9DA3AE",
    fontFamily: typo.label.family,
    marginTop: 6,
    marginBottom: 18,
  },
  pressed: { opacity: 불투명도.눌림 },
});
