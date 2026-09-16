/**
 * 서버로 나가는 요청을 한 줄로 세운다.
 *
 * 앱은 화면 하나를 여는 데도 목록과 사진을 수십 개씩 부른다. 「찾기」의 미리 받기는 여행
 * 하나당 목록 아홉 개를 받고, 여행 상세는 `useListSync` 열세 개가 한꺼번에 목록을 받고,
 * 사진은 카드마다 썸네일을 받는다. 그대로 두면 앞단(nginx)의 초당 제한에 걸려 몇 개가
 * 429 로 떨어진다. 브라우저에서는 그 응답에 CORS 머리가 없어 그냥 연결 오류로 보이고,
 * 화면은 까닭 없이 비거나 사진이 안 뜬다.
 *
 * 여기서 세 가지를 한다.
 *
 * 1. 한꺼번에 나가는 요청을 `MAX_IN_FLIGHT` 개로 묶는다. 나머지는 줄을 선다.
 * 2. 앞단이 막았으면(429·503 …) 잠깐 쉬었다 다시 보낸다. 쉬는 동안에는 자리를 내주고,
 *    쉬는 시간은 갈수록 길어지며 조금씩 흔들어 둔다(여럿이 같은 시각에 다시 몰리지 않게).
 * 3. 끝내 못 보냈으면 조용히 넘기지 않고 `onGiveUp` 으로 알린다. 화면 위 한 줄이 받는다.
 *
 * 줄은 두 갈래다. 화면이 기다리는 요청이 먼저 나가고, 미리 받기처럼 아무도 안 보고 있는
 * 요청(`background`)은 맨 뒤에 선다. 보고 있는 화면이 미리 받기에 밀리면 안 된다.
 *
 * expo 나 react-native 를 가져오지 않는다. `node --test` 로 바로 시험한다.
 */

/** 한꺼번에 나갈 수 있는 요청 수. 앞단은 초당 30건이라 한 화면을 여는 뭉치가 이 안에 든다. */
export const MAX_IN_FLIGHT = 5;

/** 막혔을 때 다시 보내는 횟수. 이 수만큼 더 보내 보고 그래도 안 되면 포기한다. */
export const MAX_RETRIES = 2;

/** 처음 쉬는 시간과 그 윗값. 400 → 800 → 1600ms 로 늘어난다. */
export const BASE_BACKOFF_MS = 400;
export const MAX_BACKOFF_MS = 4_000;

/**
 * `attempt` 번째로 실패한 뒤 쉬는 시간(ms). 0부터 센다.
 *
 * 흔들기는 0.75~1.25배다. 한꺼번에 막힌 요청 여럿이 똑같은 시각에 다시 몰리지 않게
 * 흩되, 다음 차례가 반드시 더 길도록 폭을 좁게 잡았다.
 */
export function backoffMs(attempt: number, jitter: number = Math.random()): number {
  const 기본 = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** Math.max(0, attempt));
  return Math.round(기본 * (0.75 + Math.min(1, Math.max(0, jitter)) * 0.5));
}

/** 앞단이나 서버가 지금 바빠서 막은 상태. 잠시 뒤 같은 요청을 다시 보내면 된다. */
export const isCongested = (status: number) =>
  status === 429 || status === 502 || status === 503 || status === 504;

/**
 * 다시 보낼지.
 *
 * 429·503 은 앞단이 서버에 넘기기 전에 막은 것이라 무엇을 보내던 요청이든 다시 보내도
 * 된다. 서버에 닿지도 않았다. 연결 자체가 끊긴 것(status 0)은 서버가 이미 받았는지
 * 알 수 없어서, 두 번 보내도 같은 요청(GET·HEAD)만 다시 보낸다.
 */
export function shouldRetry(
  status: number,
  { attempt, retries = MAX_RETRIES, safe }: { attempt: number; retries?: number; safe: boolean },
): boolean {
  if (attempt >= retries) return false;
  if (status === 429 || status === 503) return true;
  return safe && (status === 0 || status === 502 || status === 504);
}

/** 오류에서 HTTP 상태를 꺼낸다. `DaymoApiError` 를 가져오지 않으려고 모양만 본다. */
export function statusOf(error: unknown): number {
  const found = (error as { status?: unknown } | null)?.status;
  return typeof found === "number" ? found : -1;
}

export type RequestQueue = {
  /** `task` 를 줄에 세우고, 자리가 나면 부른다. 돌려주는 약속은 `task` 의 것과 같다. */
  run<T>(task: () => Promise<T>, options?: { background?: boolean }): Promise<T>;
  /** 지금 나가 있는 요청 수. */
  readonly inFlight: number;
  /** 아직 자리를 못 잡고 기다리는 요청 수. */
  readonly waiting: number;
};

