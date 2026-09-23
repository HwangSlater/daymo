import { createContext, useContext, useEffect, useRef, useState } from "react";
import { SheetShell, sheetHeadStyles } from "../ui/SheetShell";
import { Segment, 세그먼트_최대 } from "../ui/Segment";
import { TimeWheel } from "../ui/TimeWheel";
import { OptionalFormSection as SharedOptionalFormSection } from "../ui/OptionalFormSection";
import { MapLink } from "../MapLink";
import { DaymoApiError } from "../auth";
import { SyncMark } from "../SyncMarks";
import { isServerId } from "../listSync";
import { type MemoryPhoto, type Transportation } from "../tripPlanning";
import { dayTextOf } from "../dates";
import { usePhotoThumb } from "../photoThumbnails";
import { isLivePhotoUri } from "../photoTransfer";
import type { ReportReason, ReportTargetType } from "../serverData";
import { createReport } from "../serverData";
import * as Crypto from "expo-crypto";
import { parseAmount, amountText } from "../tripExpenses";
import { Image, Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { AppTheme } from "../theme";
import { Text, TextInput } from "../AppText";
import { EmptyState as SharedEmptyState } from "../ui/EmptyState";
import { Glyph } from "../Glyph";
import { showAlert } from "../showAlert";
import { 높이, 모서리, 불투명도, 아이콘, 여백, 누름여유 } from "../theme/controls";
import { typo } from "../theme/typography";
import { onAccent, status as statusColor } from "../theme/colors";
import { COVER_BADGE } from "../coverPhoto";
import { 공용스타일 } from "./styles";

/**
 * 여행 상세의 여섯 탭이 함께 쓰는 것들.
 *
 * 탭 파일끼리 서로를 부르면 한 탭을 고칠 때마다 옆 탭을 열어 봐야 한다. 두 곳 이상에서
 * 쓰는 문맥·작은 부품·작은 함수만 여기 모으고, 한 탭만 쓰는 것은 그 탭 파일에 둔다.
 * 화면 부품이 `src/ui/` 에 이미 있으면 그것을 감싸 쓴다(`docs/development/12-shared-ui-parts.md`).
 */

export const DetailThemeContext = createContext<AppTheme | undefined>(undefined);
/** 바닥 알림 한 줄 옆에 붙이는 단추. 저장한 것이 어디 있는지 데려가는 「보기」 같은 것이다. */
export type FeedbackAction = { label: string; onPress: () => void };
export const DetailFeedbackContext = createContext<(message: string, action?: FeedbackAction) => void>(() => undefined);
/**
 * 이 여행을 고칠 수 있는지. 보기만 하는 멤버에게는 false 다.
 *
 * 서버가 쓰기를 403 으로 막으니, 버튼을 그대로 두면 기기에서만 바뀌고 저장되지 않는다.
 * 고치는 길을 감추고, 목록을 눌러 여는 시트는 보기만 하게 연다(`DetailSheet`).
 */
export const DetailEditableContext = createContext(true);
export type ViewMode = "여행" | "장소" | "준비" | "요리" | "비용" | "기록";
/** 새 장소·일정·숙소 id. 서버가 이 UUID 를 그대로 받아 쓴다(backend/app/api/v1/places.py). */
export const newPlaceId = () => Crypto.randomUUID();
/**
 * 클립보드를 읽는다. 브라우저는 사용자가 허락하지 않으면 거절하는데, 그때 화면이 아무 반응
 * 없이 멈추면 안 된다. 읽지 못하면 빈 글자를 주고 부르는 쪽에서 안내한다.
 */
export async function readClipboard(): Promise<string> {
  try {
    return await Clipboard.getStringAsync();
  } catch {
    return "";
  }
}
/**
 * 입력칸 라벨 앞의 점 색.
 *
 * 필수든 선택이든 같은 색으로 찍혀 있어 글자를 읽기 전에는 구분이 안 됐다.
 * 라벨에는 「· 필수」를 적지 않고 선택 칸에만 「(선택)」을 붙이므로, 필수인지는
 * 칸이 `required` 로 따로 말한다.
 */
export const requiredDot = (required: boolean, theme?: AppTheme) =>
  theme && { backgroundColor: required ? theme.primary : theme.border };
/**
 * 시트를 여는 순간의 모습을 기준선으로 잡고, 지금 적힌 것이 그와 다른지 알려 준다.
 *
 * 바깥을 한 번 잘못 누르면 적던 것이 묻지도 않고 사라졌다(2026-09-23). 일정 시트가
 * 쓰던 기준선 비교를 시트마다 베껴 적는 대신 여기 모았다. 기준선을 「여는 순간」에
 * 잡는 것이 핵심이다. 만들 때 잡으면 지난번에 남은 값 때문에 손대지도 않은 시트가
 * 저장하지 않고 나갈지 묻는다.
 *
 * @param open 시트가 열려 있는지
 * @param key 시트에 지금 적힌 것을 한 줄로 만든 글
 */
export function useDraftChanged(open: boolean, key: string): boolean {
  const 기준선 = useRef(key);
  const 열려_있었나 = useRef(open);
  // 여는 그 렌더의 값을 기준선으로 잡는다. 여는 손길이 칸을 먼저 채우고 시트를 열기
  // 때문에 이 시점의 `key` 가 곧 「처음 모습」이다. effect 로 미루면 한 프레임 동안
  // 옛 기준선과 견주게 되고, 상태로 두면 시트를 열 때마다 한 번씩 더 그린다.
  // eslint-disable-next-line react-hooks/refs
  if (open && !열려_있었나.current) 기준선.current = key;
  // eslint-disable-next-line react-hooks/refs
  열려_있었나.current = open;
  // eslint-disable-next-line react-hooks/refs
  return open && key !== 기준선.current;
}
/** 빈 id 목록. 매번 새 배열을 만들면 그것만으로 effect 가 다시 돈다. */
export const NO_IDS: readonly string[] = [];
/** 사진이 붙지 않은 곳에 돌려줄 빈 목록. 위와 같은 까닭으로 하나만 만들어 쓴다. */
export const NO_PHOTOS: MemoryPhoto[] = [];
export function PhotoStrip({ photos, label }: { photos: MemoryPhoto[]; label: string }) {
  const theme = useContext(DetailThemeContext);
  if (!photos.length) return null;
  return (
    <View style={styles.photoStrip} accessibilityLabel={`${label} 사진 ${photos.length}장`}>
      {photos.slice(0, 5).map((photo) => (
        <PhotoStripThumb key={photo.id} photo={photo} />
      ))}
      {photos.length > 5 && (
        <Text style={[styles.photoStripMore, theme && { color: theme.muted }]}>+{photos.length - 5}</Text>
      )}
    </View>
  );
}

/**
 * 장소·일정 줄에 붙는 작은 사진 한 칸.
 *
 * 기기에 파일이 있으면 그것을, 없으면 썸네일을 받는다. 손톱만 한 칸이라 못 받았다는
 * 표는 붙이지 않는다 — 사진 색만 남는다. 다시 받는 길은 격자와 사진첩에 있다.
 */
function PhotoStripThumb({ photo }: { photo: MemoryPhoto }) {
  const 있는_것 = isLivePhotoUri(photo.uri) ? photo.uri : undefined;
  const { uri } = usePhotoThumb(photo.id, !있는_것 && isServerId(photo.id), 있는_것);
  return (
    <View style={[styles.photoStripThumb, { backgroundColor: photo.color }]}>
      {Boolean(uri) && <Image source={{ uri }} resizeMode="cover" style={공용스타일.memoryPhotoImage} />}
    </View>
  );
}

export function SectionLabel({
  label,
  count,
  action,
  onPress,
}: {
  label: string;
  count?: string;
  action?: string;
  onPress?: () => void;
}) {
  const theme = useContext(DetailThemeContext);
  return (
    <View style={styles.sectionLabel}>
      <View style={공용스타일.tabActionTitleRow}>
        <Text style={[공용스타일.sectionTitle, theme && { color: theme.text }]}>
          {label}
        </Text>
        {count && (
          <Text style={[공용스타일.tabActionCount, theme && { color: theme.muted, backgroundColor: theme.surfaceAlt }]}>
            {count}
          </Text>
        )}
      </View>
      {action && (
        <Pressable
          onPress={onPress}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={action}
          style={공용스타일.sectionActionHit}
        >
          <View style={공용스타일.sectionActionRow}>
            <Text
              style={[공용스타일.sectionAction, theme && { color: theme.primary }]}
            >
              {action}
            </Text>
            <Glyph name="arrowRight" size={아이콘.작게} color={theme?.primary ?? "#3F4C8F"} />
          </View>
        </Pressable>
      )}
    </View>
  );
}

export function MoneyBlock({ title, meta, action, onAction, children }: {
  title: string;
  meta?: string;
  action?: string;
  onAction?: () => void;
  children: React.ReactNode;
}) {
  const theme = useContext(DetailThemeContext);
  return (
    <View style={styles.moneyBlock}>
      <View style={styles.moneyBlockHead}>
        <View style={styles.moneyBlockTitleRow}>
          <Text style={[styles.moneyBlockTitle, theme && { color: theme.text }]}>{title}</Text>
          {Boolean(meta) && (
            <Text style={[styles.moneyBlockMeta, theme && { color: theme.muted, backgroundColor: theme.surfaceAlt }]}>
              {meta}
            </Text>
          )}
        </View>
        {action && onAction && (
          <Pressable
            onPress={onAction}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={action}
            style={styles.moneyBlockAction}
          >
            <Text style={[styles.moneyBlockActionText, theme && { color: theme.primary }]}>{action}</Text>
          </Pressable>
        )}
      </View>
      <View style={[styles.moneyBlockBody, theme && { backgroundColor: theme.surface, borderColor: theme.border }]}>
        {children}
      </View>
    </View>
  );
}

export function TabActionHeader({
  label,
  count,
  action,
  onPress,
}: {
  label: string;
  count: string;
  action: string;
  onPress: () => void;
}) {
  const theme = useContext(DetailThemeContext);
  const canEdit = useContext(DetailEditableContext);
  return (
    <View style={공용스타일.tabActionHeader}>
      <View style={공용스타일.tabActionTitleRow}>
        <Text style={[styles.tabActionTitle, theme && { color: theme.text }]}>{label}</Text>
        <Text style={[공용스타일.tabActionCount, theme && { color: theme.muted, backgroundColor: theme.surfaceAlt }]}>{count}</Text>
      </View>
      {/* 탭마다 한 번, 추가 버튼 자리에서 왜 버튼이 없는지 알린다. */}
      {!canEdit ? (
        <Text style={[공용스타일.tabActionReadOnly, theme && { color: theme.muted }]}>보기 전용 공간이에요</Text>
      ) : (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={action}
        style={({ pressed }) => [
          styles.tabActionButton,
          theme && { backgroundColor: theme.primary },
          pressed && 공용스타일.packingCardPressed,
        ]}
      >
        <View style={공용스타일.더하기줄}>
          <Glyph name="plus" size={아이콘.작게} color={theme ? onAccent(theme.dark) : "#FFFFFF"} weight={2.4} />
          <Text style={[styles.tabActionButtonText, theme && { color: onAccent(theme.dark) }]}>{action}</Text>
        </View>
      </Pressable>
      )}
    </View>
  );
}

/** 이 화면의 테마를 문맥에서 꺼내 부품에 넘기는 얇은 껍데기다. */
export function EmptyState({
  title,
  description,
  action,
  onPress,
}: {
  title: string;
  description: string;
  action: string;
  /** 없으면 버튼을 내지 않는다. 보기만 하는 멤버에게 추가 버튼을 감출 때 쓴다. */
  onPress?: () => void;
}) {
  const theme = useContext(DetailThemeContext);
  return (
    <SharedEmptyState
      theme={theme ?? undefined}
      title={title}
      description={description}
      action={action}
      onPress={onPress}
    />
  );
}

export function ListMoreButton({
  expanded,
  hiddenCount,
  onPress,
  label,
  opens = false,
}: {
  expanded: boolean;
  hiddenCount: number;
  onPress: () => void;
  /** 기본 말(「N개 더 보기」) 대신 적을 말. */
  label?: string;
  /** 그 자리에서 펴지 않고 다른 화면을 연다. 화살표가 아래가 아니라 오른쪽을 본다. */
  opens?: boolean;
}) {
  const theme = useContext(DetailThemeContext);
  const 말 = label ?? (expanded ? "간단히 보기" : `${hiddenCount}개 더 보기`);
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label ?? (expanded ? "목록 간단히 보기" : `${hiddenCount}개 더 보기`)}
      accessibilityState={opens ? undefined : { expanded }}
      style={[styles.listMoreButton, theme && { borderColor: theme.border }]}
    >
      <Text style={[styles.listMoreText, theme && { color: theme.text }]}>{말}</Text>
      {opens ? (
        <View style={styles.listMoreGlyph}>
          <Glyph name="chevronRight" size={아이콘.작게} color={theme?.primary ?? "#C0643F"} weight={2.2} />
        </View>
      ) : (
        <Text style={[styles.listMoreChevron, theme && { color: theme.primary }]}>{expanded ? "↑" : "↓"}</Text>
      )}
    </Pressable>
  );
}

