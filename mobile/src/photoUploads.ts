/**
 * 사진 파일을 올리는 앱 전역 대기열.
 *
 * 올리기는 화면이 끌지 않는다. 여행이 끝나고 마흔 장을 한꺼번에 넣은 사람은 올라가는
 * 동안 다른 탭도 보고 여행 목록으로도 나간다. 화면이 끌면 그때마다 멈추고 다시
 * 들어와야 이어져서, 가장 오래 걸리는 일이 가장 잘 끊긴다. 그래서 줄을 React 바깥에
 * 두고 화면은 구독만 한다. 화면이 사라져도 줄은 그대로 돈다.
 *
 * 서버 부담은 `requestQueue` 가 맡는다. 여기서 정하는 것은 한 번에 몇 장을 집어 드는지
 * 뿐이다. 사진 한 장을 보내려면 파일을 통째로 읽어 SHA-256 을 세야 해서, 마흔 장을
 * 한꺼번에 시작하면 줄에 서기도 전에 기기가 먼저 숨이 찬다.
 *
 * 앱을 껐다 켠 뒤까지 잇지는 않는다. 그 자리는 목록 동기화가 맡는다(`useListSync`).
 * 다시 열면 서버에 아직 없는 사진을 찾아 처음부터 올린다.
 *
 * expo 나 react-native 를 가져오지 않는다. `node --test` 로 바로 시험한다.
 */

import { useSyncExternalStore } from "react";

import { statusOf } from "./requestQueue.ts";
import type { PhotoBody, ServerPhoto } from "./photoSync.ts";

/** 한 번에 집어 드는 사진 수. 요청 줄은 이 뒤에서 다시 다섯으로 묶는다. */
export const PHOTO_UPLOAD_AT_ONCE = 3;

/** 줄에 세운 사진 한 장. 화면이 사라져도 이것만으로 끝까지 올릴 수 있어야 한다. */
export type PhotoUploadJob = {
  /** 서버 여행 id. */
  tripId: string;
  photoId: string;
  /** 기기에 있는 파일 자리. 웹은 `data:` 다. */
  uri: string;
  /** 사진 줄을 만들 때 함께 보내는 칸(설명·날짜·붙인 곳). */
  body: PhotoBody;
};

/** 서버로 실제로 보내는 길. 앱은 `photoTransfer.uploadPhoto`, 시험은 가짜를 넘긴다. */
export type PhotoUploadSend<R> = (job: PhotoUploadJob) => Promise<R>;

/** 화면이 진행 줄을 그리는 데 필요한 것 전부. */
export type PhotoUploadState = {
  /** 이번 묶음에 넣은 사진 수. 다 끝나면 0 으로 돌아가 줄이 걷힌다. */
  total: number;
  /** 그중 올라간 수. */
  done: number;
  /** 서버가 거부해 멈춘 사진 id. 「다시 시도」를 눌러야 다시 간다. */
  blocked: readonly string[];
  /** 아직 보내는 중인 것이 남았는지. 실패만 남았으면 false 다. */
  running: boolean;
};

export const NO_PHOTO_UPLOADS: PhotoUploadState = { total: 0, done: 0, blocked: [], running: false };

/**
 * 진행 줄 한 줄.
 *
 * 남은 수만 적으면 마흔 장을 올리는 동안 숫자가 아주 천천히 줄어서 멈춘 줄 안다.
 * 몇 장 중 몇 장인지가 보여야 얼마나 남았는지 알고 기다릴 수 있다.
 */
export function photoUploadHeadline(state: PhotoUploadState): string {
  const 실패 = state.blocked.length;
  if (state.running) {
    return `사진 ${state.done}/${state.total}장 올리는 중이에요${실패 ? ` · ${실패}장 실패` : ""}`;
  }
  return 실패 ? `사진 ${실패}장을 올리지 못했어요` : "";
}

/**
 * 이 오류로 멈출지, 쉬었다 스스로 다시 보낼지.
 *
 * 연결이 끊겼거나 서버가 잠깐 바쁜 것은 사용자가 할 일이 없으니 줄이 알아서 다시
 * 보낸다. 413(사진이 너무 큼·저장 공간이 참)이나 422 처럼 같은 사진을 그대로 보내면
 * 또 거부되는 것은 멈추고 「다시 시도」를 기다린다.
 */
export const photoUploadRetries = (status: number) => status === 0 || status === 429 || status >= 500;

/** 스스로 다시 보내기까지 쉬는 시간. 목록 동기화와 같은 20초에서 멈춘다. */
export const photoRetryMs = (attempt: number) => Math.min(20_000, 2_000 * 2 ** Math.max(0, attempt));

/** 기다리던 쪽 하나. `useListSync` 의 만들기가 이 약속을 받아 간다. */
type Waiter<R> = { resolve: (row: R) => void; reject: (error: unknown) => void };

