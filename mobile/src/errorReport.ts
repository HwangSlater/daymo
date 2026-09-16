/**
 * 앱이 겪은 오류를 한 줄로 만드는 곳.
 *
 * 앱에는 오류 수집 SDK 를 넣지 않았다. 넣으면 무엇을 가져가는지 우리가 고를 수 없고,
 * 스토어에 신고할 제3자 SDK 가 하나 는다. 대신 이름·한 줄 설명·어느 화면인지만 골라
 * 우리 서버(`POST /v1/client-errors`)로 보낸다. 바깥으로 더 보낼지는 서버가 정한다
 * (`backend/app/core/observability.py`).
 *
 * **여기가 마지막 문이다.** 오류 글에는 사용자가 적은 것이 섞여 들어온다. 이메일,
 * 초대 링크, 토큰, 여행 제목, 사진 파일 이름이 그렇다. 보내기 전에 지운다.
 * 서버가 한 번 더 지우지만, 지우지 않은 것을 서버까지 보내지는 않는다.
 *
 * expo 나 react-native 를 가져오지 않는다. `node --test` 로 바로 시험한다.
 * 실제로 보내는 일은 `errorReporter.ts` 가 한다.
 */

/** 서버의 `ClientErrorIn` 과 같은 모양. */
export type ErrorReport = {
  platform: string;
  appVersion: string;
  /** crash: 앱이 멈춤. unhandled: 처리되지 않은 promise. api: 서버 호출 실패. */
  kind: "crash" | "unhandled" | "api";
  name: string;
  message: string;
  /** 어느 화면인지. 사용자가 적은 글이 아니라 우리가 고른 말이다. */
  where: string;
};

const 지움 = "[지움]";

const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

