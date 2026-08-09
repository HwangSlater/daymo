import { useMemo, useState } from 'react';
import { Modal, Pressable, SafeAreaView, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { WarmTripDetail } from './WarmTripDetail';
import { koreaAdminPath } from './koreaAdminPath';

type MainView = '홈' | '여행' | '찾기' | '우리';

type Trip = { name: string; date: string; note: string; color: string; mark: string; region: string; start: string; end: string };
const trips: Trip[] = [
  { name: '서울 구로구', date: '8월 21일 — 23일', note: '느긋한 숙소와 밀푀유나베', color: '#FF6B5F', mark: '08', region: '서울', start: '2026-08-21', end: '2026-08-23' },
  { name: '안양 평촌', date: '8월 1일 — 2일', note: '생새우 파티와 치킨', color: '#8B7CF6', mark: '08', region: '경기', start: '2026-08-01', end: '2026-08-02' },
  { name: '부산', date: '7월 24일 — 26일', note: '바다와 드론쇼', color: '#19B6A3', mark: '07', region: '부산', start: '2026-07-24', end: '2026-07-26' },
];

export function WarmAppShell() {
  const [view, setView] = useState<MainView>('홈');
  const [isTripOpen, setTripOpen] = useState(false);
  const [done, setDone] = useState<string[]>(['깻잎', '양파']);
  const toggle = (item: string) => setDone((items) => items.includes(item) ? items.filter((value) => value !== item) : [...items, item]);
  if (isTripOpen) return <WarmTripDetail done={done} toggle={toggle} onClose={() => setTripOpen(false)} />;
  return <SafeAreaView style={s.safe}><View style={s.body}>{view === '홈' && <Home open={() => setTripOpen(true)} goTrips={() => setView('여행')} />}{view === '여행' && <TripsExplorer open={() => setTripOpen(true)} />}{view === '찾기' && <Search open={() => setTripOpen(true)} />}{view === '우리' && <Together />}</View><BottomBar active={view} setActive={setView} /></SafeAreaView>;
}

function Home({ open, goTrips }: { open: () => void; goTrips: () => void }) {
  return <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.page}>
    <View style={s.homeTop}><View><Text style={s.logo}>Daymo</Text><Text style={(s as any).logoSub}>TOGETHER, ANYWHERE</Text></View><View style={(s as any).profileGroup}><View style={(s as any).dayBadge}><View style={(s as any).dayBadgeDot} /><Text style={(s as any).dayBadgeText}>D+1,026</Text></View><View style={s.people}><Text style={s.peopleText}>찬 · 세</Text></View></View></View>
    <Title label="다음 여행" title="곧 만나요" action="전체 보기" onPress={goTrips} />
    <Pressable onPress={open} style={s.nextCard}><TripArt color="#19B6A3" date="08 · 21" /><View style={s.nextText}><Text style={s.nextTag}>D−12 · PLANNING</Text><Text style={s.nextTitle}>서울 구로구</Text><Text style={s.nextDate}>8월 21일 — 23일 · 2박 3일</Text><Text style={s.nextNote}>느긋한 숙소와 밀푀유나베</Text></View></Pressable>
    <Title label="함께 챙기는 중" title="오늘의 준비" action="준비 보기" onPress={open} />
    <View style={s.taskCard}><HomeTask text="육수 재료 1.5배로 준비하기" who="세인" color="#E58F7A" /><HomeTask text="소고기와 배추 구매하기" who="찬희" color="#B9C98D" /><HomeTask text="숙소 예약 확인하기" who="함께" color="#D9B8CC" last /></View>
    <Title label="지난 계절" title="우리의 발자국" action="더 보기" onPress={goTrips} />
    <View style={s.archive}>{trips.slice(1).map((trip) => <Pressable key={trip.name} onPress={open} style={s.archiveCard}><TripArt color={trip.color} date={trip.mark} small /><Text style={s.archiveName}>{trip.name}</Text><Text style={s.archiveDate}>{trip.date}</Text></Pressable>)}</View>
  </ScrollView>;
}

type TripView = '목록' | '지도' | '캘린더';

function TripsExplorer({ open }: { open: () => void }) {
  const [display, setDisplay] = useState<TripView>('목록');
  const [filter, setFilter] = useState<'전체' | '예정' | '추억'>('전체');
  const [items, setItems] = useState<Trip[]>(trips);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [month, setMonth] = useState({ year: 2026, value: 8 });
  const [creating, setCreating] = useState(false);
  const [place, setPlace] = useState('');
  const [date, setDate] = useState('9월 12일 — 14일');
  const [note, setNote] = useState('함께 만들 새로운 여행');
  const [newRegion, setNewRegion] = useState('서울');
  const filtered = filter === '예정' ? items.filter((trip) => trip.start >= '2026-08-09') : filter === '추억' ? items.filter((trip) => trip.start < '2026-08-09') : items;
  const visibleTrips = selectedRegion ? filtered.filter((trip) => trip.region === selectedRegion) : filtered;
  const dateTrips = selectedDate ? items.filter((trip) => selectedDate >= trip.start && selectedDate <= trip.end) : [];
  const addTrip = () => { if (!place.trim()) return; const picked = selectedDate || '2026-09-12'; setItems((current) => [{ name: place.trim(), date, note, color: '#19B6A3', mark: picked.slice(5, 7), region: newRegion, start: picked, end: picked }, ...current]); setPlace(''); setCreating(false); setSelectedRegion(null); setDisplay('목록'); };
  const createFromDate = () => { if (selectedDate) { const day = Number(selectedDate.slice(-2)); setDate(`${month.value}월 ${day}일`); } setCreating(true); };
  return <>
    <ScrollView contentContainerStyle={(s as any).tripExplorerPage} showsVerticalScrollIndicator={false}>
      <View style={s.screenHead}><View><Text style={s.overline}>우리의 여행 지도</Text><Text style={s.screenTitle}>여행</Text></View><Pressable onPress={() => setCreating(true)} style={({ pressed }) => [s.newTrip, pressed && (s as any).pressed]}><Text style={s.newTripText}>새 여행</Text></Pressable></View>
      <View style={(s as any).viewSwitch}>{(['목록', '지도', '캘린더'] as TripView[]).map((item) => <Pressable key={item} onPress={() => setDisplay(item)} style={[(s as any).viewChoice, display === item && (s as any).viewChoiceActive]}><Text style={[(s as any).viewChoiceText, display === item && (s as any).viewChoiceTextActive]}>{item === '목록' ? '☰  목록' : item === '지도' ? '⌖  지도' : '▦  캘린더'}</Text></Pressable>)}</View>
      {display === '목록' && <><View style={s.tripFilters}>{(['전체', '예정', '추억'] as const).map((item) => <Pressable key={item} onPress={() => setFilter(item)}><Text style={[s.filter, filter === item && s.filterActive]}>{item}</Text></Pressable>)}</View><TripRows items={filtered} open={open} /></>}
      {display === '지도' && <KoreaTripMap trips={items} selected={selectedRegion} onSelect={(region) => setSelectedRegion(selectedRegion === region ? null : region)} />}
      {display === '캘린더' && <TripCalendar trips={items} month={month} setMonth={setMonth} selectedDate={selectedDate} setSelectedDate={setSelectedDate} />}
      {display === '캘린더' && selectedDate && <View style={(s as any).calendarResults}><Text style={(s as any).calendarResultDate}>{Number(selectedDate.slice(-2))}일의 여행</Text>{dateTrips.length ? <TripRows items={dateTrips} open={open} compact /> : <View style={(s as any).emptyDate}><Text style={(s as any).emptyDateTitle}>이날은 아직 비어 있어요.</Text><Pressable onPress={createFromDate}><Text style={(s as any).emptyDateAction}>이 날짜로 여행 만들기 +</Text></Pressable></View>}</View>}
    </ScrollView>
    <FormSheet visible={creating} title="새 여행" submit="여행 만들기" onClose={() => setCreating(false)} onSubmit={addTrip}><Field label="여행지" value={place} onChangeText={setPlace} placeholder="예: 제주 애월" /><Text style={(s as any).fieldLabel}>지도에 표시할 지역</Text><View style={(s as any).regionChoices}>{regionPins.map((pin) => <Pressable key={pin.name} onPress={() => setNewRegion(pin.name)} style={[(s as any).regionChoice, newRegion === pin.name && (s as any).regionChoiceActive]}><Text style={[(s as any).regionChoiceText, newRegion === pin.name && (s as any).regionChoiceTextActive]}>{pin.name}</Text></Pressable>)}</View><Field label="기간" value={date} onChangeText={setDate} /><Field label="한 줄 메모" value={note} onChangeText={setNote} /></FormSheet>
  </>;
}