export function TravelInfoRow({
  label,
  mark,
  title,
  meta,
  badge,
  color,
  link,
  linkSubject,
  onPress,
}: {
  label: string;
  mark: string;
  title: string;
  meta: string;
  /** 예약 상태처럼 한눈에 봐야 하는 말. 메타 줄 끝에 묻히면 안 읽힌다. */
  badge?: string;
  color: string;
  /** 예약 링크처럼 밖으로 나가는 주소. 줄을 누르면 수정이라, 링크는 따로 둔다. */
  link?: string;
  linkSubject?: string;
  onPress: () => void;
}) {
  const theme = useContext(DetailThemeContext);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.travelInfoRow,
        theme && { backgroundColor: theme.surface, borderColor: theme.border },
        pressed && 공용스타일.packingCardPressed,
      ]}
    >
      <View style={[styles.travelInfoAccent, { backgroundColor: color }]} />
      <View style={[styles.travelInfoTape, { backgroundColor: `${color}55` }]} />
      <View style={[styles.travelInfoLabel, { backgroundColor: `${color}18` }]}>
        <Text style={[styles.travelInfoMark, { color }]}>{mark}</Text>
        <Text style={[styles.travelInfoLabelText, { color }]}>{label}</Text>
      </View>
      <View style={styles.travelInfoCopy}>
        <View style={styles.travelInfoTitleRow}>
          <Text numberOfLines={1} style={[styles.travelInfoTitle, theme && { color: theme.text }]}>{title}</Text>
          {Boolean(badge) && (
            <View style={[styles.travelInfoBadge, { backgroundColor: `${color}1C` }]}>
              <Text style={[styles.travelInfoBadgeText, { color }]}>{badge}</Text>
            </View>
          )}
        </View>
        <Text numberOfLines={1} style={[styles.travelInfoMeta, theme && { color: theme.muted }]}>{meta}</Text>
      </View>
      {Boolean(link) && (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`${linkSubject ?? title} 열기`}
          hitSlop={누름여유(높이.칩)}
          onPress={(event) => { event.stopPropagation(); if (link) void Linking.openURL(link); }}
          style={({ pressed }) => [
            styles.travelInfoLink,
            { backgroundColor: `${color}18` },
            pressed && 공용스타일.packingCardPressed,
          ]}
        >
          <Text style={[styles.travelInfoLinkText, { color }]}>링크</Text>
        </Pressable>
      )}
      <View style={[styles.travelInfoArrowBox, { backgroundColor: `${color}18` }]}>
        <Glyph name="chevronRight" size={아이콘.보통} color={color} />
      </View>
    </Pressable>
  );
}