const 규칙: [RegExp, string][] = [
  // 이메일.
  [/[\w.!#$%&'*+/=?^`{|}~-]+@[\w-]+(?:\.[\w-]+)+/g, "[이메일 지움]"],
  // Authorization 헤더 값.
  [/\bbearer\s+\S+/gi, "Bearer [지움]"],
  // JWT. access token 과 소셜 로그인의 id_token.
  [/\beyJ[\w-]{5,}\.[\w-]{5,}\.[\w-]*/g, "[토큰 지움]"],
  // 초대 링크·확인 링크. 물음표 뒤가 곧 초대장이다.
  [/(https?:\/\/\S+?)\?\S*/g, `$1?${지움}`],
  // key=value 로 적힌 비밀값.
  [/\b(token|code|proof|secret|password|refreshToken|accessToken)\s*[=:]\s*\S+/gi, `$1=${지움}`],
  // 사진 파일 이름. 확장자가 붙은 것은 이름째로 뺀다. `\b` 는 한글 앞에서 걸리지
  // 않아서(자바스크립트의 `\w` 에 한글이 없다) 앞을 직접 본다.
  [/(?<![\w가-힣.-])[\w가-힣 .-]{1,80}\.(?:jpe?g|png|heic|heif|webp|gif|mov|mp4)\b/gi, "[파일 지움]"],
  // 그 밖의 긴 임의 문자열. 초대 토큰과 해시가 여기 걸린다. UUID 는 남긴다.
  [new RegExp(`(?<![\\w-])(?!${UUID})[A-Za-z0-9_-]{32,}(?![\\w-])`, "g"), "[값 지움]"],
];

/** 글자 하나에서 사람을 가리키는 것과 비밀값을 지운다. */
export function scrubText(값: string): string {
  let 결과 = 값;
  for (const [규, 바꿀_것] of 규칙) 결과 = 결과.replace(규, 바꿀_것);
  return 결과;
}

const 잘라내기 = (값: string, 길이: number) => (값.length > 길이 ? `${값.slice(0, 길이 - 1)}…` : 값);

/**
 * 던져진 것에서 보낼 한 줄을 만든다.
 *
 * 스택은 보내지 않는다. 웹 묶음은 이름이 뭉개져 읽을 수 없고, 거기에 남는 것은
 * 파일 경로뿐이라 얻는 것보다 거를 것이 많다. 종류·한 줄·화면이면 어디를 볼지는 정해진다.
 */
export function buildErrorReport(input: {
  error: unknown;
  kind: ErrorReport["kind"];
  platform: string;
  appVersion: string;
  where?: string;
}): ErrorReport {
  const { error } = input;
  const 이름 = error instanceof Error && error.name ? error.name : typeof error;
  const 본문 =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "알 수 없는 오류";

  return {
    platform: input.platform,
    appVersion: input.appVersion,
    kind: input.kind,
    // 서버의 max_length 와 같은 값이다. 여기서 먼저 끊어야 422 로 버려지지 않는다.
    name: 잘라내기(scrubText(이름), 120),
    message: 잘라내기(scrubText(본문), 500),
    where: 잘라내기(scrubText(input.where ?? ""), 120),
  };
}

/**
 * 같은 오류를 되풀이해 보내지 않게 세는 값.
 *
 * 화면 하나가 그릴 때마다 터지면 1초에 수십 번 난다. 그대로 보내면 서버 로그가
 * 그것만으로 차고, 사용자의 데이터 요금도 쓴다.
 */
export type ReportGate = {
  /** 오류 종류별로 마지막에 보낸 때(ms). */
  sentAt: Record<string, number>;
  /** 이번 시간 창에서 보낸 수. */
  count: number;
  windowStart: number;
};

export const emptyGate = (): ReportGate => ({ sentAt: {}, count: 0, windowStart: 0 });

/** 같은 오류는 이만큼 지나야 다시 보낸다. */
const 같은_오류_간격 = 5 * 60_000;
/** 한 시간에 보낼 수 있는 수. */
const 시간당_한도 = 10;
const 창 = 60 * 60_000;

/** 보내도 되는지 정하고, 새 세는 값을 함께 돌려준다. 원래 값은 고치지 않는다. */
export function takeReportSlot(
  gate: ReportGate,
  report: ErrorReport,
  now: number,
): { allowed: boolean; gate: ReportGate } {
  const 열쇠 = `${report.kind}:${report.name}:${report.message}`;
  const 새_창 = now - gate.windowStart >= 창;
  const count = 새_창 ? 0 : gate.count;
  const windowStart = 새_창 ? now : gate.windowStart;
  // 창이 새로 열리면 "언제 보냈는지" 도 함께 잊는다. 한 시간 넘게 남겨 둘 이유가 없다.
  const sentAt = 새_창 ? {} : gate.sentAt;

  const 마지막 = sentAt[열쇠];
  if (마지막 !== undefined && now - 마지막 < 같은_오류_간격) {
    return { allowed: false, gate: { sentAt, count, windowStart } };
  }
  if (count >= 시간당_한도) {
    return { allowed: false, gate: { sentAt, count, windowStart } };
  }

  return {
    allowed: true,
    gate: { sentAt: { ...sentAt, [열쇠]: now }, count: count + 1, windowStart },
  };
}

/**
 * 오류를 서버로 보낼지. `EXPO_PUBLIC_DAYMO_ERROR_REPORT` 를 `off`(또는 `0`·`false`)로
 * 두면 끈다. 기본은 켜짐이다.
 *
 * 보내는 곳이 우리 서버라서 기본을 켜 둔다. 서버 접속 기록과 같은 성격이고
 * 처리방침에 이미 적혀 있다. 바깥 회사(Sentry)로 나가는 것은 서버의 `SENTRY_DSN`
 * 이 들어간 뒤에야 시작되고, 그쪽은 기본이 꺼짐이다.
 */
export function reportingEnabled(setting: string | undefined): boolean {
  const 값 = (setting ?? "").trim().toLowerCase();
  return !(값 === "off" || 값 === "0" || 값 === "false" || 값 === "no");
}