function TripRows({ items, open, compact }: { items: Trip[]; open: () => void; compact?: boolean }) {
  if (!items.length) return <View style={(s as any).noTrips}><Text style={(s as any).noTripsText}>이 조건에 맞는 여행이 없어요.</Text></View>;
  return <>{items.map((trip, index) => <Pressable key={`${trip.name}-${index}`} onPress={open} style={({ pressed }) => [s.tripRow, compact && (s as any).tripRowCompact, pressed && (s as any).pressed]}><View style={(s as any).tripThumb}><TripArt color={trip.color} date={trip.mark} small /></View><View style={s.tripInfo}><Text style={s.tripName}>{trip.name}</Text><Text style={s.tripDate}>{trip.date}</Text><Text style={s.tripNote}>{trip.note}</Text></View><Text style={s.arrow}>›</Text></Pressable>)}</>;
}

const regionPins = [
  { name: '서울', x: 100, y: 91 }, { name: '경기', x: 116, y: 112 }, { name: '강원', x: 185, y: 95 },
  { name: '충청', x: 136, y: 165 }, { name: '전라', x: 101, y: 269 }, { name: '경상', x: 206, y: 214 },
  { name: '부산', x: 246, y: 257 }, { name: '제주', x: 68, y: 373 },
];

function KoreaTripMap({ trips, selected, onSelect }: { trips: Trip[]; selected: string | null; onSelect: (region: string) => void }) {
  const [size, setSize] = useState({ width: 300, height: 420 });
  const [zoom, setZoom] = useState(1);
  const boxWidth = 300 / zoom;
  const boxHeight = 420 / zoom;
  const viewBox = `${(300 - boxWidth) / 2} ${(420 - boxHeight) / 2} ${boxWidth} ${boxHeight}`;
  return <View style={(s as any).mapOnly} onLayout={(event) => setSize(event.nativeEvent.layout)}><Svg width="100%" height="100%" viewBox={viewBox} preserveAspectRatio="xMidYMid meet"><Path d="M75.4 74.8 L77.5 73.4 L77.7 71.5 L77.7 65.3 L83.8 61.0 L92.5 52.1 L96.8 47.2 L101.7 42.7 L107.3 39.6 L112.9 38.2 L121.6 37.6 L138.3 38.2 L141.6 37.6 L153.2 37.2 L155.9 38.0 L164.4 38.5 L173.7 37.9 L178.4 36.6 L182.8 34.3 L186.6 30.3 L190.6 22.8 L194.8 16.9 L197.2 15.9 L214.3 47.2 L230.7 67.4 L244.6 82.1 L264.5 110.3 L270.3 125.4 L270.8 134.7 L274.1 147.6 L271.3 154.9 L272.2 166.6 L270.9 172.5 L268.5 176.9 L268.4 185.3 L269.2 189.9 L269.2 195.8 L270.8 198.2 L273.1 199.0 L276.7 196.9 L281.1 196.0 L280.3 203.2 L275.0 221.4 L270.3 234.7 L264.0 246.2 L256.0 256.8 L246.4 260.9 L239.6 262.4 L226.7 262.9 L216.0 261.1 L206.8 262.4 L203.1 264.6 L200.3 268.4 L202.3 274.3 L202.1 278.6 L198.1 278.2 L190.3 275.7 L181.7 275.4 L177.6 274.1 L173.5 268.0 L169.4 268.2 L162.1 271.9 L151.0 272.7 L147.1 274.7 L145.8 277.2 L147.4 280.5 L153.0 284.7 L151.1 289.0 L145.3 291.2 L140.6 285.9 L137.7 280.7 L134.4 280.4 L129.3 281.9 L128.3 287.5 L130.6 291.3 L134.5 295.7 L129.1 300.8 L127.6 304.5 L123.7 307.1 L113.1 301.3 L114.6 297.1 L119.2 293.2 L119.8 289.1 L118.3 286.6 L103.2 297.0 L93.8 308.8 L88.8 307.9 L86.8 304.9 L83.8 303.7 L73.8 311.3 L71.9 317.3 L68.2 317.5 L66.6 315.0 L66.5 309.5 L64.7 304.9 L54.3 298.2 L49.5 292.4 L52.1 289.1 L60.8 290.9 L67.7 290.6 L66.3 287.9 L64.1 286.6 L68.7 285.0 L72.5 281.8 L69.4 280.9 L64.5 282.8 L60.4 281.9 L58.8 274.2 L53.9 266.3 L51.4 258.7 L56.2 254.3 L58.7 247.5 L63.2 237.6 L65.5 234.4 L71.8 232.1 L74.0 229.5 L70.5 228.2 L65.1 227.1 L65.2 224.2 L68.9 222.6 L73.1 219.5 L81.2 215.7 L83.7 208.5 L81.4 206.6 L76.3 204.9 L77.5 201.3 L79.5 198.5 L78.8 196.8 L72.8 192.1 L68.8 187.9 L70.0 183.0 L69.1 175.6 L69.6 169.4 L69.4 166.1 L66.5 158.5 L65.1 150.9 L61.3 152.0 L58.2 153.9 L47.1 151.3 L43.7 151.1 L42.2 145.5 L46.2 138.5 L55.6 132.4 L61.0 131.7 L65.1 129.0 L71.4 128.1 L79.1 132.3 L85.9 133.1 L89.7 140.3 L92.0 141.8 L92.5 139.2 L98.1 136.1 L99.4 133.7 L98.2 132.5 L91.8 131.2 L86.1 122.3 L85.3 118.4 L83.2 116.0 L86.3 108.9 L79.7 100.8 L76.5 98.2 L77.0 90.9 L73.5 86.3 L71.6 83.7 L70.4 79.3 L71.4 77.4 L74.4 76.6 L75.4 74.8 Z M222.9 283.6 L216.3 287.9 L207.4 282.1 L205.2 278.9 L212.0 274.2 L217.8 268.9 L221.5 268.5 L222.9 283.6 Z M175.6 283.1 L174.8 289.9 L169.9 290.3 L166.9 285.9 L163.8 288.0 L162.1 288.1 L159.7 282.6 L159.3 278.3 L165.1 275.0 L168.6 277.0 L173.7 278.0 L175.6 283.1 Z M47.4 313.6 L42.9 314.6 L40.4 312.2 L38.6 311.6 L39.6 308.4 L46.9 302.2 L48.3 300.1 L55.1 301.4 L57.6 304.6 L54.5 309.7 L47.4 313.6 Z M67.4 77.9 L67.1 87.2 L63.3 86.8 L60.6 85.8 L59.5 84.0 L56.9 75.5 L59.8 71.9 L65.5 74.7 L67.4 77.9 Z M83.7 315.4 L84.9 318.7 L79.2 318.1 L76.2 314.9 L76.6 312.2 L80.0 311.8 L83.7 315.4 Z M156.9 296.4 L156.1 298.6 L152.6 295.3 L156.1 291.8 L156.9 296.4 Z M60.2 165.0 L59.3 169.5 L54.6 166.6 L53.3 156.6 L58.1 159.5 L60.2 165.0 Z M43.0 288.3 L42.1 290.0 L39.1 289.5 L35.9 284.7 L34.6 280.9 L31.5 278.8 L36.5 275.5 L42.8 281.4 L43.0 288.3 Z M53.9 393.8 L50.7 395.4 L47.8 394.5 L47.0 393.7 L43.5 389.7 L42.6 387.7 L45.0 383.7 L54.6 377.3 L79.7 371.0 L84.2 370.8 L94.1 373.4 L96.2 378.4 L94.4 382.7 L92.1 385.6 L80.6 390.5 L71.7 392.8 L53.9 393.8 Z" fill="#DDF4EF" stroke="#159D8D" strokeWidth={2.2 / zoom} strokeLinejoin="round" /><Path d={koreaAdminPath} fill="none" stroke="#5BB9AD" strokeWidth={0.75 / zoom} strokeLinejoin="round" /></Svg>{regionPins.map((pin) => { const count = trips.filter((trip) => trip.region === pin.name).length; const active = selected === pin.name; const left = size.width / 2 + ((pin.x / 300) * size.width - size.width / 2) * zoom; const top = size.height / 2 + ((pin.y / 420) * size.height - size.height / 2) * zoom; const visible = left > -24 && left < size.width + 24 && top > -16 && top < size.height + 16; return visible ? <Pressable key={pin.name} onPress={() => onSelect(pin.name)} style={[(s as any).mapPin, { left, top }, count > 0 && (s as any).mapPinVisited, active && (s as any).mapPinActive]}><Text numberOfLines={1} adjustsFontSizeToFit style={[(s as any).mapPinText, (count > 0 || active) && (s as any).mapPinTextVisited]}>{pin.name}</Text>{count > 0 && <View style={(s as any).pinCount}><Text style={(s as any).pinCountText}>{count}</Text></View>}</Pressable> : null; })}<View style={(s as any).zoomControls}><Pressable disabled={zoom <= 1} onPress={() => setZoom((value) => Math.max(1, value - .5))} style={[(s as any).zoomButton, zoom <= 1 && (s as any).zoomButtonDisabled]}><Text style={(s as any).zoomText}>−</Text></Pressable><View style={(s as any).zoomDivider} /><Pressable disabled={zoom >= 2.5} onPress={() => setZoom((value) => Math.min(2.5, value + .5))} style={[(s as any).zoomButton, zoom >= 2.5 && (s as any).zoomButtonDisabled]}><Text style={(s as any).zoomText}>＋</Text></Pressable></View></View>;
}

