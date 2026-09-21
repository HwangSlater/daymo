/**
 * 웹에서 고른 사진을 줄인다.
 *
 * 웹의 사진 고르기는 `quality` 를 무시하고 원본을 그대로 준다(expo-image-picker 의 웹 구현).
 * 아이폰 사진 한 장이 4MB 를 넘기도 해서, 그대로 두면 아직 못 올린 사진이 브라우저 저장소
 * (5MB 안팎)를 채워 여행 기록 저장이 통째로 막힌다. 그래서 올리기 전에 긴 변을 줄인다.
 *
 * 서버가 표시본을 2048px 로 만들기 때문에 그보다 크게 가질 이유도 없다.
 */

/** 긴 변이 `maxEdge` 를 넘으면 줄인 JPEG 로 바꾼다. 못 읽으면 받은 것을 그대로 준다. */
export async function shrinkForWeb(uri: string, maxEdge = 2048, quality = 0.88): Promise<string> {
  if (typeof document === "undefined" || typeof Image === "undefined") return uri;
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("사진을 읽지 못했어요"));
      element.src = uri;
    });
    const 배율 = Math.min(1, maxEdge / Math.max(image.width, image.height));
    // 작은 사진은 다시 만들지 않는다. 다시 만들면 오히려 커지기도 한다.
    if (배율 === 1 && uri.length < 1_200_000) return uri;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * 배율));
    canvas.height = Math.max(1, Math.round(image.height * 배율));
    const 붓 = canvas.getContext("2d");
    if (!붓) return uri;
    붓.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    return uri;
  }
}