type Entry<R> = {
  job: PhotoUploadJob;
  send: PhotoUploadSend<R>;
  /** 몇 번 쉬었다 다시 했는지. 쉬는 시간이 이 수만큼 길어진다. */
  attempt: number;
  running: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  waiters: Waiter<R>[];
};

type TripQueue<R> = {
  /** 이번 묶음에 넣은 사진 id. 다 끝나면 비운다. */
  batch: Set<string>;
  /** 그중 올라간 것. */
  done: Set<string>;
  /** 서버가 거부해 멈춘 것. 「다시 시도」가 이 줄을 도로 `waiting` 으로 옮긴다. */
  stopped: Map<string, { entry: Entry<R>; reason: string }>;
  waiting: Map<string, Entry<R>>;
  /**
   * 앱이 켜진 뒤 올린 사진과 서버가 준 줄.
   *
   * 화면이 다시 열려 목록 동기화가 같은 사진을 또 만들려 할 때 여기 있는 줄을 그대로
   * 준다. 서버가 같은 id 를 다시 받아 주기는 하지만, 마흔 장이면 그만큼 요청이 는다.
   */
  uploaded: Map<string, R>;
  state: PhotoUploadState;
  stamp: string;
};

const messageOf = (error: unknown) =>
  (typeof (error as { message?: unknown } | null)?.message === "string"
    ? (error as { message: string }).message
    : "사진을 올리지 못했어요.");

export type PhotoUploads<R> = {
  /** 이 사진들을 줄에 넣는다. 이미 줄에 있거나 올라갔거나 멈춘 사진은 지나간다. */
  add: (jobs: readonly PhotoUploadJob[], send: PhotoUploadSend<R>) => void;
  /**
   * 이 한 장이 끝나기를 기다린다. 줄에 없으면 넣고 기다린다.
   *
   * 쉬었다 다시 하려고 자고 있던 줄이면 깨워서 바로 보낸다. 부르는 쪽(목록 동기화)이
   * 다시 해 보라고 온 것이라 스무 초를 더 재울 까닭이 없다.
   */
  join: (job: PhotoUploadJob, send: PhotoUploadSend<R>) => Promise<R>;
  /** 멈춘 사진을 한 번 더 보낸다. 화면의 「다시 시도」가 부른다. */
  retry: (tripId: string) => void;
  /** 멈춘 까닭. 서버가 준 문구를 그대로 들고 있는다. */
  reasonOf: (tripId: string, photoId: string) => string | undefined;
  /** 앱이 켜진 뒤 이 여행에서 올린 사진 id. 화면이 없는 동안 올라간 것도 들어 있다. */
  uploadedIds: (tripId: string) => string[];
  subscribe: (listen: () => void) => () => void;
  stateOf: (tripId: string | undefined) => PhotoUploadState;
};