function TripCalendar({ trips, month, setMonth, selectedDate, setSelectedDate }: { trips: Trip[]; month: { year: number; value: number }; setMonth: (value: { year: number; value: number }) => void; selectedDate: string | null; setSelectedDate: (value: string | null) => void }) {
  const firstDay = new Date(month.year, month.value - 1, 1).getDay();
  const days = new Date(month.year, month.value, 0).getDate();
  const cells = Array.from({ length: 42 }, (_, index) => index - firstDay + 1);
  const move = (amount: number) => { const next = new Date(month.year, month.value - 1 + amount, 1); setMonth({ year: next.getFullYear(), value: next.getMonth() + 1 }); setSelectedDate(null); };
  return <View style={(s as any).calendarCard}><View style={(s as any).calendarHead}><Pressable onPress={() => move(-1)} style={(s as any).monthArrow}><Text style={(s as any).monthArrowText}>‹</Text></Pressable><View><Text style={(s as any).calendarMonth}>{month.year}. {String(month.value).padStart(2, '0')}</Text><Text style={(s as any).calendarSub}>여행이 있는 날은 색으로 이어져요</Text></View><Pressable onPress={() => move(1)} style={(s as any).monthArrow}><Text style={(s as any).monthArrowText}>›</Text></Pressable></View><View style={(s as any).weekRow}>{['일', '월', '화', '수', '목', '금', '토'].map((day) => <Text key={day} style={(s as any).weekName}>{day}</Text>)}</View><View style={(s as any).calendarGrid}>{cells.map((day, index) => { const valid = day > 0 && day <= days; const key = valid ? `${month.year}-${String(month.value).padStart(2, '0')}-${String(day).padStart(2, '0')}` : ''; const trip = trips.find((item) => key >= item.start && key <= item.end); const selected = key === selectedDate; return <Pressable key={`${index}-${day}`} disabled={!valid} onPress={() => setSelectedDate(key)} style={[(s as any).dayCell, trip && { backgroundColor: trip.color }, selected && (s as any).dayCellSelected]}><Text style={[(s as any).dayNumber, trip && (s as any).dayNumberTrip, selected && (s as any).dayNumberSelected]}>{valid ? day : ''}</Text>{trip && <View style={(s as any).dayTripDot} />}</Pressable>; })}</View><View style={(s as any).calendarLegend}>{trips.filter((trip) => trip.start.slice(0, 7) === `${month.year}-${String(month.value).padStart(2, '0')}`).map((trip) => <View key={trip.name} style={(s as any).calendarLegendItem}><View style={[(s as any).calendarLegendDot, { backgroundColor: trip.color }]} /><Text style={(s as any).calendarLegendText}>{trip.name}</Text></View>)}</View></View>;
}