/** 동시 실행 수를 `limit` 으로 묶는 줄 하나. 앱은 `apiQueue` 하나만 쓴다. */
export function createRequestQueue(limit: number = MAX_IN_FLIGHT): RequestQueue {
  const 앞줄: (() => void)[] = [];
  const 뒷줄: (() => void)[] = [];
  let inFlight = 0;

  const 다음을_부른다 = () => {
    while (inFlight < limit) {
      const 시작 = 앞줄.shift() ?? 뒷줄.shift();
      if (!시작) return;
      inFlight += 1;
      시작();
    }
  };

  return {
    run<T>(task: () => Promise<T>, options: { background?: boolean } = {}): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        const 시작 = () => {
          let 결과: Promise<T>;
          try {
            결과 = task();
          } catch (error) {
            // 부르자마자 던지는 일꾼도 자리를 돌려줘야 한다.
            결과 = Promise.reject(error);
          }
          결과.then(resolve, reject).then(() => {
            inFlight -= 1;
            다음을_부른다();
          });
        };
        (options.background ? 뒷줄 : 앞줄).push(시작);
        다음을_부른다();
      });
    },
    get inFlight() {
      return inFlight;
    },
    get waiting() {
      return 앞줄.length + 뒷줄.length;
    },
  };
}

/** 앱 전체가 함께 쓰는 줄. 목록·사진·사진 올리기가 모두 여기를 지난다. */
export const apiQueue = createRequestQueue();

/** 줄이 끝내 요청을 못 보냈을 때 알리는 까닭. */
export type GiveUp = {
  /** `congested` 는 앞단이 막았다는 답을 받은 것, `unreachable` 은 답조차 못 받은 것. */
  kind: "congested" | "unreachable";
  status: number;
};

const giveUpListeners = new Set<(giveUp: GiveUp) => void>();

/**
 * 못 보낸 요청을 듣는다. 돌려주는 함수를 부르면 그만 듣는다.
 *
 * 404·422 처럼 사용자가 고쳐야 하는 오류는 알리지 않는다. 그런 오류는 부르는 쪽이
 * 제 자리에서 안내한다. 여기서 알리는 것은 "다시 보내 봤는데도 서버까지 못 갔다" 뿐이다.
 * 한 번 만에 실패한 것까지 알리면 잠깐 끊긴 것마다 화면 위에 한 줄이 떠서 시끄럽다.
 */
export function onGiveUp(listen: (giveUp: GiveUp) => void): () => void {
  giveUpListeners.add(listen);
  return () => {
    giveUpListeners.delete(listen);
  };
}

function announceGiveUp(status: number, attempt: number) {
  if (attempt < 1) return;
  const kind = status === 0 ? "unreachable" : isCongested(status) ? "congested" : null;
  if (!kind) return;
  giveUpListeners.forEach((listen) => listen({ kind, status }));
}

const 기다린다 = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export type SendOptions = {
  /** 아무도 기다리지 않는 요청(미리 받기). 줄 맨 뒤에 선다. */
  background?: boolean;
  /** 두 번 보내도 같은 결과인 요청인지. 연결이 끊겼을 때 다시 보낼지를 가른다. */
  safe?: boolean;
  retries?: number;
  /** 시험이 바꿔 끼우는 자리. 평소에는 앱의 줄과 진짜 시계를 쓴다. */
  queue?: RequestQueue;
  sleep?: (ms: number) => Promise<void>;
  jitter?: () => number;
};

/**
 * 줄을 서서 보내고, 막혔으면 쉬었다 다시 보낸다.
 *
 * 쉬는 동안에는 줄에서 빠져 있다. 자리를 붙들고 자면 그 자리만큼 줄이 좁아져서,
 * 막힌 요청 하나가 멀쩡한 요청 넷을 함께 세워 두게 된다.
 */
export async function sendQueued<T>(task: () => Promise<T>, options: SendOptions = {}): Promise<T> {
  const {
    background = false,
    safe = false,
    retries = MAX_RETRIES,
    queue = apiQueue,
    sleep = 기다린다,
    jitter,
  } = options;
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await queue.run(task, { background });
    } catch (error) {
      const status = statusOf(error);
      if (!shouldRetry(status, { attempt, retries, safe })) {
        announceGiveUp(status, attempt);
        throw error;
      }
      await sleep(backoffMs(attempt, jitter?.()));
    }
  }
}
