/**
 * 오류가 났을 때 서버로 한 줄 보내는 곳.
 *
 * 앱에 오류 수집 SDK 를 넣지 않은 이유와 무엇을 지우는지는 `errorReport.ts` 첫 주석에
 * 적어 뒀다. 이 파일은 그 한 줄을 언제 보낼지만 정한다.
 *
 * 보내다 실패해도 조용히 넘어간다. 오류를 알리려다 오류를 내면 원래 오류를 덮는다.
 */

import { Platform } from "react-native";

import { APP_VERSION } from "./appVersion";
import {
  buildErrorReport,
  emptyGate,
  reportingEnabled,
  takeReportSlot,
  type ErrorReport,
  type ReportGate,
} from "./errorReport";


// auth.ts 를 가져오지 않는다. auth.ts 가 이 파일을 쓸 수 있어야 해서 서로 부르는
// 모양을 만들지 않는다. 주소 규칙은 auth.ts 와 같다.
const apiUrl = (process.env.EXPO_PUBLIC_DAYMO_API_URL || "https://api.daymo.xyz").replace(/\/$/, "");

let 켜짐 = false;
let 설치됨 = false;
let gate: ReportGate = emptyGate();

type GlobalErrorHandler = (error: unknown, isFatal?: boolean) => void;
type ErrorUtilsShape = {
  getGlobalHandler?: () => GlobalErrorHandler | undefined;
  setGlobalHandler: (handler: GlobalErrorHandler) => void;
};

/** 웹에서 어느 주소에서 났는지. 물음표 뒤는 떼어 낸다. 거기에 초대 토큰이 온다. */
function 지금_주소(): string {
  if (Platform.OS !== "web" || typeof window === "undefined") return "";
  return window.location?.pathname ?? "";
}

async function 보낸다(report: ErrorReport): Promise<void> {
  try {
    await fetch(`${apiUrl}/v1/client-errors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(report),
    });
  } catch {
    // 연결이 없어서 못 보낸 것은 다시 시도하지 않는다. 쌓아 두면 그것이 또 짐이 된다.
  }
}

/**
 * 오류 하나를 알린다. 꺼져 있으면 아무 일도 하지 않는다.
 *
 * 같은 오류를 5분 안에 다시 보내지 않고, 한 시간에 열 번까지만 보낸다.
 */
export function reportError(
  error: unknown,
  kind: ErrorReport["kind"] = "crash",
  where?: string,
): void {
  if (!켜짐) return;

  const report = buildErrorReport({
    error,
    kind,
    platform: Platform.OS,
    appVersion: APP_VERSION,
    where: where ?? 지금_주소(),
  });
  const 결과 = takeReportSlot(gate, report, Date.now());
  gate = 결과.gate;
  if (!결과.allowed) return;

  void 보낸다(report);
}

/**
 * 앱이 뜰 때 한 번 부른다.
 *
 * 네이티브는 `ErrorUtils` 의 전역 처리기를, 웹은 `window` 의 `error`·`unhandledrejection`
 * 을 잡는다. 둘 다 원래 하던 일을 그대로 이어서 하게 둔다. 빨간 화면이 사라지면
 * 개발할 때 오류를 못 본다.
 */
export function installErrorReporter(): void {
  if (설치됨) return;
  설치됨 = true;

  켜짐 = reportingEnabled(process.env.EXPO_PUBLIC_DAYMO_ERROR_REPORT);
  if (!켜짐) return;

  if (Platform.OS === "web") {
    if (typeof window === "undefined") return;
    window.addEventListener("error", (event) => reportError(event.error ?? event.message, "crash"));
    window.addEventListener("unhandledrejection", (event) => reportError(event.reason, "unhandled"));
    return;
  }

  const utils = (globalThis as { ErrorUtils?: ErrorUtilsShape }).ErrorUtils;
  if (!utils) return;
  const 앞사람 = utils.getGlobalHandler?.();
  utils.setGlobalHandler((error, isFatal) => {
    reportError(error, "crash");
    앞사람?.(error, isFatal);
  });
}