function Trips({ open }: { open: () => void }) {
  const [filter, setFilter] = useState<'전체' | '예정' | '추억'>('전체');
  const [items, setItems] = useState(trips);
  const [creating, setCreating] = useState(false);
  const [place, setPlace] = useState('');
  const [date, setDate] = useState('9월 12일 — 14일');
  const [note, setNote] = useState('함께 만들 새로운 여행');
  const visibleTrips = filter === '예정' ? items.slice(0, Math.max(1, items.length - 2)) : filter === '추억' ? items.slice(-2) : items;
  const addTrip = () => { if (!place.trim()) return; setItems((current) => [{ name: place.trim(), date, note, color: '#19B6A3', mark: date.slice(0, 2).replace(/\D/g, '') || 'NEW', region: '서울', start: '2026-09-12', end: '2026-09-14' }, ...current]); setPlace(''); setCreating(false); setFilter('전체'); };
  return <><ScrollView contentContainerStyle={s.page} showsVerticalScrollIndicator={false}><View style={s.screenHead}><View><Text style={s.overline}>우리의 여행 지도</Text><Text style={s.screenTitle}>여행</Text></View><Pressable onPress={() => setCreating(true)} style={({ pressed }) => [s.newTrip, pressed && (s as any).pressed]}><Text style={s.newTripText}>새 여행</Text></Pressable></View><View style={s.tripFilters}>{(['전체', '예정', '추억'] as const).map((item) => <Pressable key={item} onPress={() => setFilter(item)}><Text style={[s.filter, filter === item && s.filterActive]}>{item}</Text></Pressable>)}</View>{visibleTrips.map((trip, index) => <Pressable key={`${trip.name}-${index}`} onPress={open} style={({ pressed }) => [s.tripRow, pressed && (s as any).pressed]}><View style={(s as any).tripThumb}><TripArt color={trip.color} date={trip.mark} small /></View><View style={s.tripInfo}><Text style={s.tripName}>{trip.name}</Text><Text style={s.tripDate}>{trip.date}</Text><Text style={s.tripNote}>{trip.note}</Text></View><Text style={s.arrow}>›</Text></Pressable>)}</ScrollView><FormSheet visible={creating} title="새 여행" submit="여행 만들기" onClose={() => setCreating(false)} onSubmit={addTrip}><Field label="여행지" value={place} onChangeText={setPlace} placeholder="예: 제주 애월" /><Field label="기간" value={date} onChangeText={setDate} /><Field label="한 줄 메모" value={note} onChangeText={setNote} /></FormSheet></>;
}

function Search({ open }: { open: () => void }) {
  const [query, setQuery] = useState('');
  const results = useMemo(() => [{ title: '은행골블랙', type: '장소', trip: '서울 구로구' }, { title: '밀푀유나베', type: '함께 해먹기', trip: '서울 구로구' }, { title: '우사기쇼쿠도', type: '장소', trip: '안양 평촌' }, { title: '충전기', type: '준비물', trip: '진주' }].filter((item) => item.title.includes(query)), [query]);
  return <View style={s.searchPage}><Text style={s.overline}>찾고 싶은 순간</Text><Text style={s.screenTitle}>찾기</Text><View style={s.searchBox}><Text style={s.searchSymbol}>⌕</Text><TextInput value={query} onChangeText={setQuery} placeholder="장소, 음식, 메모를 찾아봐요" placeholderTextColor="#AC9990" style={s.searchInput} autoFocus /></View><Text style={s.resultOverline}>{query ? '검색 결과' : '자주 찾는 기록'}</Text>{results.map((item) => <Pressable key={item.title} onPress={open} style={s.result}><View style={s.resultDot} /><View style={s.resultText}><Text style={s.resultTitle}>{item.title}</Text><Text style={s.resultMeta}>{item.type} · {item.trip}</Text></View><Text style={s.arrow}>›</Text></Pressable>)}</View>;
}

