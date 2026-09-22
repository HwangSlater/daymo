import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { Platform } from "react-native";

import { APP_VERSION } from "./appVersion";
import { authenticatedRequest } from "./auth";

/**
 * 앱 안에서 보내는 의견. 운영자가 서버에서 모아 읽는다(`backend/app/jobs/feedback.py`).
 *
 * 초기라 쓰는 사람의 목소리를 쉽게 받으려고 우리 탭 맨 위에 둔다. 메일을 쓰게 하면
 * 거기서 그만두는 사람이 많다. 답장은 하지 않는다.
 */

export type FeedbackKind = "problem" | "idea" | "other";

export const FEEDBACK_KINDS: readonly { value: FeedbackKind; label: string }[] = [
  { value: "problem", label: "불편해요" },
  { value: "idea", label: "이런 기능이 있으면" },
  { value: "other", label: "기타" },
];

/** 서버와 같은 값(`FEEDBACK_BODY_MAX`). */
export const FEEDBACK_MAX = 2000;

/** 보낼 수 있는 글인지. 앞뒤 빈칸만 있으면 보내지 않는다. */
export const feedbackReady = (body: string) => body.trim().length > 0 && body.length <= FEEDBACK_MAX;

export const sendFeedback = (kind: FeedbackKind, body: string) =>
  authenticatedRequest<{ id: string; receivedAt: string }>("/v1/feedback", {
    method: "POST",
    body: JSON.stringify({
      kind,
      body: body.trim(),
      platform: Platform.OS === "ios" || Platform.OS === "android" || Platform.OS === "web" ? Platform.OS : "unknown",
      appVersion: APP_VERSION,
    }),
  });

const hiddenKey = "daymo.feedback-card-hidden.v1";

/**
 * 우리 탭 맨 위 카드를 ✕ 로 닫았는지. 이 기기에만 남는다.
 *
 * 닫아도 설정의 「의견 보내기」로 언제든 보낼 수 있다. 다 읽기 전에는 숨긴 것으로
 * 두어, 닫은 카드가 한순간 보였다 사라지지 않게 한다.
 */
export function useFeedbackCardHidden(): [boolean, () => void] {
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(hiddenKey)
      .then((value) => {
        if (alive) setHidden(value === "1");
      })
      .catch(() => {
        if (alive) setHidden(false);
      });
    return () => {
      alive = false;
    };
  }, []);
  const hide = () => {
    setHidden(true);
    AsyncStorage.setItem(hiddenKey, "1").catch(() => {});
  };
  return [hidden, hide];
}
