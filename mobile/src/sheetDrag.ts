import { useCallback, useMemo, useRef } from "react";
import { Animated, LayoutChangeEvent, PanResponder } from "react-native";

/**
 * 아래에서 올라오는 창을 손가락으로 끌어내려 닫는다.
 *
 * 실수로 닫히지 않게 세 겹으로 막는다.
 *   1. 손잡이와 제목 줄에서 시작한 끌기만 받는다. 본문을 위로 빠르게 넘기다가
 *      아래로 튕겨도 창은 꿈쩍하지 않는다. 본문 스크롤은 그대로 ScrollView 몫이다.
 *   2. 위로 끄는 건 따라가지 않는다. 아래로 끄는 만큼만 창이 내려온다.
 *   3. 충분히 멀리 끌었거나 빠르게 튕겼을 때만 닫고, 아니면 제자리로 돌아온다.
 *      손을 떼는 순간 창이 어디 있는지 보이므로 돌아올지 닫힐지 미리 안다.
 *
 * 돌려주는 값을 창 뷰와 손잡이 영역에 나눠 붙인다.
 *   <Animated.View style={[sheetStyle, drag.sheetStyle]} onLayout={drag.onLayout}>
 *     <View {...drag.panHandlers}>손잡이와 제목</View>
 *     본문
 *   </Animated.View>
 */
export const SHEET_DISMISS_DISTANCE = 120;
/** ms 당 픽셀. 0.9 는 손가락으로 튕기는 정도다. */
export const SHEET_DISMISS_SPEED = 0.9;
/** 튕기기로 닫힐 때도 이만큼은 끌었어야 한다. 짧은 떨림은 닫지 않는다. */
export const SHEET_FLICK_MIN = 40;

export function useSheetDrag(onClose: () => void) {
  const offset = useMemo(() => new Animated.Value(0), []);
  const height = useRef(0);
  const closing = useRef(false);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    height.current = event.nativeEvent.layout.height;
  }, []);
  const settleBack = useCallback(() => {
    Animated.spring(offset, { toValue: 0, bounciness: 4, useNativeDriver: true }).start();
  }, [offset]);
  const pan = useMemo(() => {
    // 아래로 4px 넘게, 가로보다 세로로 더 움직였을 때만 끌기로 본다. 그냥
    // 누르는 건 받지 않아서 제목 줄의 닫기 버튼은 그대로 눌린다.
    const wantsDrag = (_: unknown, gesture: { dx: number; dy: number }) => {
      if (closing.current) return false;
      return gesture.dy > 4 && gesture.dy > Math.abs(gesture.dx);
    };
    // PanResponder 가 이 콜백들을 손가락 이벤트 때만 부른다. ref 는 렌더 중에 읽지 않는다.
    // eslint-disable-next-line react-hooks/refs
    return PanResponder.create({
      onMoveShouldSetPanResponder: wantsDrag,
      onMoveShouldSetPanResponderCapture: wantsDrag,
      onPanResponderMove: (_, gesture) => {
        offset.setValue(Math.max(0, gesture.dy));
      },
      onPanResponderRelease: (_, gesture) => {
        const far = gesture.dy > SHEET_DISMISS_DISTANCE;
        const flick = gesture.vy > SHEET_DISMISS_SPEED && gesture.dy > SHEET_FLICK_MIN;
        if (!far && !flick) {
          settleBack();
          return;
        }
        closing.current = true;
        Animated.timing(offset, {
          toValue: Math.max(height.current, 600),
          duration: 180,
          useNativeDriver: true,
        }).start(() => {
          onClose();
          // 다음에 열릴 때를 위해 제자리로. Modal 이 닫힌 뒤라 보이지 않는다.
          offset.setValue(0);
          closing.current = false;
        });
      },
      onPanResponderTerminate: settleBack,
      onPanResponderTerminationRequest: () => false,
    });
  }, [offset, onClose, settleBack]);
  return {
    panHandlers: pan.panHandlers,
    sheetStyle: { transform: [{ translateY: offset }] },
    onLayout,
  };
}