function Together() {
  const [notifications, setNotifications] = useState(true);
  const [relationship, setRelationship] = useState<'연인' | '친구'>('연인');
  const [panel, setPanel] = useState<'profile' | 'members' | 'relationship' | 'help' | null>(null);
  const exportData = () => Share.share({ title: 'Daymo 여행 기록', message: trips.map((trip) => `${trip.name} · ${trip.date}\n${trip.note}`).join('\n\n') });
  return <><ScrollView contentContainerStyle={s.page}><Text style={s.overline}>우리의 공간</Text><Text style={s.screenTitle}>함께</Text><Pressable onPress={() => setPanel('profile')} style={({ pressed }) => [s.spaceCard, pressed && (s as any).pressed]}><View style={s.spaceMonogram}><Text style={s.monogramText}>C · S</Text></View><View><Text style={s.spaceName}>찬희와 세인</Text><Text style={s.spaceCopy}>{relationship} · 서로의 여행을 모으는 공간</Text></View></Pressable><Setting label="멤버" value="2명" onPress={() => setPanel('members')} /><Setting label="초대 링크" value="공유" onPress={() => Share.share({ message: 'Daymo에서 우리 여행을 함께 기록해요.\nhttps://daymo.app/invite/CHAN-SEIN' })} /><Setting label="관계 설정" value={relationship} onPress={() => setPanel('relationship')} /><Text style={s.settingsLabel}>앱 설정</Text><Setting label="알림" value={notifications ? '켜짐' : '꺼짐'} onPress={() => setNotifications((value) => !value)} /><Setting label="데이터 내보내기" onPress={exportData} /><Setting label="도움말" onPress={() => setPanel('help')} /></ScrollView><InfoSheet visible={panel !== null} title={panel === 'members' ? '함께하는 멤버' : panel === 'relationship' ? '관계 설정' : panel === 'help' ? 'Daymo 도움말' : '공간 프로필'} onClose={() => setPanel(null)}>{panel === 'members' && <><Choice selected label="찬희 · OWNER" /><Choice selected label="세인 · EDITOR" /></>}{panel === 'relationship' && <><Choice selected={relationship === '연인'} label="연인" onPress={() => setRelationship('연인')} /><Choice selected={relationship === '친구'} label="친구" onPress={() => setRelationship('친구')} /></>}{panel === 'help' && <Text style={(s as any).sheetCopy}>여행을 만들고 일정, 준비물, 메모와 사진을 한곳에서 함께 관리하세요. 준비물은 누르면 바로 완료 처리됩니다.</Text>}{panel === 'profile' && <Text style={(s as any).sheetCopy}>찬희와 세인이 1,026일 동안 함께 만든 여행 공간이에요. 총 {trips.length}개의 여행이 기록되어 있어요.</Text>}</InfoSheet></>;
}

function BottomBar({ active, setActive }: { active: MainView; setActive: (view: MainView) => void }) {
  return <View style={s.bottom}>{(['홈', '여행', '찾기', '우리'] as MainView[]).map((item) => <Pressable key={item} onPress={() => setActive(item)} style={s.navItem}><View style={[s.navDot, active === item && s.navDotActive]} /><Text style={[s.navText, active === item && s.navTextActive]}>{item}</Text></Pressable>)}</View>;
}

function Title({ label, title, action, onPress }: { label: string; title: string; action?: string; onPress?: () => void }) { return <View style={s.titleRow}><View><Text style={s.sectionLabel}>{label}</Text><Text style={s.sectionTitle}>{title}</Text></View>{action && <Pressable onPress={onPress}><Text style={s.sectionAction}>{action} ›</Text></Pressable>}</View> }
function HomeTask({ text, who, color, last }: { text: string; who: string; color: string; last?: boolean }) { return <View style={[s.task, last && s.taskLast]}><View style={[s.taskDot, { backgroundColor: color }]} /><Text style={s.taskText}>{text}</Text><Text style={s.taskWho}>{who}</Text></View> }
function TripArt({ color, date, small }: { color: string; date: string; small?: boolean }) { return <View style={[s.tripArt, small && s.tripArtSmall, { backgroundColor: color }]}><View style={s.artMoon} /><View style={s.artDate}><Text style={s.artText}>{date}</Text><View style={s.artLine} /></View></View> }
function Setting({ label, value, onPress }: { label: string; value?: string; onPress: () => void }) { return <Pressable onPress={onPress} style={({ pressed }) => [s.setting, pressed && (s as any).pressed]}><Text style={s.settingName}>{label}</Text><View style={s.settingRight}>{value && <Text style={s.settingValue}>{value}</Text>}<Text style={s.arrow}>›</Text></View></Pressable> }