/**
 * 카드 오른쪽 위에 적는 갈아타는 곳. 한 곳이면 「동대구 갈아탐」, 여러 곳이면
 * 「2번 갈아탐」이다. 곧장 가면 빈 글자다 — 「곧장 감」이라고 굳이 적지 않는다.
 */
function 갈아타는_곳_말(leg: Transportation): string {
  const 곳 = (leg.stops ?? []).filter((stop) => stop.name.trim());
  if (!곳.length) return "";
  return 곳.length === 1 ? `${곳[0].name.trim()} 갈아탐` : `${곳.length}번 갈아탐`;
}

export function TransportCard({
  owner,
  leg,
  color,
  onPress,
}: {
  owner: string;
  leg: Transportation;
  color: string;
  onPress: () => void;
}) {
  const theme = useContext(DetailThemeContext);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${owner} ${leg.direction} ${leg.method} ${leg.departure}에서 ${leg.arrival}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.transportCard,
        theme && { backgroundColor: theme.surface, borderColor: theme.border },
        pressed && 공용스타일.packingCardPressed,
      ]}
    >
      <View style={[styles.transportCardRail, { backgroundColor: color }]} />
      <View style={styles.transportCardHead}>
        <Text numberOfLines={1} style={[styles.transportOwner, { color, flexShrink: 1 }]}>{owner}</Text>
        {/* 오른쪽 위 한 자리. 아직 예매 전이면 그것이 먼저다 — 해야 할 일이라서다.
            다 예매했으면 갈아타는 곳을 적는다. 곧장 가면 아무것도 안 적는다. */}
        {leg.status === "예매 전" ? (
          <Text style={[styles.transportStatus, { color: theme?.accent ?? "#B4453C" }]}>
            {leg.status}
          </Text>
        ) : 갈아타는_곳_말(leg) ? (
          <Text numberOfLines={1} style={[styles.transportStatus, { color: theme?.muted ?? "#727C8D", flexShrink: 1 }]}>
            {갈아타는_곳_말(leg)}
          </Text>
        ) : null}
      </View>
      {/* 「가는 편 · 무궁화호」처럼 길어지면 좁은 기기에서 한 줄에 안 들어간다. 줄여서
          「무궁화…」로 보이는 것보다 두 줄로 내려가는 쪽이 낫다. 카드 높이는 minHeight 라
          늘어나고, 옆 카드도 같은 높이로 맞춰진다. */}
      <Text style={[styles.transportMethod, theme && { color: theme.text }]}>{leg.direction} · {leg.method}</Text>
      <View style={styles.transportRoute}>
        <View style={styles.transportStop}>
          <Text numberOfLines={1} style={[styles.transportPlace, theme && { color: theme.text }]}>{leg.departure}</Text>
          <Text style={[styles.transportTime, { color }]}>{leg.departureTime}</Text>
        </View>
        <View style={styles.transportRouteLine}>
          <View style={[styles.transportRouteDot, { backgroundColor: color }]} />
          <View style={[styles.transportRouteRule, theme && { backgroundColor: theme.border }]} />
          <Glyph name="chevronRight" size={아이콘.작게} color={color} />
        </View>
        <View style={[styles.transportStop, styles.transportStopEnd]}>
          <Text numberOfLines={1} style={[styles.transportPlace, theme && { color: theme.text }]}>{leg.arrival}</Text>
          <Text style={[styles.transportTime, { color }]}>{leg.arrivalTime}</Text>
        </View>
      </View>
      <Text numberOfLines={1} style={[styles.transportReturn, theme && { color: theme.muted }]}>{dayTextOf(leg.date)}</Text>
    </Pressable>
  );
}

export function TravelMiniCard({
  label,
  mark,
  title,
  meta,
  color,
  onPress,
  large,
}: {
  label: string;
  mark: string;
  title: string;
  meta: string;
  color: string;
  onPress: () => void;
  large?: boolean;
}) {
  const theme = useContext(DetailThemeContext);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.travelMiniCard,
        large ? styles.travelMiniCardLarge : styles.travelMiniCardSmall,
        theme && { backgroundColor: theme.surface, borderColor: theme.border },
        { transform: [{ rotate: large ? "-.35deg" : ".45deg" }] },
        pressed && 공용스타일.packingCardPressed,
      ]}
    >
      <View style={[styles.travelMiniTape, { backgroundColor: `${color}55` }]} />
      <View style={styles.travelMiniTop}>
        <View style={[styles.travelMiniMark, { backgroundColor: `${color}18` }]}>
          <Text style={[styles.travelMiniMarkText, { color }]}>{mark}</Text>
        </View>
        <Text style={[styles.travelMiniLabel, { color }]}>{label}</Text>
      </View>
      <Text numberOfLines={1} style={[styles.travelMiniTitle, theme && { color: theme.text }]}>{title}</Text>
      <View style={styles.travelMiniBottom}>
        <Text numberOfLines={1} style={[styles.travelMiniMeta, theme && { color: theme.muted }]}>{meta}</Text>
        <Glyph name="chevronRight" size={아이콘.보통} color={color} />
      </View>
    </Pressable>
  );
}

export function Moment({
  time,
  title,
  note,
  mapUrl,
  last,
  compact,
  photos = [],
  onPress,
  id,
}: {
  time: string;
  title: string;
  note: string;
  mapUrl?: string;
  last?: boolean;
  compact?: boolean;
  /** 이 일정에 붙인 사진. 없으면 아무것도 그리지 않는다. */
  photos?: MemoryPhoto[];
  onPress?: () => void;
  /** 일정 줄의 id. 아직 못 올린 줄이면 여기에 표시가 붙는다. */
  id?: string;
}) {
  const theme = useContext(DetailThemeContext);
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={onPress ? `${title} 일정 수정` : undefined}
      style={[
        styles.moment,
        compact && styles.travelMomentCompact,
        theme && { borderColor: theme.border },
        last && styles.lastMoment,
      ]}
    >
      <View style={[styles.momentTime, compact && styles.travelMomentTimeCompact]}>
        <Text style={[styles.momentDay, compact && styles.travelMomentDayCompact, theme && { color: theme.primary }]}>
          {time}
        </Text>
        <View style={styles.dotLine}>
          <View
            style={[styles.dot, theme && { backgroundColor: theme.primary }]}
          />
          {!last && (
            <View
              style={[styles.line, theme && { backgroundColor: theme.border }]}
            />
          )}
        </View>
      </View>
      <View style={[styles.momentContent, compact && styles.travelMomentContentCompact]}>
        <Text style={[styles.momentTitle, theme && { color: theme.text }]}>
          {title}
        </Text>
        <Text style={[styles.momentNote, theme && { color: theme.muted }]}>
          {note}
        </Text>
        <SyncMark id={id} />
        {mapUrl ? (
          <View style={styles.mapLinkRow}>
            <MapLink
              theme={theme}
              url={mapUrl}
              compact={compact}
              subject={title}
            />
          </View>
        ) : null}
        <PhotoStrip photos={photos} label={title} />
      </View>
    </Pressable>
  );
}

