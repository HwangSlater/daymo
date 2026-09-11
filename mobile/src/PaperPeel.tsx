import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Image, Platform, StyleSheet, View } from "react-native";
import { captureRef, releaseCapture } from "react-native-view-shot";

/** 접힌 안쪽에 지는 그림자. */
const SHADE_COLOR = "#34281B";

/** Capture once per mounted page; all animated bands share that one bitmap. */
export function PaperPeel({ children, progress, direction, backColor, pageColor, reduceMotion }: {
  children: ReactNode;
  progress: Animated.Value;
  direction: number;
  backColor: string;
  /** 캡처 바탕색. 종이 뒷면과 그림자를 색 뷰로 그리려면 비트맵이 불투명해야 한다. */
  pageColor: string;
  reduceMotion: boolean;
}) {
  const source = useRef<View>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [uri, setUri] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const loaded = useRef(0);
  // 지금까지 찍은 임시 파일. 화면에 걸려 있는 동안에는 지우지 않는다.
  const shots = useRef<string[]>([]);
  useEffect(() => {
    if (!size.width || !size.height || reduceMotion) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const capture = async (attempt: number) => {
      try {
        const result = await captureRef(source, {
          format: "png", result: Platform.OS === "web" ? "data-uri" : "tmpfile",
        });
        if (disposed) { releaseCapture(result); return; }
        shots.current.push(result);
        setUri(result);
      } catch {
        // A not-yet-mounted Android surface can fail on its first frame.
        // Leave the live card usable if a second attempt also fails.
        if (!disposed && attempt === 0) timer = setTimeout(() => void capture(1), 150);
      }
    };
    timer = setTimeout(() => void capture(0), 80);
    // 크기가 바뀌어 다시 찍을 때 이전 파일을 여기서 지우면 안 된다. 그 경로를
    // 가리키는 Image 가 아직 화면에 걸려 있어서, 지우는 순간 그 줄들이 무너졌다가
    // 새 파일이 붙으면서 되돌아온다. 기기에서만 나는 증상이다. 웹의 data-uri 는
    // 지울 파일이 없어 이 문제가 없다.
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [size.width, size.height, reduceMotion]);
  // 임시 파일은 이 장이 화면에서 빠질 때 한꺼번에 지운다.
  useEffect(() => () => {
    shots.current.forEach(releaseCapture);
    shots.current = [];
  }, []);

  const geometry = useMemo(() => {
    const count = 28;
    const side = Math.ceil(Math.hypot(size.width, size.height)) + 24;
    const band = side / count;
    const inputs = Array.from({ length: 49 }, (_, i) => i / 48);
    const frames = inputs.map(p => {
      let y = 0;
      let z = 0;
      const points = [{ y: 0, scale: 1 }];
      for (let row = 0; row < count; row++) {
        for (let sub = 0; sub < 6; sub++) {
          const along = (row + (sub + 0.5) / 6) / count;
          // The free corner curls first, followed by the body of the sheet.
          const angle = Math.pow(p, 1.7) * Math.PI * 0.97
            + Math.sin(p * Math.PI) * Math.pow(along, 2) * 1.65;
          y += Math.cos(angle) * band / 6;
          z += Math.sin(angle) * band / 6;
        }
        const scale = 1600 / (1600 - z);
        points.push({ y: y * scale, scale });
      }
      return points;
    });
    return { side, band, inputs, bands: Array.from({ length: count }, (_, row) => {
      return {
        y: frames.map(points => (points[row].y + points[row + 1].y) / 2 - (row + 0.5) * band),
        scaleX: frames.map(points => (points[row].scale + points[row + 1].scale) / 2),
        scaleY: frames.map(points => (points[row + 1].y - points[row].y) / band),
        back: frames.map(points => points[row + 1].y < points[row].y ? 1 : 0),
        shade: frames.map(points => Math.min(0.22, Math.abs(1 - (points[row + 1].y - points[row].y) / band) * 0.14)),
      };
    }) };
  }, [size.width, size.height]);
  const mesh = useMemo(() => {
    const interpolate = (outputRange: number[]) => progress.interpolate({ inputRange: geometry.inputs, outputRange, extrapolate: "clamp" });
    return { ...geometry, bands: geometry.bands.map(band => ({
      y: interpolate(band.y), scaleX: interpolate(band.scaleX), scaleY: interpolate(band.scaleY),
      back: interpolate(band.back), shade: interpolate(band.shade),
    })) };
  }, [geometry, progress]);
  const opacity = useMemo(() => ({
    live: progress.interpolate({ inputRange: [0, 0.002, 1], outputRange: [1, 0, 0] }),
    bitmap: progress.interpolate({ inputRange: [0, 0.002, 0.92, 1], outputRange: [0, 1, 1, 0] }),
    fallback: progress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1, 0] }),
  }), [progress]);
  const angle = -direction * 38;
  const bitmap = useMemo(() => uri ? { uri } : undefined, [uri]);
  return <View onLayout={event => {
    const { width, height } = event.nativeEvent.layout;
    setSize(current => current.width === width && current.height === height ? current : { width, height });
  }}>
    <Animated.View style={{ opacity: ready && !reduceMotion ? opacity.live : opacity.fallback }}>
      <View ref={source} collapsable={false} style={{ paddingVertical: 12, backgroundColor: pageColor }}>{children}</View>
    </Animated.View>
    {bitmap && <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, {
      opacity: ready ? opacity.bitmap : 0, overflow: "hidden", left: -18, right: -18, top: -12, bottom: -12,
    }]}>
      <View style={{ position: "absolute", width: mesh.side, height: mesh.side,
        left: (size.width - mesh.side) / 2 + 18, top: (size.height - mesh.side) / 2 + 12,
        transform: [{ rotate: `${angle}deg` }],
      }}>
        {mesh.bands.map((band, row) => {
          const imageStyle = {
            position: "absolute" as const,
            left: (mesh.side - size.width) / 2,
            top: (mesh.side - size.height) / 2 - row * mesh.band,
            width: size.width, height: size.height,
            transform: [{ rotate: `${-angle}deg` }],
          };
          return <Animated.View key={row} style={{
            position: "absolute", left: 0, top: row * mesh.band,
            width: mesh.side, height: mesh.band + 1.5, overflow: "hidden", zIndex: row,
            transform: [{ translateY: band.y }, { scaleX: band.scaleX }, { scaleY: band.scaleY }],
          }}>
            <Image source={bitmap} resizeMode="stretch" fadeDuration={0} style={imageStyle} onLoad={() => {
              loaded.current += 1;
              if (loaded.current >= mesh.bands.length) setReady(true);
            }} />
            {/* 뒷면과 접힘 그림자는 같은 비트맵에 tintColor 를 씌운 사본이었다.
                캡처가 불투명하니 결과는 단색 사각형과 같고, 색 뷰로 그리면
                줄마다 이미지 셋 대신 하나만 있으면 된다. */}
            <Animated.View style={[imageStyle, { backgroundColor: backColor, opacity: band.back }]} />
            <Animated.View style={[imageStyle, { backgroundColor: SHADE_COLOR, opacity: band.shade }]} />
          </Animated.View>;
        })}
      </View>
    </Animated.View>}
  </View>;
}