function Field({ label, ...props }: { label: string; value: string; onChangeText: (text: string) => void; placeholder?: string }) { return <View style={(s as any).field}><Text style={(s as any).fieldLabel}>{label}</Text><TextInput {...props} placeholderTextColor="#9AA1AE" style={(s as any).fieldInput} /></View> }
function FormSheet({ visible, title, submit, onClose, onSubmit, children }: { visible: boolean; title: string; submit: string; onClose: () => void; onSubmit: () => void; children: React.ReactNode }) { return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={(s as any).modalBack}><Pressable style={(s as any).modalDismiss} onPress={onClose} /><View style={(s as any).sheet}><View style={(s as any).sheetHandle} /><View style={(s as any).sheetHead}><Text style={(s as any).sheetTitle}>{title}</Text><Pressable onPress={onClose}><Text style={(s as any).sheetClose}>닫기</Text></Pressable></View>{children}<Pressable onPress={onSubmit} style={(s as any).sheetSubmit}><Text style={(s as any).sheetSubmitText}>{submit}</Text></Pressable></View></View></Modal> }
function InfoSheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: React.ReactNode }) { return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={(s as any).modalBack}><Pressable style={(s as any).modalDismiss} onPress={onClose} /><View style={(s as any).sheet}><View style={(s as any).sheetHandle} /><View style={(s as any).sheetHead}><Text style={(s as any).sheetTitle}>{title}</Text><Pressable onPress={onClose}><Text style={(s as any).sheetClose}>완료</Text></Pressable></View>{children}</View></View></Modal> }
function Choice({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) { return <Pressable onPress={onPress} style={[(s as any).choice, selected && (s as any).choiceSelected]}><Text style={[(s as any).choiceText, selected && (s as any).choiceTextSelected]}>{label}</Text><Text style={(s as any).choiceMark}>{selected ? '✓' : ''}</Text></Pressable> }

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFF9F4' }, body: { flex: 1 }, page: { padding: 21, paddingBottom: 112 }, homeTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, logo: { color: '#663C37', fontSize: 29, letterSpacing: -1.4, fontWeight: '900' }, people: { paddingHorizontal: 11, height: 32, borderRadius: 16, backgroundColor: '#F4DED3', alignItems: 'center', justifyContent: 'center' }, peopleText: { color: '#9A6156', fontSize: 10, fontWeight: '900' }, greeting: { color: '#593532', fontSize: 31, lineHeight: 39, letterSpacing: -1.6, fontWeight: '800', marginTop: 38 }, greetingSub: { color: '#987C73', fontSize: 13, marginTop: 12 }, togetherCard: { backgroundColor: '#F4D2C3', borderRadius: 25, padding: 20, minHeight: 144, marginTop: 27, flexDirection: 'row', justifyContent: 'space-between', overflow: 'hidden' }, togetherLabel: { color: '#AD6B5E', fontSize: 10, letterSpacing: .8, fontWeight: '900' }, togetherDays: { color: '#623933', fontSize: 29, letterSpacing: -1.2, fontWeight: '800', marginTop: 10 }, togetherSub: { color: '#9A7167', fontSize: 11, marginTop: 4 }, heartShape: { width: 87, height: 87, marginTop: 17, marginRight: 3, transform: [{ rotate: '-45deg' }] }, heartLeft: { position: 'absolute', width: 53, height: 53, borderRadius: 27, backgroundColor: '#D98977', left: 0, top: 22 }, heartRight: { position: 'absolute', width: 53, height: 53, borderRadius: 27, backgroundColor: '#D98977', left: 22, top: 0 }, titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 34, marginBottom: 13 }, sectionLabel: { color: '#C17765', fontSize: 10, letterSpacing: 1, fontWeight: '900', marginBottom: 5 }, sectionTitle: { color: '#633B36', fontSize: 20, letterSpacing: -.8, fontWeight: '800' }, sectionAction: { color: '#B2776A', fontSize: 11, fontWeight: '800' }, nextCard: { backgroundColor: '#FFF', borderRadius: 22, padding: 13, flexDirection: 'row', shadowColor: '#B98B7E', shadowOpacity: .1, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 2 }, tripArt: { width: 121, height: 136, borderRadius: 16, overflow: 'hidden', position: 'relative' }, tripArtSmall: { width: '100%', height: 91, borderRadius: 14, marginBottom: 9 }, artMoon: { position: 'absolute', width: 107, height: 107, borderRadius: 54, backgroundColor: 'rgba(255,249,244,.45)', right: -38, top: -28 }, artDate: { position: 'absolute', left: 11, bottom: 11 }, artText: { color: '#623C38', fontSize: 13, fontWeight: '900' }, artLine: { width: 25, height: 2, backgroundColor: '#623C38', marginTop: 5 }, nextText: { flex: 1, paddingLeft: 15, paddingTop: 4 }, nextTag: { alignSelf: 'flex-start', color: '#B56454', backgroundColor: '#F9E5DC', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 9, fontSize: 10, fontWeight: '900' }, nextTitle: { color: '#603A35', fontSize: 20, fontWeight: '800', marginTop: 11 }, nextDate: { color: '#A0857B', fontSize: 11, marginTop: 4 }, nextNote: { color: '#B1978E', fontSize: 11, marginTop: 13 }, taskCard: { backgroundColor: '#FFF', borderRadius: 20, paddingHorizontal: 16, shadowColor: '#B98B7E', shadowOpacity: .07, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 1 }, task: { minHeight: 54, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: '#F3E8E2' }, taskLast: { borderBottomWidth: 0 }, taskDot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 }, taskText: { flex: 1, color: '#694942', fontSize: 12, fontWeight: '600' }, taskWho: { color: '#AB8C82', fontSize: 10, fontWeight: '800' }, archive: { flexDirection: 'row' }, archiveCard: { width: '47%', marginRight: '4%' }, archiveName: { color: '#633D37', fontSize: 14, fontWeight: '800' }, archiveDate: { color: '#A58C82', fontSize: 10, marginTop: 3 }, screenHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 8, marginBottom: 23 }, overline: { color: '#B87869', fontSize: 10, letterSpacing: 1, fontWeight: '900' }, screenTitle: { color: '#603934', fontSize: 34, letterSpacing: -1.7, fontWeight: '800', marginTop: 5 }, newTrip: { backgroundColor: '#E59681', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9 }, newTripText: { color: '#FFF9F4', fontSize: 11, fontWeight: '800' }, tripFilters: { flexDirection: 'row', backgroundColor: '#F5EAE3', padding: 4, borderRadius: 15, marginBottom: 15 }, filter: { color: '#A58B80', fontSize: 11, fontWeight: '800', paddingVertical: 8, paddingHorizontal: 15, borderRadius: 11 }, filterActive: { backgroundColor: '#FFF9F4', color: '#694038' }, tripRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: '#F0E2DB' }, tripInfo: { flex: 1, paddingLeft: 13 }, tripName: { color: '#633B35', fontSize: 16, fontWeight: '800' }, tripDate: { color: '#9E8177', fontSize: 11, marginTop: 4 }, tripNote: { color: '#B49C93', fontSize: 10, marginTop: 5 }, arrow: { color: '#A0665B', fontSize: 23, fontWeight: '300' }, searchPage: { padding: 21, flex: 1 }, searchBox: { backgroundColor: '#F7EDE6', borderRadius: 17, height: 54, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, marginTop: 26 }, searchSymbol: { color: '#C27C6C', fontSize: 25, marginRight: 7 }, searchInput: { flex: 1, color: '#633B35', fontSize: 13 }, resultOverline: { color: '#B37A6C', fontSize: 10, letterSpacing: 1, fontWeight: '900', marginTop: 27, marginBottom: 5 }, result: { minHeight: 64, borderBottomWidth: 1, borderColor: '#F0E3DC', flexDirection: 'row', alignItems: 'center' }, resultDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#E6A18D', marginRight: 12 }, resultText: { flex: 1 }, resultTitle: { color: '#654039', fontSize: 14, fontWeight: '800' }, resultMeta: { color: '#A78D83', fontSize: 10, marginTop: 4 }, spaceCard: { backgroundColor: '#E8D4C9', borderRadius: 24, padding: 19, minHeight: 105, marginTop: 26, marginBottom: 26, flexDirection: 'row', alignItems: 'center' }, spaceMonogram: { width: 64, height: 64, borderRadius: 22, backgroundColor: '#B86F61', alignItems: 'center', justifyContent: 'center', marginRight: 14 }, monogramText: { color: '#FFF7F1', fontSize: 11, fontWeight: '900' }, spaceName: { color: '#643B36', fontSize: 17, fontWeight: '800' }, spaceCopy: { color: '#9A756B', fontSize: 11, marginTop: 5 }, setting: { minHeight: 55, borderBottomWidth: 1, borderColor: '#F0E2DA', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, settingName: { color: '#6A4941', fontSize: 14, fontWeight: '700' }, settingRight: { flexDirection: 'row', alignItems: 'center', gap: 8 }, settingValue: { color: '#B46F60', fontSize: 10, fontWeight: '800' }, settingsLabel: { color: '#B37B6C', fontSize: 10, fontWeight: '900', letterSpacing: .8, marginTop: 29, marginBottom: 5 }, bottom: { height: 76, backgroundColor: '#FFF5EF', borderTopWidth: 1, borderColor: '#F0DED5', flexDirection: 'row', justifyContent: 'space-around', paddingTop: 13 }, navItem: { width: 52, alignItems: 'center' }, navDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#D7B6AB', marginBottom: 5 }, navDotActive: { width: 9, backgroundColor: '#C87867' }, navText: { color: '#AB8D82', fontSize: 10, fontWeight: '800' }, navTextActive: { color: '#7D4B42' }
});