export function PairedDetailField({
  label,
  leftValue,
  rightValue,
  onChangeLeft,
  onChangeRight,
  leftPlaceholder,
  rightPlaceholder,
  onSwap,
  accentColor,
  accentSoft,
  required = false,
}: {
  label: string;
  leftValue: string;
  rightValue: string;
  onChangeLeft: (text: string) => void;
  onChangeRight: (text: string) => void;
  leftPlaceholder: string;
  rightPlaceholder: string;
  onSwap?: () => void;
  accentColor?: string;
  accentSoft?: string;
  required?: boolean;
}) {
  const theme = useContext(DetailThemeContext);
  return (
    <View style={styles.detailField}>
      <View style={공용스타일.fieldLabelRow}>
        <View style={[공용스타일.fieldLabelDot, requiredDot(required, theme)]} />
        <Text style={[공용스타일.detailFieldLabel, theme && { color: theme.text }]}>{label}</Text>
      </View>
      <View style={styles.pairedFieldRow}>
        <TextInput
          accessibilityLabel={`${label} ${leftPlaceholder}`}
          value={leftValue}
          onChangeText={onChangeLeft}
          placeholder={leftPlaceholder}
          placeholderTextColor={theme?.muted ?? "#9AA1AE"}
          style={[styles.pairedFieldInput, theme && { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
        />
        <Pressable
          disabled={!onSwap}
          onPress={onSwap}
          accessibilityRole={onSwap ? "button" : undefined}
          accessibilityLabel={onSwap ? "출발지와 도착지 바꾸기" : undefined}
          hitSlop={{ top: 9, bottom: 9, left: 7, right: 7 }}
          style={[styles.pairedFieldArrow, { backgroundColor: accentSoft ?? theme?.primarySoft ?? "#FFF0ED" }]}
        >
          <Glyph name="arrowRight" size={아이콘.작게} color={accentColor ?? theme?.primary ?? "#FF6B63"} />
        </Pressable>
        <TextInput
          accessibilityLabel={`${label} ${rightPlaceholder}`}
          value={rightValue}
          onChangeText={onChangeRight}
          placeholder={rightPlaceholder}
          placeholderTextColor={theme?.muted ?? "#9AA1AE"}
          style={[styles.pairedFieldInput, theme && { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
        />
      </View>
    </View>
  );
}

/**
 * 금액 칸에 띄울 키보드.
 *
 * 안드로이드의 `numeric` 은 소수점 키가 없는 숫자 키패드다. 그래서 24.50 달러나 환율
 * 9.3 을 칠 수 없었고, 9.3 을 93 으로 적으면 환산이 10배가 됐다(2026-09-23). 소수를
 * 받는 통화에서만 `decimal-pad` 로 연다. 원·엔처럼 소수가 없는 통화는 점이 없는 편이
 * 오히려 덜 헷갈린다. iOS 는 둘 다 소수점이 있는 키패드로 뜬다.
 */
export const 금액_키보드 = (fraction: number): "numeric" | "decimal-pad" => (fraction > 0 ? "decimal-pad" : "numeric");

/**
 * 금액 칸에 다시 적을 글자. 치는 도중의 모양을 지키면서 자릿수를 끊는다.
 *
 * 소수를 받는 통화는 「24.」처럼 아직 숫자가 안 된 상태를 지우지 않아야 뒤 자릿수를
 * 이어 칠 수 있다. 이 셈을 금액 칸마다 따로 적다 보니 어떤 칸은 점이 곧바로 지워져,
 * 소수점 키보드를 붙여도 소수를 못 적었다(2026-09-23). 한자리에 모아 둔다.
 */
export const 금액_치기 = (text: string, fraction: 0 | 2): string => {
  if (fraction > 0 && /[.]\d{0,1}$/.test(text)) return text.replace(/[^\d.]/g, "");
  const amount = parseAmount(text, fraction);
  return amount ? amountText(amount, fraction) : "";
};

/**
 * 길이 한도를 두지 않은 칸의 기본값. 서버 스키마에서 가장 흔한 값이다.
 *
 * 한도가 없으면 서버가 422 로 되돌려 보내는데, 토스트만 뜨고 어느 칸이 왜인지 알 수
 * 없었다(2026-09-23). 한 줄 칸은 제목·이름 대부분이 60자, 여러 줄 칸은 메모가 2,000자다.
 * 더 받는 칸(장소 이름 100, 주소 300, 일기 본문 20,000)은 그 자리에서 따로 넘긴다.
 */
const 칸_기본_한도 = { 한_줄: 60, 여러_줄: 2000 };

/**
 * 목록을 통째로 붙여넣는 칸의 한도.
 *
 * 메모장에서 스무 줄을 옮겨 오는 자리라 서버 한 줄의 한도와 상관이 없다. 여기 적은 글은
 * 줄마다 쪼개져 항목이 되고, 글 자체는 서버로 가지 않는다. 그래도 한도를 아예 안 두면
 * 실수로 붙여넣은 수십만 자가 화면을 멈추게 한다.
 */
export const 붙여넣기_한도 = 50000;

export function DetailField({
  label,
  multiline,
  required = false,
  maxLength,
  ...props
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: "default" | "numeric" | "decimal-pad" | "url";
  /** 서버가 받는 한도. 넘겨 두면 저장할 때 잘리는 대신 처음부터 못 넘긴다. */
  maxLength?: number;
  autoCapitalize?: "none" | "sentences";
  /** 비우면 저장할 수 없는 칸. 라벨 앞 점이 강조색이 된다. */
  required?: boolean;
}) {
  const theme = useContext(DetailThemeContext);
  // 이미 적혀 있던 긴 값은 자르지 않는다. 옛 기록을 열었을 뿐인데 글이 잘리면,
  // 고치려고 연 사람이 무엇을 잃었는지도 모른 채 저장하게 된다.
  const 한도 = Math.max(maxLength ?? (multiline ? 칸_기본_한도.여러_줄 : 칸_기본_한도.한_줄), props.value.length);
  return (
    <View style={styles.detailField}>
      <View style={공용스타일.fieldLabelRow}>
        <View
          style={[공용스타일.fieldLabelDot, requiredDot(required, theme)]}
        />
        <Text style={[공용스타일.detailFieldLabel, theme && { color: theme.text }]}>
          {label}
        </Text>
      </View>
      <TextInput
        {...props}
        maxLength={한도}
        accessibilityLabel={label}
        multiline={multiline}
        placeholderTextColor={theme?.muted ?? "#9AA1AE"}
        style={[
          styles.detailFieldInput,
          theme && {
            backgroundColor: theme.surface,
            borderColor: theme.border,
            color: theme.text,
          },
          multiline && styles.detailFieldMultiline,
        ]}
      />
    </View>
  );
}

/**
 * 매번 쓰지는 않는 칸들을 한 줄 아래로 접는다.
 *
 * 본체는 `ui/OptionalFormSection` 으로 옮겼다. 새 여행 시트도 같은 줄을 쓴다.
 * 여기서는 이 화면의 테마와 「고칠 수 있는지」를 문맥에서 꺼내 부품에 넘기기만 한다.
 */
export function OptionalFormSection(props: Omit<React.ComponentProps<typeof SharedOptionalFormSection>, "theme" | "editable">) {
  const theme = useContext(DetailThemeContext);
  const editable = useContext(DetailEditableContext);
  return <SharedOptionalFormSection {...props} theme={theme} editable={editable} />;
}

/**
 * 「시간  11:00 ›」 꼴의 한 줄. 누르면 그 자리에서 시각 고르기가 펼쳐진다.
 *
 * 시간처럼 값 하나만 적는 칸은 라벨 줄 + 입력 상자 두 층(약 80px)보다 이 한 줄이
 * 낮다. 주 입력 아래에 세그먼트 두 줄과 이 줄까지 놓아도 키보드가 올라온 시트에
 * 들어간다.
 *
 * 예전에는 안드로이드만 돌리는 창을 열고 아이폰·웹은 맨 글자 칸이었다. 플랫폼마다
 * 다른 데다, 키패드만 주는 방식은 시장에 거의 없다(`ui/TimeWheel` 머리말 참고).
 * 이제 세 곳 다 같은 것을 쓴다.
 */
export function TimeRow({
  label,
  value,
  onChange,
  fallback,
  optional = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  fallback: string;
  optional?: boolean;
}) {
  const theme = useContext(DetailThemeContext);
  const [열림, set열림] = useState(false);
  return (
    <>
      <View style={[styles.valueRow, theme && { borderBottomColor: theme.border }]}>
        {/* 좁은 폰에서 「출발 시간 (선택)」이 두 줄로 꺾였다. 한 줄로 못 박는다. */}
        <Text numberOfLines={1} style={[styles.valueRowLabel, theme && { color: theme.text }]}>{label}</Text>
        <Pressable
          onPress={() => set열림((앞) => !앞)}
          accessibilityRole="button"
          accessibilityState={{ expanded: 열림 }}
          accessibilityLabel={`${label}, ${value || "시간 미정"}`}
          accessibilityHint="눌러서 시와 분을 골라요"
          style={({ pressed }) => [styles.valueRowAction, pressed && 공용스타일.controlPressed]}
        >
          <Text style={[styles.valueRowValue, theme && { color: value ? theme.text : theme.muted }]}>
            {value || "시간 미정"}
          </Text>
          <Glyph name={열림 ? "chevronDown" : "chevronRight"} size={아이콘.보통} color={theme?.muted ?? "#9AA1AE"} />
        </Pressable>
      </View>
      {열림 && (
        <TimeWheel
          theme={theme}
          label={label}
          value={value}
          fallback={fallback}
          optional={optional}
          onChange={onChange}
        />
      )}
    </>
  );
}

/**
 * 뒤 시각이 앞 시각보다 빨라지는 순간 한 번 알린다.
 *
 * 막지는 않는다. 뒤쪽을 먼저 당겨 놓고 앞쪽을 고치려는 사람도 있어서, 고치는
 * 도중에 손을 묶으면 더 답답하다. 숙소는 저장 단추가 그대로 잠겨 있고, 교통편은
 * 밤을 넘겨 가는 편이 있어 잠그지 않는다.
 *
 * 「맞다가 어긋나는 순간」에만 알린다. 시각 돌림칸은 돌리는 내내 값을 바꾸는데
 * 그때마다 알리면 창이 쉴 새 없이 뜬다.
 */
export function useOrderWarning(볼_때인가: boolean, 제대로인가: boolean, 제목: string, 설명: string): void {
  const 앞서_제대로였나 = useRef(true);
  useEffect(() => {
    if (!볼_때인가) {
      앞서_제대로였나.current = true;
      return;
    }
    if (앞서_제대로였나.current && !제대로인가) showAlert(제목, 설명);
    앞서_제대로였나.current = 제대로인가;
  }, [볼_때인가, 제대로인가, 제목, 설명]);
}

/**
 * 숙소의 체크인·체크아웃.
 *
 * 상자는 하나만 두고 머리에 「체크인 / 체크아웃」 두 이름을 나란히 적는다. 누른
 * 쪽의 날짜와 시간이 아래에 나온다. 예전에는 같은 상자를 둘로 쌓아, 제목 줄과
 * 날짜 칩 줄과 시간 줄이 두 벌씩 여섯 줄을 썼다. 고치는 것은 한 번에 한쪽뿐이라
 * 칩과 시간 줄도 한 벌이면 된다.
 */
export function StayRangePicker({
  checkin,
  checkout,
  dates,
  onChange,
}: {
  checkin: string;
  checkout: string;
  dates: string[];
  onChange: (쪽: "checkin" | "checkout", part: "date" | "time", value: string) => void;
}) {
  const theme = useContext(DetailThemeContext);
  const [고른쪽, set고른쪽] = useState<"checkin" | "checkout">("checkin");
  const 값 = 고른쪽 === "checkin" ? checkin : checkout;
  const time = 값.match(/\d{1,2}:\d{2}$/)?.[0] ?? "12:00";
  const date = 값.replace(/\s*\d{1,2}:\d{2}$/, "").trim() || dates[0];
  // 치는 동안의 글자는 여기서 들고 있는다. 시각은 「날짜 시각」 한 문자열에 담겨
  // 부모로 올라가는데, 「15:30」이 되기 전의 「1」「15」「153」은 그 문자열에서 시각으로
  // 못 읽혀 기본값으로 튕겼다. 그래서 웹에서 체크인 시간을 아예 칠 수 없었다.
  // 완성된 시각(HH:MM)만 부모에 올리고, 부모 값이 밖에서 바뀌면 다시 받는다.
  const [timeText, setTimeText] = useState(time);
  const 올린_시각 = useRef(time);
  useEffect(() => {
    if (time !== 올린_시각.current) {
      올린_시각.current = time;
      setTimeText(time);
    }
  }, [time]);
  const onTimeText = (next: string) => {
    setTimeText(next);
    if (/^\d{2}:\d{2}$/.test(next)) {
      올린_시각.current = next;
      onChange(고른쪽, "time", next);
    }
  };
  const 이름 = (쪽: "checkin" | "checkout", 글: string) => {
    const 골랐나 = 고른쪽 === 쪽;
    return (
      <Pressable
        onPress={() => set고른쪽(쪽)}
        accessibilityRole="tab"
        accessibilityState={{ selected: 골랐나 }}
        accessibilityLabel={`${글}, ${쪽 === "checkin" ? checkin : checkout}`}
        hitSlop={누름여유(높이.칩)}
        style={({ pressed }) => [pressed && 공용스타일.controlPressed]}
      >
        <Text
          style={[
            styles.stayPickerLabel,
            theme && { color: theme.muted },
            골랐나 && styles.stayPickerLabelOn,
            골랐나 && theme && { color: theme.text },
          ]}
        >
          {글}
        </Text>
      </Pressable>
    );
  };
  return (
    <View style={[styles.stayPicker, theme && { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
      <View style={styles.stayPickerHead}>
        <View style={styles.stayPickerTabs}>
          {이름("checkin", "체크인")}
          <Text style={[styles.stayPickerSlash, theme && { color: theme.border }]}>/</Text>
          {이름("checkout", "체크아웃")}
        </View>
        <Text style={[styles.stayPickerValue, theme && { color: theme.primary }]}>{값}</Text>
      </View>
      <OptionField label="날짜" options={dates} value={date} onChange={(value) => onChange(고른쪽, "date", value)} />
      {/* 시각은 일정·교통편·예약과 같은 한 줄짜리를 쓴다. 숙소만 큰 상자였다. */}
      <TimeRow label="시간" value={timeText} onChange={onTimeText} fallback={time} />
    </View>
  );
}
/**
 * 여행 화면의 시트. 껍데기는 `ui/SheetShell` 이 그리고 여기서는 이 화면에만
 * 있는 세 가지만 얹는다.
 *
 * 1. 권한. 보기만 하는 멤버에게는 잠긴 시트로 연다. 다만 저장 버튼이 이미
 *    「닫기」인 시트는 둘러보는 시트라 막지 않는다.
 * 2. 안쪽 칸까지 같이 잠그기. 잠긴 시트 안의 입력 칸도 고칠 수 없는 모습이어야
 *    해서 `DetailEditableContext` 를 시트 안에서 다시 내린다.
 * 3. 제목으로 고르는 색 막대. 장소·숙소·기록은 보조색, 준비·예약은 강조색이다.
 */
export function DetailSheet({
  visible,
  title,
  subtitle,
  submit,
  disabledHint,
  destructiveLabel,
  destructiveMessage,
  confirmSubmit,
  submitDisabled = false,
  hasUnsavedChanges = false,
  readOnly,
  readOnlyHint = "보기 전용 공간이에요",
  onClose,
  onSubmit,
  onDestructive,
  children,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  submit: string;
  disabledHint?: string;
  destructiveLabel?: string;
  destructiveMessage?: string;
  /**
   * 저장 자체가 되돌릴 수 없을 때 한 번 더 묻는 말.
   *
   * 지우는 버튼이 따로 있는 경우와 달리, 목록 교체처럼 저장 버튼이 곧 삭제인
   * 자리가 있다. 그때는 저장을 눌러도 바로 하지 않고 이 문장을 보여 준다.
   */
  confirmSubmit?: string;
  submitDisabled?: boolean;
  hasUnsavedChanges?: boolean;
  /**
   * 고칠 수 없는 사람에게 연 시트. 입력을 막고 저장·삭제 대신 닫기만 둔다.
   *
   * 주지 않으면 공간 권한을 따른다. 보기만 하는 멤버도 목록을 눌러 자세한 내용은 볼 수 있다.
   * 저장 버튼이 `닫기` 인 시트는 둘러보는 시트라 막지 않는다.
   */
  readOnly?: boolean;
  /** 막았을 때 버튼 위에 보이는 말. */
  readOnlyHint?: string;
  onClose: () => void;
  onSubmit: () => void | Promise<void>;
  onDestructive?: () => void;
  children: React.ReactNode;
}) {
  const theme = useContext(DetailThemeContext);
  const canEdit = useContext(DetailEditableContext);
  const locked = readOnly ?? (!canEdit && submit !== "닫기");
  const sheetKind = title.includes("일정")
    ? "일정"
    : title.includes("장소")
      ? "장소"
      : title.includes("준비") || title.includes("담당")
        ? "준비"
        : title.includes("요리") || title.includes("재료")
          ? "요리"
          : title.includes("붙여넣기") || title.includes("태그 선택")
            ? "목록"
          : title.includes("교통")
            ? "교통"
            : title.includes("숙소")
              ? "숙소"
              : title.includes("예약")
                ? "예약"
          : title.includes("기록") || title.includes("사진") || title.includes("일기") || title.includes("카드") || title.includes("메모")
            ? "기록"
            : "Daymo";
  const sheetAccent = theme
    ? sheetKind === "장소"
      ? theme.secondary
      : sheetKind === "준비"
        ? theme.accent
        : sheetKind === "요리"
          ? theme.secondary
        : sheetKind === "숙소"
          ? theme.secondary
        : sheetKind === "예약"
          ? theme.accent
        : sheetKind === "기록"
          ? theme.secondary
          : theme.primary
    : "#FF6B63";
  return (
    <SheetShell
      theme={theme}
      visible={visible}
      title={title}
      subtitle={subtitle}
      accent={sheetAccent}
      submit={submit}
      onSubmit={onSubmit}
      submitDisabled={submitDisabled}
      disabledHint={disabledHint}
      // 저장을 기다리는 동안은 버튼 글을 바꿔 둔다. 그대로 두면 한 번 더 눌러도
      // 되는 줄 알고 누른다.
      busyLabel="저장 중…"
      confirmSubmit={confirmSubmit}
      destructiveLabel={destructiveLabel}
      destructiveMessage={destructiveMessage}
      locked={locked}
      lockedHint={readOnlyHint}
      hasUnsavedChanges={hasUnsavedChanges}
      onClose={onClose}
      onDestructive={onDestructive}
    >
      {/* 잠긴 시트 안의 칸들도 고칠 수 없는 모습이어야 한다. 누르지 못하게 막는
          것은 껍데기가 하지만, 흐리게 그리는 것은 칸들이 이 값을 보고 한다. */}
      <DetailEditableContext.Provider value={canEdit && !locked}>
        {children}
      </DetailEditableContext.Provider>
    </SheetShell>
  );
}
export function InfoPanel({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const theme = useContext(DetailThemeContext);
  return (
    <SheetShell
      theme={theme}
      visible={visible}
      title={title}
      onClose={onClose}
      // 둘러보기만 하는 패널이라 맨 아래 저장 버튼이 없다. 대신 머리의 「완료」로
      // 닫으므로 기본 머리(색 막대 + 제목 + ×) 대신 직접 그린다.
      renderHead={(panHandlers) => (
        <View style={sheetHeadStyles.head}>
          <View {...panHandlers} style={sheetHeadStyles.copy}>
            <Text style={[sheetHeadStyles.title, theme && { color: theme.text }]}>
              {title}
            </Text>
          </View>
          <Pressable
            onPress={onClose}
            hitSlop={누름여유(높이.칩)}
            accessibilityRole="button"
            accessibilityLabel={`${title} 닫기`}
            style={[styles.infoPanelCloseButton, theme && { backgroundColor: theme.primarySoft }]}
          >
            <Text style={[styles.infoPanelCloseText, theme && { color: theme.primary }]}>
              완료
            </Text>
          </Pressable>
        </View>
      )}
      // 안쪽 여백은 패널에 담기는 줄들이 직접 가지고 있다.
      padBody={false}
    >
      {children}
    </SheetShell>
  );
}
export function InfoLine({ label, value }: { label: string; value: string }) {
  const theme = useContext(DetailThemeContext);
  return (
    <View style={[styles.infoLine, theme && { borderColor: theme.border }]}>
      <Text style={[styles.infoLineLabel, theme && { color: theme.muted }]}>
        {label}
      </Text>
      <Text style={[styles.infoLineValue, theme && { color: theme.text }]}>
        {value}
      </Text>
    </View>
  );
}

const REPORT_REASONS: { label: string; value: ReportReason }[] = [
  { label: "스팸·광고", value: "spam" },
  { label: "괴롭힘·혐오", value: "harassment" },
  { label: "음란·성적", value: "sexual" },
  { label: "폭력·위협", value: "violence" },
  { label: "개인정보 노출", value: "privacy" },
  { label: "저작권 침해", value: "copyright" },
  { label: "기타", value: "other" },
];

/**
 * 신고 사유를 고르고 보낸다. 지금 열린 시트 안에 펼친다.
 *
 * 시트 위에 창을 하나 더 띄우지 않는다. iOS 에서는 Modal 이 겹치면 뒤에 연 것이
 * 뜨지 않을 때가 있다. 누가 신고했는지는 상대에게 알려지지 않는다.
 */
export function ReportForm({
  spaceId,
  targetType,
  targetId,
  onClose,
}: {
  spaceId: string;
  targetType: ReportTargetType;
  targetId: string;
  onClose: () => void;
}) {
  const theme = useContext(DetailThemeContext);
  const danger = theme?.dark ? statusColor.danger.dark : statusColor.danger.light;
  const [reason, setReason] = useState("");
  const [detail, setDetail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const box = [styles.deleteConfirm, theme && { backgroundColor: theme.surfaceAlt, borderColor: theme.border }];

  if (sent) {
    return (
      <View accessibilityLiveRegion="polite" style={box}>
        <View style={styles.deleteConfirmCopy}>
          <Text style={[styles.deleteConfirmTitle, theme && { color: theme.text }]}>신고를 받았어요. 확인 후 조치할게요.</Text>
          <Text style={[styles.deleteConfirmMessage, theme && { color: theme.muted }]}>신고한 사람은 상대에게 알려지지 않아요.</Text>
        </View>
        <Pressable onPress={onClose} accessibilityRole="button" style={[styles.deleteConfirmButton, theme && { borderColor: theme.border }]}>
          <Text style={[styles.deleteConfirmCancel, theme && { color: theme.text }]}>닫기</Text>
        </Pressable>
      </View>
    );
  }

  const send = async () => {
    const picked = REPORT_REASONS.find((item) => item.label === reason);
    if (!picked || sending) return;
    setSending(true);
    setError("");
    try {
      await createReport({
        spaceId,
        targetType,
        targetId,
        reason: picked.value,
        ...(detail.trim() ? { detail: detail.trim().slice(0, 1000) } : {}),
      });
      setSent(true);
    } catch (caught) {
      setError(caught instanceof DaymoApiError && caught.status !== 0 ? caught.message : "보내지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.");
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={box}>
      <View style={styles.deleteConfirmCopy}>
        <Text style={[styles.deleteConfirmTitle, theme && { color: theme.text }]}>어떤 점이 문제인가요?</Text>
        <Text style={[styles.deleteConfirmMessage, theme && { color: theme.muted }]}>운영자가 확인해요. 신고한 사람은 상대에게 알려지지 않아요.</Text>
      </View>
      <OptionField label="신고 사유" required options={REPORT_REASONS.map((item) => item.label)} value={reason} onChange={setReason} />
      <DetailField label="자세한 내용 (선택)" value={detail} onChangeText={setDetail} placeholder="예: 어떤 부분이 문제인지" multiline maxLength={1000} />
      {error ? <Text accessibilityLiveRegion="assertive" style={[styles.deleteConfirmMessage, { color: danger }]}>{error}</Text> : null}
      <View style={styles.deleteConfirmActions}>
        <Pressable onPress={onClose} accessibilityRole="button" style={[styles.deleteConfirmButton, theme && { borderColor: theme.border }]}>
          <Text style={[styles.deleteConfirmCancel, theme && { color: theme.text }]}>취소</Text>
        </Pressable>
        <Pressable
          onPress={() => void send()}
          disabled={!reason || sending}
          accessibilityRole="button"
          accessibilityState={{ disabled: !reason || sending, busy: sending }}
          style={[styles.deleteConfirmButton, { backgroundColor: danger, borderColor: danger }, (!reason || sending) && styles.sheetSubmitDisabled]}
        >
          <Text style={[styles.deleteConfirmDanger, { color: onAccent(Boolean(theme?.dark)) }]}>{sending ? "보내는 중…" : "신고하기"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** 시트 맨 아래의 `신고하기`. 누르면 그 자리에 신고 칸이 펼쳐진다. */
/**
 * 홈 화면에 쓰는 중이라는 작은 표시.
 *
 * 목록을 훑을 때 어느 것이 홈에 올라가 있는지 바로 보여야 한다. 사진 위에 얹히므로
 * 밝은 사진에서도 읽히게 어두운 바탕을 깐다. 격자의 「꾸미는 중」 표도 같은 모양을 쓴다.
 */
export function CoverBadge() {
  return (
    <View style={공용스타일.coverBadge} pointerEvents="none">
      <Glyph name="home" size={아이콘.작게} color="#FFFFFF" />
      <Text style={공용스타일.coverBadgeText}>{COVER_BADGE}</Text>
    </View>
  );
}

export function ReportLink({
  label,
  ...target
}: {
  label: string;
  spaceId: string;
  targetType: ReportTargetType;
  targetId: string;
}) {
  const theme = useContext(DetailThemeContext);
  const [open, setOpen] = useState(false);
  if (open) return <ReportForm {...target} onClose={() => setOpen(false)} />;
  return (
    <Pressable onPress={() => setOpen(true)} accessibilityRole="button" style={styles.reportLink}>
      <Text style={[styles.reportLinkText, theme && { color: theme.muted }]}>{label}</Text>
    </Pressable>
  );
}

/**
 * 여럿 중 하나를 고르는 칸.
 *
 * 선택지가 다섯 개 이하면 한 줄 세그먼트(`ui/Segment`), 여섯 개부터는 가로로 미는
 * 칩이다. 날짜·종류·방향처럼 매번 고르는 것은 세그먼트가 칩보다 낮아(36 대 44)
 * 키보드가 올라와 시트가 좁아져도 주 입력 아래에 들어간다. 부르는 쪽은 개수를
 * 세지 않고 그냥 넘긴다.
 */
export function OptionField({
  label,
  options,
  value,
  onChange,
  required = false,
  labelOf,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  /** 고른 값과 보이는 글이 다를 때. 날짜 칸이 `2026-09-23` 을 들고 `23일(수)` 로 보인다. */
  labelOf?: (option: string) => string;
}) {
  const theme = useContext(DetailThemeContext);
  const labelRow = (
    <View style={공용스타일.fieldLabelRow}>
      <View
        style={[공용스타일.fieldLabelDot, requiredDot(required, theme)]}
      />
      <Text style={[공용스타일.detailFieldLabel, theme && { color: theme.text }]}>
        {label}
      </Text>
    </View>
  );
  if (options.length <= 세그먼트_최대) {
    return (
      <View style={공용스타일.optionField}>
        {labelRow}
        <Segment
          theme={theme}
          label={label}
          options={labelOf ? options.map((option) => ({ value: option, label: labelOf(option) })) : options}
          value={value}
          onChange={onChange}
        />
      </View>
    );
  }
  return (
    <View style={공용스타일.optionField}>
      {labelRow}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.optionRow}
      >
        {options.map((option) => (
          <Pressable
            key={option}
            onPress={() => onChange(option)}
            hitSlop={{ top: 3, bottom: 3, left: 1, right: 1 }}
            accessibilityRole="button"
            accessibilityState={{ selected: value === option }}
            style={({ pressed }) => [
              styles.optionChip,
              theme && {
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
              value === option && 공용스타일.optionChipActive,
              value === option &&
                theme && {
                  backgroundColor: theme.primarySoft,
                  borderColor: theme.primary,
                },
              pressed && 공용스타일.controlPressed,
            ]}
          >
            <Text
              style={[
                공용스타일.optionText,
                theme && { color: theme.muted },
                value === option && 공용스타일.optionTextActive,
                value === option && theme && { color: theme.primary },
              ]}
            >
              {labelOf ? labelOf(option) : option}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  travelMomentCompact: { minHeight: 높이.저장 },
  travelMomentTimeCompact: { width: 84 },
  travelMomentDayCompact: { width: 62, fontSize: 12 },
  travelMomentContentCompact: { paddingLeft: 4 },
  // 한 줄에 둘씩 놓는다. `maxWidth` 가 없으면 한 장뿐일 때 `flexGrow` 가 그 한 장을
  // 화면 폭까지 늘려, 같은 카드가 상황에 따라 두 배로 커 보인다. 둘일 때의 크기를
  // 그대로 지킨다.
  transportCard: { flexGrow: 1, flexBasis: "46%", maxWidth: "48%", minWidth: 0, minHeight: 119, borderWidth: 1, borderRadius: 모서리.행, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8, overflow: "hidden", position: "relative" },
  transportCardRail: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3 },
  transportCardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  transportOwner: { fontSize: 12, fontFamily: typo.label.family },
  transportStatus: { fontSize: 12, fontFamily: typo.label.family },
  transportMethod: { fontSize: 12, fontFamily: typo.label.family, marginTop: 6 },
  transportRoute: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  transportStop: { flex: 1, minWidth: 0 },
  transportStopEnd: { alignItems: "flex-end" },
  transportPlace: { fontSize: 12, fontFamily: typo.label.family },
  transportTime: { fontSize: 11, fontFamily: typo.caption.family, marginTop: 2 },
  transportRouteLine: { width: 31, flexDirection: "row", alignItems: "center", marginHorizontal: 2 },
  transportRouteDot: { width: 4, height: 4, borderRadius: 모서리.원 },
  transportRouteRule: { flex: 1, height: 1 },
  transportReturn: { fontSize: 12, fontFamily: typo.label.family, marginTop: 8 },
  pairedFieldRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  pairedFieldInput: { flex: 1, minWidth: 0, height: 높이.입력, borderWidth: 1, borderRadius: 모서리.버튼, paddingHorizontal: 여백.가로좁게, fontSize: 14, textAlign: "center" },
  pairedFieldArrow: { width: 27, height: 27, borderRadius: 모서리.상자, alignItems: "center", justifyContent: "center" },
  travelMiniCard: {
    minHeight: 86,
    borderWidth: 1,
    borderRadius: 모서리.행,
    padding: 12,
    position: "relative",
    overflow: "hidden",
  },
  travelMiniCardLarge: { flex: 1.18 },
  travelMiniCardSmall: { flex: 0.82 },
  travelMiniTape: {
    position: "absolute",
    top: -2,
    left: "38%",
    width: 27,
    height: 8,
    borderRadius: 모서리.표식,
    transform: [{ rotate: "-4deg" }],
  },
  travelMiniTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  travelMiniMark: {
    minWidth: 27,
    height: 24,
    borderRadius: 모서리.상자,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  travelMiniMarkText: { fontSize: 12, fontFamily: typo.label.family },
  travelMiniLabel: { fontSize: 12, fontFamily: typo.label.family, letterSpacing: 0.5 },
  travelMiniTitle: { fontSize: 14, fontFamily: typo.title.family, marginTop: 6 },
  travelMiniBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  travelMiniMeta: { flex: 1, fontSize: 11, fontFamily: typo.caption.family },
  travelInfoRow: {
    minHeight: 62,
    borderWidth: 1,
    borderRadius: 모서리.행,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    position: "relative",
    overflow: "hidden",
  },
  travelInfoAccent: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  travelInfoTape: {
    position: "absolute",
    top: -2,
    left: 22,
    width: 24,
    height: 7,
    borderRadius: 모서리.표식,
    transform: [{ rotate: "-4deg" }],
  },
  travelInfoLabel: {
    width: 48,
    height: 45,
    borderRadius: 모서리.상자,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
    transform: [{ rotate: "-2deg" }],
  },
  travelInfoMark: { fontSize: 12, lineHeight: 15, fontFamily: typo.label.family },
  travelInfoLabelText: { fontSize: 12, fontFamily: typo.label.family, marginTop: 2 },
  travelInfoCopy: { flex: 1, minWidth: 0 },
  travelInfoTitle: { fontSize: 14, fontFamily: typo.title.family },
  travelInfoTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  travelInfoBadge: { borderRadius: 모서리.표식, paddingHorizontal: 6, paddingVertical: 2 },
  travelInfoBadgeText: { fontSize: 12, fontFamily: typo.label.family },
  travelInfoMeta: { fontSize: 13, fontFamily: typo.caption.family, marginTop: 2 },
  travelInfoArrowBox: {
    width: 27,
    height: 27,
    borderRadius: 모서리.상자,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  travelInfoLink: {
    minHeight: 높이.칩,
    borderRadius: 모서리.버튼,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  travelInfoLinkText: { fontSize: 13, fontFamily: typo.label.family },
  moment: { flexDirection: "row", minHeight: 67 },
  lastMoment: { minHeight: 46 },
  momentTime: { width: 82, flexDirection: "row" },
  momentDay: {
    color: "#B1776B",
    fontSize: 14,
    fontFamily: typo.data.family,
    width: 57,
    paddingTop: 2,
  },
  dotLine: { alignItems: "center", width: 15 },
  line: { flex: 1, width: 1, backgroundColor: "#F0DCD2", marginTop: 4 },
  momentContent: { flex: 1, paddingLeft: 6 },
  momentTitle: { fontSize: 14, fontFamily: typo.title.family },
  momentNote: { fontSize: 14, marginTop: 4 },
  photoStrip: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 },
  photoStripThumb: { width: 34, height: 34, borderRadius: 모서리.표식, overflow: "hidden" },
  photoStripMore: { fontSize: 11, fontFamily: typo.label.family, color: "#6F7888" },
  infoPanelCloseButton: {
    minWidth: 52,
    height: 높이.칩,
    borderRadius: 모서리.버튼,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  infoPanelCloseText: { fontSize: 16, lineHeight: 20, fontFamily: typo.label.family },
  detailField: { marginBottom: 12 },
  detailFieldMultiline: {
    height: 104,
    paddingTop: 16,
    textAlignVertical: "top",
  },
  // 「시간  11:00 ›」 한 줄. 라벨 줄과 입력 상자 두 층 대신 버튼 높이 하나다.
  valueRow: {
    minHeight: 높이.버튼,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E0DA",
    marginBottom: 12,
  },
  valueRowLabel: { fontSize: 14, fontFamily: typo.body.family, flexShrink: 1 },
  valueRowAction: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 높이.버튼, flexShrink: 0 },
  valueRowValue: { fontSize: 14, fontFamily: typo.data.family },
  stayPicker: {
    borderWidth: 1,
    borderRadius: 모서리.구역,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 2,
    marginBottom: 12,
  },
  stayPickerHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  stayPickerTabs: { flexDirection: "row", alignItems: "center", gap: 8 },
  stayPickerLabel: { fontSize: 14, fontFamily: typo.label.family },
  /** 고르고 있는 쪽. 흐린 쪽과 굵기로 가른다. */
  stayPickerLabelOn: { fontFamily: typo.title.family },
  stayPickerSlash: { fontSize: 14, fontFamily: typo.body.family },
  stayPickerValue: { fontSize: 14, fontFamily: typo.data.family },
  sheetSubmitDisabled: { opacity: 불투명도.비활성 },
  infoLine: {
    minHeight: 58,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E0DA",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  infoLineLabel: { fontSize: 12, fontFamily: typo.label.family },
  infoLineValue: {
    fontSize: 14,
    fontFamily: typo.data.family,
    maxWidth: "70%",
    textAlign: "right",
  },
  optionRow: { gap: 8, paddingRight: 6 },
  mapLinkRow: { marginTop: 6 },
  deleteConfirm: {
    borderWidth: 1,
    borderRadius: 모서리.구역,
    padding: 12,
    marginTop: 8,
    gap: 10,
  },
  deleteConfirmCopy: { paddingHorizontal: 2 },
  deleteConfirmTitle: { fontSize: 14, fontFamily: typo.title.family },
  deleteConfirmMessage: { fontSize: 11, lineHeight: 16, marginTop: 3 },
  deleteConfirmActions: { flexDirection: "row", gap: 8 },
  deleteConfirmButton: {
    flex: 1,
    minHeight: 높이.버튼,
    borderRadius: 모서리.버튼,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteConfirmCancel: { fontSize: 12, fontFamily: typo.label.family },
  deleteConfirmDanger: { fontSize: 13, fontFamily: typo.label.family },
  reportLink: { minHeight: 높이.버튼, alignItems: "center", justifyContent: "center", marginTop: 4 },
  reportLinkText: { fontSize: 12, fontFamily: typo.label.family },
  moneyBlock: { marginBottom: 18 },
  moneyBlockHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 40 },
  moneyBlockTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  moneyBlockTitle: { fontSize: 18, lineHeight: 23, fontFamily: typo.title.family, letterSpacing: -0.5 },
  moneyBlockMeta: { fontSize: 12, borderRadius: 모서리.원, paddingHorizontal: 8, paddingVertical: 2, fontFamily: typo.data.family },
  moneyBlockAction: { minHeight: 높이.버튼, justifyContent: "center", paddingLeft: 8 },
  moneyBlockActionText: { fontSize: 13, fontFamily: typo.label.family },
  moneyBlockBody: { borderWidth: 1, borderRadius: 모서리.구역, padding: 16 },
  listMoreButton: { minHeight: 높이.버튼, borderWidth: 1, borderRadius: 모서리.버튼, marginTop: 8, marginBottom: 4, paddingHorizontal: 여백.가로좁게, flexDirection: "row", alignItems: "center", justifyContent: "center" },
  listMoreText: { fontSize: 14, fontFamily: typo.label.family },
  listMoreChevron: { fontSize: 14, fontFamily: typo.label.family, marginLeft: 6 },
  listMoreGlyph: { marginLeft: 4 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 모서리.원,
    backgroundColor: "#19B6A3",
    marginTop: 2,
  },
  sectionLabel: {
    minHeight: 42,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
    marginBottom: 8,
  },
  tabActionTitle: { fontSize: 18, lineHeight: 23, fontFamily: typo.title.family, letterSpacing: -0.5 },
  tabActionButton: {
    minHeight: 높이.버튼,
    borderRadius: 모서리.버튼,
    paddingHorizontal: 여백.가로좁게,
    alignItems: "center",
    justifyContent: "center",
  },
  tabActionButtonText: { fontSize: 14, fontFamily: typo.label.family },
  detailFieldInput: {
    height: 높이.입력,
    borderRadius: 모서리.버튼,
    paddingHorizontal: 여백.가로좁게,
    borderWidth: 1,
  },
  optionChip: {
    height: 높이.버튼,
    borderRadius: 모서리.버튼,
    borderWidth: 1,
    paddingHorizontal: 여백.가로좁게,
    alignItems: "center",
    justifyContent: "center",
  },
});