export function createPhotoUploads<R>(options: {
  atOnce?: number;
  retryMs?: (attempt: number) => number;
} = {}): PhotoUploads<R> {
  const atOnce = Math.max(1, options.atOnce ?? PHOTO_UPLOAD_AT_ONCE);
  const 쉬는_시간 = options.retryMs ?? photoRetryMs;
  const trips = new Map<string, TripQueue<R>>();
  const listeners = new Set<() => void>();
  let inFlight = 0;

  const queueOf = (tripId: string): TripQueue<R> => {
    const 있던_것 = trips.get(tripId);
    if (있던_것) return 있던_것;
    const 새_줄: TripQueue<R> = {
      batch: new Set(),
      done: new Set(),
      stopped: new Map(),
      waiting: new Map(),
      uploaded: new Map(),
      state: NO_PHOTO_UPLOADS,
      stamp: "",
    };
    trips.set(tripId, 새_줄);
    return 새_줄;
  };

  const publish = () => {
    let 알린다 = false;
    for (const trip of trips.values()) {
      // 보낼 것도 멈춘 것도 없으면 묶음이 끝난 것이다. 세던 수를 비워 줄을 걷는다.
      if (!trip.waiting.size && !trip.stopped.size) {
        trip.batch.clear();
        trip.done.clear();
      }
      const blocked = [...trip.stopped.keys()];
      const stamp = `${trip.batch.size}|${trip.done.size}|${trip.waiting.size > 0}|${blocked.join(",")}`;
      if (stamp === trip.stamp) continue;
      trip.stamp = stamp;
      trip.state = {
        total: trip.batch.size,
        done: trip.done.size,
        blocked,
        running: trip.waiting.size > 0,
      };
      알린다 = true;
    }
    if (알린다) listeners.forEach((listen) => listen());
  };

  const pump = () => {
    for (const trip of trips.values()) {
      for (const entry of trip.waiting.values()) {
        if (inFlight >= atOnce) return;
        if (entry.running || entry.timer) continue;
        start(trip, entry);
      }
    }
  };

  const start = (trip: TripQueue<R>, entry: Entry<R>) => {
    entry.running = true;
    inFlight += 1;
    entry.send(entry.job).then(
      (row) => finish(trip, entry, row, null),
      (error: unknown) => finish(trip, entry, null, error ?? new Error("사진을 올리지 못했어요.")),
    );
  };

  const finish = (trip: TripQueue<R>, entry: Entry<R>, row: R | null, error: unknown) => {
    entry.running = false;
    inFlight -= 1;
    const id = entry.job.photoId;
    const 기다리던 = entry.waiters;
    entry.waiters = [];
    if (!error) {
      trip.waiting.delete(id);
      trip.done.add(id);
      trip.uploaded.set(id, row as R);
      기다리던.forEach((하나) => 하나.resolve(row as R));
    } else if (photoUploadRetries(statusOf(error))) {
      // 쉬었다 다시 보낸다. 기다리던 쪽은 붙들지 않는다. 목록 동기화는 연결이 끊긴
      // 것을 제 자리에서 알리고 스무 초 뒤에 다시 오는 편이 낫다.
      entry.attempt += 1;
      기다리던.forEach((하나) => 하나.reject(error));
      const 시계 = setTimeout(() => {
        entry.timer = null;
        pump();
      }, 쉬는_시간(entry.attempt - 1));
      entry.timer = 시계;
      // node 로 시험할 때 쉬고 있는 줄 하나가 프로세스를 붙들지 않게 한다. 기기에는 없다.
      (시계 as { unref?: () => void }).unref?.();
    } else {
      trip.waiting.delete(id);
      trip.stopped.set(id, { entry, reason: messageOf(error) });
      기다리던.forEach((하나) => 하나.reject(error));
    }
    publish();
    pump();
  };

  return {
    add(jobs, send) {
      let 넣었다 = false;
      for (const job of jobs) {
        const trip = queueOf(job.tripId);
        const id = job.photoId;
        if (trip.waiting.has(id) || trip.stopped.has(id) || trip.uploaded.has(id)) continue;
        trip.waiting.set(id, { job, send, attempt: 0, running: false, timer: null, waiters: [] });
        trip.batch.add(id);
        넣었다 = true;
      }
      if (!넣었다) return;
      publish();
      pump();
    },

    join(job, send) {
      const trip = queueOf(job.tripId);
      const 이미 = trip.uploaded.get(job.photoId);
      if (이미 !== undefined) return Promise.resolve(이미);
      return new Promise<R>((resolve, reject) => {
        let entry = trip.waiting.get(job.photoId);
        if (!entry) {
          const 멈춘_것 = trip.stopped.get(job.photoId);
          entry = 멈춘_것?.entry ?? { job, send, attempt: 0, running: false, timer: null, waiters: [] };
          entry.job = job;
          entry.send = send;
          entry.attempt = 0;
          trip.stopped.delete(job.photoId);
          trip.waiting.set(job.photoId, entry);
          trip.batch.add(job.photoId);
        }
        if (entry.timer) {
          clearTimeout(entry.timer);
          entry.timer = null;
          entry.attempt = 0;
        }
        entry.waiters.push({ resolve, reject });
        publish();
        pump();
      });
    },

    retry(tripId) {
      const trip = trips.get(tripId);
      if (!trip?.stopped.size) return;
      for (const [id, 멈춘_것] of trip.stopped) {
        멈춘_것.entry.attempt = 0;
        trip.waiting.set(id, 멈춘_것.entry);
        trip.batch.add(id);
      }
      trip.stopped.clear();
      publish();
      pump();
    },

    reasonOf: (tripId, photoId) => trips.get(tripId)?.stopped.get(photoId)?.reason,

    uploadedIds: (tripId) => [...(trips.get(tripId)?.uploaded.keys() ?? [])],

    subscribe(listen) {
      listeners.add(listen);
      return () => {
        listeners.delete(listen);
      };
    },

    stateOf: (tripId) => (tripId ? trips.get(tripId)?.state ?? NO_PHOTO_UPLOADS : NO_PHOTO_UPLOADS),
  };
}

/** 앱이 함께 쓰는 줄 하나. 여행 상세가 사진을 여기에 넣고, 화면은 구독만 한다. */
export const photoUploads = createPhotoUploads<ServerPhoto>();

/** 이 여행의 올리기 진행 상황. 화면이 사라져도 줄은 그대로라 값만 받아 그린다. */
export function usePhotoUploads(tripId: string | undefined): PhotoUploadState {
  return useSyncExternalStore(
    photoUploads.subscribe,
    () => photoUploads.stateOf(tripId),
    () => photoUploads.stateOf(tripId),
  );
}