Object.assign(s, {
  safe: { flex: 1, width: '100%', maxWidth: 430, alignSelf: 'center', backgroundColor: '#F7F5F0', shadowColor: '#17233D', shadowOpacity: .12, shadowRadius: 24, shadowOffset: { width: 0, height: 0 } },
  logo: { color: '#17233D', fontSize: 31, letterSpacing: -1.8, fontWeight: '900' },
  logoSub: { color: '#7D8697', fontSize: 8, letterSpacing: 1.45, fontWeight: '900', marginTop: 1 },
  people: { paddingHorizontal: 12, height: 34, borderRadius: 17, backgroundColor: '#E9E5FF', borderWidth: 1, borderColor: '#D9D2FF', alignItems: 'center', justifyContent: 'center' },
  peopleText: { color: '#6556D8', fontSize: 10, fontWeight: '900' },
  greeting: { color: '#17233D', fontSize: 32, lineHeight: 40, letterSpacing: -1.8, fontWeight: '800', marginTop: 38 },
  greetingSub: { color: '#747D8D', fontSize: 13, marginTop: 12 },
  togetherCard: { backgroundColor: '#17233D', borderRadius: 28, padding: 21, minHeight: 190, marginTop: 27, flexDirection: 'row', justifyContent: 'space-between', overflow: 'hidden' },
  cardGlow: { position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: '#263657', right: -52, top: -70 },
  togetherLabel: { color: '#FF8B80', fontSize: 10, letterSpacing: 1, fontWeight: '900' },
  togetherDays: { color: '#FFFFFF', fontSize: 26, lineHeight: 32, letterSpacing: -1.2, fontWeight: '800', marginTop: 11 },
  togetherSub: { color: '#AAB4C7', fontSize: 11, marginTop: 7 },
  heartShape: { width: 76, height: 76, marginTop: 28, marginRight: 2, transform: [{ rotate: '-45deg' }] },
  heartLeft: { position: 'absolute', width: 46, height: 46, borderRadius: 24, backgroundColor: '#FF6B5F', left: 0, top: 19 },
  heartRight: { position: 'absolute', width: 46, height: 46, borderRadius: 24, backgroundColor: '#FF6B5F', left: 19, top: 0 },
  colorLegend: { position: 'absolute', left: 20, right: 20, bottom: 17, flexDirection: 'row', gap: 6 },
  legendPill: { height: 20, borderRadius: 10, paddingHorizontal: 9, justifyContent: 'center' },
  legendLove: { backgroundColor: '#FF6B5F' }, legendFriends: { backgroundColor: '#8B7CF6' }, legendTrip: { backgroundColor: '#19B6A3' },
  legendText: { color: '#FFFFFF', fontSize: 7, letterSpacing: .8, fontWeight: '900' },
  sectionLabel: { color: '#FF6257', fontSize: 10, letterSpacing: 1, fontWeight: '900', marginBottom: 5 },
  sectionTitle: { color: '#17233D', fontSize: 20, letterSpacing: -.8, fontWeight: '800' },
  sectionAction: { color: '#6556D8', fontSize: 11, fontWeight: '800' },
  nextCard: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 13, flexDirection: 'row', shadowColor: '#17233D', shadowOpacity: .09, shadowRadius: 16, shadowOffset: { width: 0, height: 7 }, elevation: 3 },
  nextTag: { alignSelf: 'flex-start', color: '#087D70', backgroundColor: '#DDF7F1', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 9, fontSize: 9, letterSpacing: .4, fontWeight: '900' },
  nextTitle: { color: '#17233D', fontSize: 20, fontWeight: '800', marginTop: 11 },
  bottom: { height: 78, backgroundColor: '#17233D', flexDirection: 'row', justifyContent: 'space-around', paddingTop: 14 },
  navDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#56627A', marginBottom: 6 },
  navDotActive: { width: 18, backgroundColor: '#19B6A3' },
  navText: { color: '#8994A8', fontSize: 10, fontWeight: '800' },
  navTextActive: { color: '#FFFFFF' },
  pressed: { opacity: .68, transform: [{ scale: .985 }] }
});

Object.assign(s, {
  tripThumb: { width: 94 },
  modalBack: { flex: 1, backgroundColor: 'rgba(10,18,35,.42)', justifyContent: 'flex-end' },
  modalDismiss: { flex: 1 },
  sheet: { width: '100%', maxWidth: 430, alignSelf: 'center', backgroundColor: '#F7F5F0', borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 22, paddingTop: 10, paddingBottom: 36 },
  sheetHandle: { width: 42, height: 4, borderRadius: 2, backgroundColor: '#C7C7C3', alignSelf: 'center', marginBottom: 20 },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  sheetTitle: { color: '#17233D', fontSize: 24, fontWeight: '900', letterSpacing: -1 },
  sheetClose: { color: '#6556D8', fontSize: 13, fontWeight: '800' },
  field: { marginBottom: 17 }, fieldLabel: { color: '#6F7888', fontSize: 10, fontWeight: '900', marginBottom: 7 },
  fieldInput: { height: 51, borderRadius: 15, backgroundColor: '#FFFFFF', paddingHorizontal: 15, color: '#17233D', fontSize: 14, borderWidth: 1, borderColor: '#E5E3DD' },
  sheetSubmit: { height: 53, borderRadius: 17, backgroundColor: '#17233D', alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  sheetSubmitText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' }, sheetCopy: { color: '#556071', fontSize: 14, lineHeight: 22, marginBottom: 12 },
  choice: { minHeight: 56, borderRadius: 17, borderWidth: 1, borderColor: '#DEDCD5', paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9, backgroundColor: '#FFFFFF' },
  choiceSelected: { borderColor: '#8B7CF6', backgroundColor: '#E9E5FF' }, choiceText: { color: '#576173', fontSize: 14, fontWeight: '800' }, choiceTextSelected: { color: '#5546C8' }, choiceMark: { color: '#6556D8', fontSize: 16, fontWeight: '900' }
});

Object.assign(s, {
  profileGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dayBadge: { height: 30, borderRadius: 15, paddingHorizontal: 10, backgroundColor: '#FFF0ED', borderWidth: 1, borderColor: '#FFD6D0', flexDirection: 'row', alignItems: 'center', gap: 6 },
  dayBadgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FF6B5F' },
  dayBadgeText: { color: '#C94D45', fontSize: 9, letterSpacing: .45, fontWeight: '900' },
  greeting: { color: '#17233D', fontSize: 32, lineHeight: 40, letterSpacing: -1.8, fontWeight: '800', marginTop: 48 }
});

Object.assign(s, {
  tripExplorerPage: { paddingHorizontal: 21, paddingTop: 8, paddingBottom: 120 },
  viewSwitch: { flexDirection: 'row', backgroundColor: '#EDEAE5', borderRadius: 16, padding: 4, marginBottom: 16 },
  viewChoice: { flex: 1, minHeight: 39, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  viewChoiceActive: { backgroundColor: '#17233D', shadowColor: '#17233D', shadowOpacity: .15, shadowRadius: 7, elevation: 2 },
  viewChoiceText: { color: '#858783', fontSize: 10, fontWeight: '900' },
  viewChoiceTextActive: { color: '#FFFFFF' },
  tripRowCompact: { minHeight: 86 }, noTrips: { paddingVertical: 40, alignItems: 'center' }, noTripsText: { color: '#969A9E', fontSize: 11 },
  mapCard: { backgroundColor: '#17233D', borderRadius: 24, padding: 17, overflow: 'hidden' },
  mapOnly: { width: '100%', height: 500, position: 'relative', overflow: 'hidden' },
  mapIntro: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mapKicker: { color: '#5ED8C9', fontSize: 8, letterSpacing: 1.1, fontWeight: '900' },
  mapTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '900', letterSpacing: -.8, marginTop: 5 },
  mapScore: { width: 49, height: 49, borderRadius: 16, backgroundColor: '#263657', alignItems: 'center', justifyContent: 'center' },
  mapScoreValue: { color: '#5ED8C9', fontSize: 17, fontWeight: '900' }, mapScoreLabel: { color: '#9FABC1', fontSize: 8, marginTop: 1 },
  mapCanvas: { height: 354, marginTop: 4, position: 'relative' },
  mapPin: { position: 'absolute', transform: [{ translateX: -18 }, { translateY: -11 }], width: 36, height: 22, borderRadius: 11, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#A9D9D1', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  mapPinVisited: { backgroundColor: '#19B6A3', borderColor: '#FFFFFF' }, mapPinActive: { backgroundColor: '#FF6B5F', borderColor: '#FFFFFF', transform: [{ translateX: -18 }, { translateY: -11 }, { scale: 1.08 }] },
  mapPinText: { color: '#438178', fontSize: 7.5, lineHeight: 9, fontWeight: '900', maxWidth: 29, textAlign: 'center' }, mapPinTextVisited: { color: '#FFFFFF' },
  pinCount: { position: 'absolute', right: -5, top: -6, width: 15, height: 15, borderRadius: 8, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }, pinCountText: { color: '#17233D', fontSize: 7, fontWeight: '900' },
  mapHint: { color: '#8795AE', fontSize: 9, textAlign: 'center', marginTop: -3 },
  zoomControls: { position: 'absolute', right: 5, bottom: 14, width: 40, backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: '#D9E2DF', shadowColor: '#17233D', shadowOpacity: .14, shadowRadius: 8, elevation: 3, overflow: 'hidden' },
  zoomButton: { height: 39, alignItems: 'center', justifyContent: 'center' }, zoomButtonDisabled: { opacity: .28 }, zoomText: { color: '#17233D', fontSize: 19, fontWeight: '700' }, zoomDivider: { height: 1, backgroundColor: '#E6E9E7', marginHorizontal: 7 },
  mapResults: { marginTop: 18 }, mapResultHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 5 }, mapResultTitle: { color: '#17233D', fontSize: 16, fontWeight: '900' }, mapResultCount: { color: '#19A996', fontSize: 10, fontWeight: '900' },
  calendarCard: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 16, borderWidth: 1, borderColor: '#ECE9E3' },
  calendarHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  monthArrow: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#F1EFEA', alignItems: 'center', justifyContent: 'center' }, monthArrowText: { color: '#17233D', fontSize: 23, lineHeight: 25 },
  calendarMonth: { color: '#17233D', fontSize: 19, fontWeight: '900', textAlign: 'center' }, calendarSub: { color: '#93969D', fontSize: 8, textAlign: 'center', marginTop: 3 },
  weekRow: { flexDirection: 'row', marginBottom: 7 }, weekName: { width: '14.285%', textAlign: 'center', color: '#9B9DA2', fontSize: 9, fontWeight: '800' },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' }, dayCell: { width: '14.285%', aspectRatio: 1, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginVertical: 2 }, dayCellSelected: { borderWidth: 2, borderColor: '#17233D' },
  dayNumber: { color: '#525762', fontSize: 11, fontWeight: '700' }, dayNumberTrip: { color: '#FFFFFF', fontWeight: '900' }, dayNumberSelected: { fontSize: 12 }, dayTripDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: '#FFFFFF', marginTop: 2 },
  calendarLegend: { borderTopWidth: 1, borderTopColor: '#EFEEE9', marginTop: 12, paddingTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 11 }, calendarLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 }, calendarLegendDot: { width: 7, height: 7, borderRadius: 4 }, calendarLegendText: { color: '#737780', fontSize: 9, fontWeight: '700' },
  calendarResults: { marginTop: 17 }, calendarResultDate: { color: '#17233D', fontSize: 15, fontWeight: '900', marginBottom: 4 }, emptyDate: { backgroundColor: '#EEF8F5', borderRadius: 17, padding: 20, alignItems: 'center' }, emptyDateTitle: { color: '#5E6D6B', fontSize: 11, fontWeight: '800' }, emptyDateAction: { color: '#0B9888', fontSize: 10, fontWeight: '900', marginTop: 8 }
  ,regionChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 7, marginBottom: 16 }, regionChoice: { borderWidth: 1, borderColor: '#DEDCD5', backgroundColor: '#FFFFFF', borderRadius: 10, paddingHorizontal: 11, paddingVertical: 8 }, regionChoiceActive: { borderColor: '#19A996', backgroundColor: '#DDF7F1' }, regionChoiceText: { color: '#7E8388', fontSize: 10, fontWeight: '800' }, regionChoiceTextActive: { color: '#087D70' }
});
