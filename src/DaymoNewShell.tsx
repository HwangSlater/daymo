import * as Clipboard from 'expo-clipboard';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import {
  Appearance,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { AppearanceMode, resolveTheme, ThemeId, themeOptions } from './theme';

type RootTab = 'home' | 'trips' | 'discover' | 'us';
type TripTab = 'plan' | 'places' | 'packing' | 'food' | 'memory';
type Composer = 'trip' | 'schedule' | 'place' | 'packing' | 'food' | 'memory' | null;
type Trip = { id: string; place: string; region: string; dates: string; days: number; color: string };
type Plan = { id: string; time: string; title: string; place?: string; day: number };
type Place = { id: string; name: string; area: string; tags: string[]; saved: boolean };
type Packing = { id: string; title: string; owner: string; done: boolean };

const seedTrips: Trip[] = [
  { id: 'gangneung', place: '강릉', region: '강원특별자치도', dates: '8. 21 — 8. 23', days: 3, color: '#F4775E' },
  { id: 'busan', place: '부산', region: '부산광역시', dates: '7. 04 — 7. 06', days: 3, color: '#3887D6' },
  { id: 'jeju', place: '제주', region: '제주특별자치도', dates: '5. 16 — 5. 19', days: 4, color: '#5D9C73' },
];

const rootTabs: { id: RootTab; label: string; glyph: string }[] = [
  { id: 'home', label: '홈', glyph: '⌂' },
  { id: 'trips', label: '여행', glyph: '↗' },
  { id: 'discover', label: '찾기', glyph: '⌕' },
  { id: 'us', label: '우리', glyph: '◡' },
];

const tripTabs: { id: TripTab; label: string }[] = [
  { id: 'plan', label: '일정' },
  { id: 'places', label: '장소' },
  { id: 'packing', label: '준비' },
  { id: 'food', label: '요리' },
  { id: 'memory', label: '기록' },
];

export function DaymoNewShell() {
  const system = useColorScheme();
  const [appearance, setAppearance] = useState<AppearanceMode>('system');
  const [themeId, setThemeId] = useState<ThemeId>('daymo');
  const [tab, setTab] = useState<RootTab>('home');
  const [tripTab, setTripTab] = useState<TripTab>('plan');
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
  const [composer, setComposer] = useState<Composer>(null);
  const [trips, setTrips] = useState(seedTrips);
  const [plans, setPlans] = useState<Plan[]>([
    { id: '1', day: 1, time: '11:30', title: '강릉역 도착', place: '강릉역' },
    { id: '2', day: 1, time: '12:20', title: '초당순두부 점심', place: '초당동' },
    { id: '3', day: 1, time: '16:00', title: '바다 보며 체크인', place: '안목해변' },
    { id: '4', day: 2, time: '10:30', title: '천천히 아침 산책', place: '경포호' },
  ]);
  const [places, setPlaces] = useState<Place[]>([
    { id: '1', name: '엄지네 포장마차', area: '포남동', tags: ['꼬막', '저녁'], saved: false },
    { id: '2', name: '보사노바', area: '안목해변', tags: ['커피', '바다'], saved: true },
    { id: '3', name: '경포호', area: '저동', tags: ['산책', '아침'], saved: false },
  ]);
  const [packing, setPacking] = useState<Packing[]>([
    { id: '1', title: '충전기와 보조배터리', owner: '나', done: true },
    { id: '2', title: '상비약', owner: '동행', done: false },
    { id: '3', title: '우산', owner: '함께', done: false },
    { id: '4', title: '카메라', owner: '미정', done: false },
  ]);
  const [foods, setFoods] = useState(['밀푀유나베', '감바스와 바게트']);
  const [memories, setMemories] = useState(['바다 냄새가 좋아서 계획보다 오래 걸었다.']);

  const dark = appearance === 'dark' || (appearance === 'system' && system === 'dark');
  const t = useMemo(() => resolveTheme(themeId, dark), [themeId, dark]);
  const ui = palette(t.dark, t.primary, t.secondary);

  const openTrip = (nextTab: TripTab = 'plan') => {
    setActiveTrip(trips[0]);
    setTripTab(nextTab);
  };

  const submit = (value: string, extra?: string) => {
    const text = value.trim();
    if (!text) return;
    if (composer === 'trip') {
      const trip: Trip = { id: Date.now().toString(), place: text, region: extra || '지역 미정', dates: '날짜 정하기', days: 0, color: t.primary };
      setTrips((prev) => [trip, ...prev]);
      setComposer(null);
      setActiveTrip(trip);
      setTab('trips');
      return;
    }
    if (composer === 'schedule') setPlans((prev) => [...prev, { id: Date.now().toString(), day: 1, time: extra || '시간 미정', title: text }]);
    if (composer === 'place') setPlaces((prev) => [...prev, { id: Date.now().toString(), name: text, area: extra || '지역 미정', tags: ['새 장소'], saved: false }]);
    if (composer === 'packing') setPacking((prev) => [...prev, { id: Date.now().toString(), title: text, owner: extra || '미정', done: false }]);
    if (composer === 'food') setFoods((prev) => [...prev, text]);
    if (composer === 'memory') setMemories((prev) => [...prev, text]);
    setComposer(null);
  };

  if (activeTrip) {
    return (
      <Frame ui={ui} dark={dark}>
        <TripWorkspace
          trip={activeTrip}
          tab={tripTab}
          setTab={setTripTab}
          onBack={() => setActiveTrip(null)}
          plans={plans}
          places={places}
          packing={packing}
          foods={foods}
          memories={memories}
          setPlans={setPlans}
          setPlaces={setPlaces}
          setPacking={setPacking}
          openComposer={setComposer}
          ui={ui}
        />
        <ComposerModal kind={composer} close={() => setComposer(null)} submit={submit} ui={ui} />
      </Frame>
    );
  }

  return (
    <Frame ui={ui} dark={dark}>
      <View style={styles.content}>
        {tab === 'home' && <Home trips={trips} openTrip={openTrip} setTab={setTab} ui={ui} />}
        {tab === 'trips' && <Trips trips={trips} openTrip={(trip) => setActiveTrip(trip)} add={() => setComposer('trip')} ui={ui} />}
        {tab === 'discover' && <Discover places={places} openTrip={openTrip} ui={ui} />}
        {tab === 'us' && <Us themeId={themeId} setThemeId={setThemeId} appearance={appearance} setAppearance={setAppearance} ui={ui} />}
      </View>
      <Navigation active={tab} setActive={setTab} ui={ui} />
      <ComposerModal kind={composer} close={() => setComposer(null)} submit={submit} ui={ui} />
    </Frame>
  );
}

function Frame({ children, ui, dark }: { children: React.ReactNode; ui: UI; dark: boolean }) {
  return (
    <View style={[styles.stage, { backgroundColor: ui.bg }]}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <View style={[styles.app, { backgroundColor: ui.bg }]}>{children}</View>
    </View>
  );
}

function Home({ trips, openTrip, setTab, ui }: { trips: Trip[]; openTrip: (tab?: TripTab) => void; setTab: (v: RootTab) => void; ui: UI }) {
  const trip = trips[0];
  return (
    <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      <Header eyebrow="둘이 만드는 여행" title="Daymo" ui={ui} />
      <Pressable onPress={() => openTrip()} style={[styles.hero, { backgroundColor: ui.ink }]}>
        <View style={styles.sun} />
        <View style={styles.hillBack} />
        <View style={[styles.hillFront, { backgroundColor: trip.color }]} />
        <View style={styles.heroCopy}>
          <Text style={styles.heroIndex}>NEXT · 01</Text>
          <Text style={styles.heroTitle}>{trip.place}</Text>
          <Text style={styles.heroDate}>{trip.dates}  ·  {trip.days}일</Text>
        </View>
        <View style={styles.heroArrow}><Text style={styles.heroArrowText}>↗</Text></View>
      </Pressable>

      <Text style={[styles.tip, { color: ui.muted }]}>여행 전에 장소를 모아두면, 일정 짜는 시간이 훨씬 짧아져요.</Text>

      <View style={[styles.actionRail, { borderColor: ui.line }]}>
        <Quick number="01" label="일정 이어 짜기" note="4개 일정" onPress={() => openTrip('plan')} ui={ui} />
        <Quick number="02" label="장소 둘러보기" note="3곳 저장" onPress={() => openTrip('places')} ui={ui} />
        <Quick number="03" label="준비 확인하기" note="1 / 4 완료" onPress={() => openTrip('packing')} ui={ui} last />
      </View>

      <View style={styles.sectionHeading}>
        <Text style={[styles.sectionTitle, { color: ui.text }]}>지난 여행</Text>
        <Pressable onPress={() => setTab('trips')}><Text style={[styles.textButton, { color: ui.accent }]}>모두 보기</Text></Pressable>
      </View>
      <View style={styles.pastRow}>
        {trips.slice(1, 3).map((item, index) => (
          <Pressable key={item.id} onPress={() => setTab('trips')} style={[styles.pastTrip, { backgroundColor: index ? ui.mint : ui.blue }]}>
            <Text style={styles.pastNo}>0{index + 2}</Text>
            <Text style={styles.pastPlace}>{item.place}</Text>
            <Text style={styles.pastDate}>{item.dates}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

function Trips({ trips, openTrip, add, ui }: { trips: Trip[]; openTrip: (t: Trip) => void; add: () => void; ui: UI }) {
  const [view, setView] = useState<'목록' | '캘린더'>('목록');
  return (
    <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      <Header eyebrow="우리의 이동 기록" title="여행" action="＋ 새 여행" onAction={add} ui={ui} />
      <View style={[styles.switcher, { backgroundColor: ui.soft }]}>
        {(['목록', '캘린더'] as const).map((v) => <Pressable key={v} onPress={() => setView(v)} style={[styles.switchItem, view === v && { backgroundColor: ui.surface }]}><Text style={[styles.switchText, { color: view === v ? ui.text : ui.muted }]}>{v}</Text></Pressable>)}
      </View>
      {view === '목록' ? (
        <View style={[styles.timeline, { borderLeftColor: ui.line }]}>
          {trips.map((trip, index) => (
            <Pressable key={trip.id} onPress={() => openTrip(trip)} style={styles.tripLine}>
              <View style={[styles.tripDot, { backgroundColor: trip.color, borderColor: ui.bg }]} />
              <Text style={[styles.tripYear, { color: ui.muted }]}>{index === 0 ? '다가오는 여행' : '2026'}</Text>
              <View style={styles.tripLineMain}>
                <Text style={[styles.tripPlace, { color: ui.text }]}>{trip.place}</Text>
                <Text style={[styles.tripDates, { color: ui.muted }]}>{trip.dates}</Text>
              </View>
              <Text style={[styles.chevron, { color: ui.text }]}>›</Text>
            </Pressable>
          ))}
        </View>
      ) : <CalendarPoster ui={ui} />}
    </ScrollView>
  );
}

function CalendarPoster({ ui }: { ui: UI }) {
  const days = Array.from({ length: 35 }, (_, i) => i - 2);
  return (
    <View style={[styles.calendar, { borderColor: ui.line }]}>
      <View style={styles.calendarHead}><Text style={[styles.calendarMonth, { color: ui.text }]}>AUGUST</Text><Text style={[styles.calendarYear, { color: ui.muted }]}>2026</Text></View>
      <View style={styles.week}>{['일','월','화','수','목','금','토'].map((d) => <Text key={d} style={[styles.weekDay, { color: ui.muted }]}>{d}</Text>)}</View>
      <View style={styles.dayGrid}>{days.map((d, i) => <View key={i} style={[styles.day, d >= 21 && d <= 23 && { backgroundColor: ui.accent }]}>{d > 0 && d <= 31 ? <Text style={[styles.dayText, { color: d >= 21 && d <= 23 ? '#fff' : ui.text }]}>{d}</Text> : null}</View>)}</View>
      <Text style={[styles.calendarCaption, { color: ui.muted }]}>21 — 23 · 강릉</Text>
    </View>
  );
}

function Discover({ places, openTrip, ui }: { places: Place[]; openTrip: (tab?: TripTab) => void; ui: UI }) {
  const [query, setQuery] = useState('');
  const shown = places.filter((p) => `${p.name}${p.area}${p.tags.join('')}`.includes(query));
  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <Header eyebrow="다음 여행의 후보" title="찾기" ui={ui} />
      <View style={[styles.search, { borderColor: ui.text }]}><Text style={[styles.searchGlyph, { color: ui.text }]}>⌕</Text><TextInput value={query} onChangeText={setQuery} placeholder="장소, 지역, 태그로 찾기" placeholderTextColor={ui.muted} style={[styles.searchInput, { color: ui.text }]} /></View>
      <View style={styles.tagRow}>{['바다', '산책', '맛집', '숙소'].map((tag, i) => <Pressable key={tag} style={[styles.bigTag, { backgroundColor: [ui.peach, ui.mint, ui.yellow, ui.blue][i] }]}><Text style={styles.bigTagText}>#{tag}</Text></Pressable>)}</View>
      <Text style={[styles.listTitle, { color: ui.text }]}>저장한 장소 · {shown.length}</Text>
      {shown.map((place, index) => <Pressable key={place.id} onPress={() => openTrip('places')} style={[styles.placeRow, { borderBottomColor: ui.line }]}><Text style={[styles.placeIndex, { color: ui.accent }]}>{String(index + 1).padStart(2, '0')}</Text><View style={styles.flex}><Text style={[styles.placeName, { color: ui.text }]}>{place.name}</Text><Text style={[styles.placeMeta, { color: ui.muted }]}>{place.area}  ·  {place.tags.join('  ')}</Text></View><Text style={[styles.chevron, { color: ui.text }]}>›</Text></Pressable>)}
    </ScrollView>
  );
}

function Us({ themeId, setThemeId, appearance, setAppearance, ui }: { themeId: ThemeId; setThemeId: (v: ThemeId) => void; appearance: AppearanceMode; setAppearance: (v: AppearanceMode) => void; ui: UI }) {
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Header eyebrow="둘이 쓰는 공간" title="우리" ui={ui} />
      <View style={[styles.usPoster, { backgroundColor: ui.accent }]}><Text style={styles.usSmall}>DAYMO PAIR</Text><Text style={styles.usTitle}>우리답게, 누구의 이름도 없이.</Text><View style={styles.faces}><View style={styles.face}><Text>◡</Text></View><Text style={styles.plus}>＋</Text><View style={styles.face}><Text>◡</Text></View></View></View>
      <SettingTitle title="색 조합" caption="앱 전체에 적용돼요" ui={ui} />
      <View style={styles.themeGrid}>{themeOptions.map((opt) => <Pressable key={opt.id} onPress={() => setThemeId(opt.id)} style={[styles.themeChoice, { borderColor: themeId === opt.id ? ui.text : ui.line }]}><View style={[styles.themeBlob, { backgroundColor: opt.primary }]} /><Text style={[styles.themeName, { color: ui.text }]}>{opt.name}</Text>{themeId === opt.id && <Text style={[styles.themeCheck, { color: ui.text }]}>✓</Text>}</Pressable>)}</View>
      <SettingTitle title="화면 밝기" caption="시스템 설정을 따라갈 수 있어요" ui={ui} />
      <View style={[styles.appearance, { borderColor: ui.line }]}>{(['system','light','dark'] as AppearanceMode[]).map((mode) => <Pressable key={mode} onPress={() => { setAppearance(mode); if (mode === 'system') Appearance.setColorScheme(null); }} style={[styles.appearanceItem, appearance === mode && { backgroundColor: ui.text }]}><Text style={{ color: appearance === mode ? ui.bg : ui.text, fontWeight: '700' }}>{mode === 'system' ? '시스템' : mode === 'light' ? '라이트' : '다크'}</Text></Pressable>)}</View>
    </ScrollView>
  );
}

function TripWorkspace(props: { trip: Trip; tab: TripTab; setTab: (v: TripTab) => void; onBack: () => void; plans: Plan[]; places: Place[]; packing: Packing[]; foods: string[]; memories: string[]; setPlans: React.Dispatch<React.SetStateAction<Plan[]>>; setPlaces: React.Dispatch<React.SetStateAction<Place[]>>; setPacking: React.Dispatch<React.SetStateAction<Packing[]>>; openComposer: (v: Composer) => void; ui: UI }) {
  const { trip, tab, setTab, onBack, ui } = props;
  return (
    <View style={styles.workspace}>
      <View style={[styles.tripTop, { backgroundColor: ui.ink }]}>
        <Pressable onPress={onBack} hitSlop={12} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable>
        <View><Text style={styles.tripTopMeta}>{trip.dates}</Text><Text style={styles.tripTopTitle}>{trip.place}</Text></View>
        <Pressable onPress={() => Share.share({ message: `${trip.place} 여행 · ${trip.dates}` })} style={styles.share}><Text style={styles.shareText}>공유</Text></Pressable>
      </View>
      <View style={[styles.tripTabs, { backgroundColor: ui.bg, borderBottomColor: ui.line }]}>{tripTabs.map((item) => <Pressable key={item.id} onPress={() => setTab(item.id)} style={[styles.tripTab, tab === item.id && { borderBottomColor: ui.accent }]}><Text style={[styles.tripTabText, { color: tab === item.id ? ui.text : ui.muted }]}>{item.label}</Text></Pressable>)}</View>
      <ScrollView contentContainerStyle={styles.tripBody} showsVerticalScrollIndicator={false}>
        {tab === 'plan' && <PlanView {...props} />}
        {tab === 'places' && <PlacesView {...props} />}
        {tab === 'packing' && <PackingView {...props} />}
        {tab === 'food' && <FoodView {...props} />}
        {tab === 'memory' && <MemoryView {...props} />}
      </ScrollView>
    </View>
  );
}

function PlanView({ plans, openComposer, ui }: any) {
  return <><SectionIntro number="01" title="여행 일정" copy="시간표보다 흐름이 먼저 보이도록 정리했어요." action="일정 추가" onAction={() => openComposer('schedule')} ui={ui} />{[1,2].map((day) => <View key={day} style={styles.daySection}><Text style={[styles.dayLabel, { color: ui.accent }]}>DAY {day}</Text>{plans.filter((p: Plan) => p.day === day).map((p: Plan) => <View key={p.id} style={styles.planRow}><Text style={[styles.planTime, { color: ui.muted }]}>{p.time}</Text><View style={[styles.planPin, { backgroundColor: ui.accent }]} /><View style={styles.flex}><Text style={[styles.planTitle, { color: ui.text }]}>{p.title}</Text>{p.place && <Text style={[styles.planPlace, { color: ui.muted }]}>{p.place}</Text>}</View></View>)}</View>)}</>;
}

function PlacesView({ places, setPlaces, plans, setPlans, openComposer, ui }: any) {
  const save = (p: Place) => { setPlaces((prev: Place[]) => prev.map((v) => v.id === p.id ? { ...v, saved: true } : v)); setPlans((prev: Plan[]) => prev.some((v) => v.title === p.name) ? prev : [...prev, { id: Date.now().toString(), day: 1, time: '시간 미정', title: p.name, place: p.area }]); };
  const copy = () => Clipboard.setStringAsync(places.map((p: Place) => `${p.name} #${p.tags.join(' #')}`).join('\n'));
  return <><SectionIntro number="02" title="갈 곳 보관함" copy="후보를 모으고, 정해진 곳만 일정에 담아보세요." action="장소 추가" onAction={() => openComposer('place')} ui={ui} /><View style={styles.inlineActions}><SmallAction label="목록 복사" onPress={copy} ui={ui} /><SmallAction label="붙여넣어 추가" onPress={() => openComposer('place')} ui={ui} /></View>{places.map((p: Place, i: number) => <View key={p.id} style={[styles.placeCard, { backgroundColor: i % 2 ? ui.mint : ui.peach }]}><Text style={styles.placeCardNo}>{String(i+1).padStart(2,'0')}</Text><Text style={styles.placeCardTitle}>{p.name}</Text><Text style={styles.placeCardArea}>{p.area}</Text><View style={styles.placeTags}>{p.tags.map((x) => <Text key={x} style={styles.placeTag}>#{x}</Text>)}</View><View style={styles.placeButtons}><Pressable onPress={() => Linking.openURL(`https://map.naver.com/p/search/${encodeURIComponent(p.name)}`)}><Text style={styles.placeButton}>네이버 지도 ↗</Text></Pressable><Pressable onPress={() => save(p)}><Text style={styles.placeButton}>{p.saved ? '일정에 담김 ✓' : '일정에 담기 ＋'}</Text></Pressable></View></View>)}</>;
}

function PackingView({ packing, setPacking, openComposer, ui }: any) {
  const owners = ['미정','나','동행','함께'];
  const copy = () => Clipboard.setStringAsync(packing.map((p: Packing) => `${p.done ? '[완료]' : '[ ]'} ${p.title} / ${p.owner}`).join('\n'));
  return <><SectionIntro number="03" title="함께 준비" copy="누가 챙길지 가볍게 정하고, 챙기면 바로 표시해요." action="준비물 추가" onAction={() => openComposer('packing')} ui={ui} /><View style={styles.inlineActions}><SmallAction label="전체 복사" onPress={copy} ui={ui} /><SmallAction label="목록 붙여넣기" onPress={() => openComposer('packing')} ui={ui} /></View><View style={[styles.progressTrack, { backgroundColor: ui.soft }]}><View style={[styles.progressFill, { width: `${packing.length ? packing.filter((p: Packing) => p.done).length / packing.length * 100 : 0}%`, backgroundColor: ui.accent }]} /></View>{packing.map((p: Packing) => <View key={p.id} style={[styles.packRow, { borderBottomColor: ui.line }]}><Pressable onPress={() => setPacking((prev: Packing[]) => prev.map((v) => v.id === p.id ? {...v, done: !v.done} : v))} style={[styles.check, { borderColor: p.done ? ui.accent : ui.line, backgroundColor: p.done ? ui.accent : 'transparent' }]}><Text style={styles.checkText}>{p.done ? '✓' : ''}</Text></Pressable><Text style={[styles.packTitle, { color: p.done ? ui.muted : ui.text, textDecorationLine: p.done ? 'line-through' : 'none' }]}>{p.title}</Text><Pressable onPress={() => setPacking((prev: Packing[]) => prev.map((v) => v.id === p.id ? {...v, owner: owners[(owners.indexOf(v.owner)+1)%owners.length]} : v))} style={[styles.owner, { backgroundColor: ui.soft }]}><Text style={[styles.ownerText, { color: ui.text }]}>{p.owner}</Text></Pressable></View>)}</>;
}

function FoodView({ foods, openComposer, ui }: any) { return <><SectionIntro number="04" title="여행 요리" copy="주방이 있는 여행에서만 꺼내 쓰는 작은 메뉴판이에요." action="요리 추가" onAction={() => openComposer('food')} ui={ui} />{foods.map((food: string, i: number) => <View key={`${food}${i}`} style={[styles.foodRow, { borderColor: ui.line }]}><Text style={[styles.foodNo, { color: ui.accent }]}>0{i+1}</Text><View><Text style={[styles.foodTitle, { color: ui.text }]}>{food}</Text><Text style={[styles.foodMeta, { color: ui.muted }]}>재료와 조리 순서를 적어보세요</Text></View><Text style={[styles.chevron, { color: ui.text }]}>›</Text></View>)}</> }

function MemoryView({ memories, openComposer, ui }: any) { return <><SectionIntro number="05" title="여행 기록" copy="완벽한 글보다 그날의 한 문장을 남겨요." action="기록 추가" onAction={() => openComposer('memory')} ui={ui} /><View style={styles.photoStrip}><View style={[styles.photoLarge, { backgroundColor: ui.blue }]}><Text style={styles.photoMark}>AUG</Text></View><Pressable onPress={() => openComposer('memory')} style={[styles.photoAdd, { borderColor: ui.line }]}><Text style={[styles.photoPlus, { color: ui.text }]}>＋</Text><Text style={[styles.photoAddText, { color: ui.muted }]}>사진 추가</Text></Pressable></View>{memories.map((m: string, i: number) => <View key={i} style={[styles.note, { backgroundColor: ui.yellow }]}><Text style={styles.noteDate}>DAY {i+1}</Text><Text style={styles.noteText}>{m}</Text></View>)}</> }

function Header({ eyebrow, title, action, onAction, ui }: { eyebrow: string; title: string; action?: string; onAction?: () => void; ui: UI }) { return <View style={styles.header}><View><Text style={[styles.eyebrow, { color: ui.accent }]}>{eyebrow}</Text><Text style={[styles.title, { color: ui.text }]}>{title}</Text></View>{action && <Pressable onPress={onAction} style={[styles.headerAction, { borderColor: ui.text }]}><Text style={[styles.headerActionText, { color: ui.text }]}>{action}</Text></Pressable>}</View> }
function Quick({ number, label, note, onPress, ui, last }: any) { return <Pressable onPress={onPress} style={[styles.quick, { borderBottomColor: ui.line }, last && { borderBottomWidth: 0 }]}><Text style={[styles.quickNo, { color: ui.accent }]}>{number}</Text><Text style={[styles.quickLabel, { color: ui.text }]}>{label}</Text><Text style={[styles.quickNote, { color: ui.muted }]}>{note}</Text><Text style={[styles.quickArrow, { color: ui.text }]}>›</Text></Pressable> }
function SectionIntro({ number, title, copy, action, onAction, ui }: any) { return <View style={styles.sectionIntro}><Text style={[styles.sectionNumber, { color: ui.accent }]}>{number}</Text><Text style={[styles.sectionIntroTitle, { color: ui.text }]}>{title}</Text><Text style={[styles.sectionCopy, { color: ui.muted }]}>{copy}</Text><Pressable onPress={onAction} style={[styles.solidButton, { backgroundColor: ui.text }]}><Text style={[styles.solidButtonText, { color: ui.bg }]}>＋ {action}</Text></Pressable></View> }
function SmallAction({ label, onPress, ui }: any) { return <Pressable onPress={onPress} style={[styles.smallAction, { borderColor: ui.line }]}><Text style={[styles.smallActionText, { color: ui.text }]}>{label}</Text></Pressable> }
function SettingTitle({ title, caption, ui }: any) { return <View style={styles.settingTitle}><Text style={[styles.settingName, { color: ui.text }]}>{title}</Text><Text style={[styles.settingCaption, { color: ui.muted }]}>{caption}</Text></View> }

function Navigation({ active, setActive, ui }: { active: RootTab; setActive: (v: RootTab) => void; ui: UI }) {
  return <View style={[styles.nav, { backgroundColor: ui.surface, borderColor: ui.line }]}>{rootTabs.map((item) => <Pressable key={item.id} onPress={() => setActive(item.id)} style={styles.navItem}><Text style={[styles.navGlyph, { color: active === item.id ? ui.accent : ui.muted }]}>{item.glyph}</Text><Text style={[styles.navLabel, { color: active === item.id ? ui.text : ui.muted }]}>{item.label}</Text>{active === item.id && <View style={[styles.navDot, { backgroundColor: ui.accent }]} />}</Pressable>)}</View>;
}

function ComposerModal({ kind, close, submit, ui }: { kind: Composer; close: () => void; submit: (value: string, extra?: string) => void; ui: UI }) {
  const [value, setValue] = useState(''); const [extra, setExtra] = useState('');
  if (!kind) return null;
  const labels: Record<Exclude<Composer, null>, [string,string,string]> = {
    trip: ['새 여행', '어디로 떠나나요?', '지역 (예: 강원특별자치도)'], schedule: ['일정 추가', '무엇을 할까요?', '시간 (예: 14:30)'], place: ['장소 추가', '장소 이름', '지역 또는 동네'], packing: ['준비물 추가', '무엇을 챙길까요?', '담당: 나 / 동행 / 함께'], food: ['요리 추가', '만들 요리 이름', '메모 (선택)'], memory: ['기록 추가', '그날의 한 문장', '날짜 또는 제목 (선택)'],
  };
  const label = labels[kind];
  return <Modal transparent animationType="slide" onRequestClose={close}><Pressable onPress={close} style={styles.scrim}><Pressable onPress={() => {}} style={[styles.sheet, { backgroundColor: ui.surface }]}><View style={[styles.sheetHandle, { backgroundColor: ui.line }]} /><Text style={[styles.sheetTitle, { color: ui.text }]}>{label[0]}</Text><TextInput autoFocus value={value} onChangeText={setValue} placeholder={label[1]} placeholderTextColor={ui.muted} style={[styles.sheetInput, { color: ui.text, borderBottomColor: ui.text }]} /><TextInput value={extra} onChangeText={setExtra} placeholder={label[2]} placeholderTextColor={ui.muted} style={[styles.sheetInputSmall, { color: ui.text, borderBottomColor: ui.line }]} /><Pressable onPress={() => submit(value, extra)} style={[styles.submit, { backgroundColor: ui.accent }]}><Text style={styles.submitText}>저장하기</Text></Pressable><Pressable onPress={close}><Text style={[styles.cancel, { color: ui.muted }]}>취소</Text></Pressable></Pressable></Pressable></Modal>;
}

type UI = ReturnType<typeof palette>;
function palette(dark: boolean, accent: string, secondary: string) {
  return dark ? { bg: '#101114', surface: '#1A1C20', soft: '#25272C', text: '#F4F1E9', muted: '#AAA9A4', line: '#34363B', ink: '#ECE8DE', accent, peach: '#A94F42', mint: '#326D61', yellow: '#87702E', blue: '#345E89' } : { bg: '#F5F1E8', surface: '#FFFCF5', soft: '#E9E4D9', text: '#202127', muted: '#77756F', line: '#D8D1C4', ink: '#202127', accent, peach: '#F6AA98', mint: '#9BCBBC', yellow: '#F4D77C', blue: secondary === '#19B6A3' ? '#88BDE4' : secondary };
}

const styles = StyleSheet.create({
  stage: { flex: 1, alignItems: 'center' }, app: { flex: 1, width: '100%', maxWidth: 520, paddingTop: Platform.OS === 'ios' ? 52 : 28 }, content: { flex: 1 }, page: { paddingHorizontal: 22, paddingBottom: 126 },
  header: { minHeight: 92, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 22 }, eyebrow: { fontSize: 12, fontWeight: '800', letterSpacing: 1.2, marginBottom: 3 }, title: { fontSize: 38, lineHeight: 43, fontWeight: '900', letterSpacing: -1.8 }, headerAction: { borderWidth: 1.5, borderRadius: 99, paddingHorizontal: 13, paddingVertical: 9, marginBottom: 4 }, headerActionText: { fontSize: 13, fontWeight: '800' },
  hero: { height: 280, borderRadius: 8, overflow: 'hidden', position: 'relative' }, sun: { position: 'absolute', width: 88, height: 88, borderRadius: 44, backgroundColor: '#F6D96D', right: 28, top: 34 }, hillBack: { position: 'absolute', width: 340, height: 180, borderRadius: 170, backgroundColor: '#6C91A7', left: -70, bottom: -78, transform: [{ rotate: '-7deg' }] }, hillFront: { position: 'absolute', width: 390, height: 210, borderRadius: 195, right: -150, bottom: -112, transform: [{ rotate: '8deg' }] }, heroCopy: { position: 'absolute', left: 22, bottom: 22 }, heroIndex: { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 1.4 }, heroTitle: { color: '#fff', fontSize: 48, lineHeight: 54, fontWeight: '900', letterSpacing: -2 }, heroDate: { color: '#fff', fontSize: 13, fontWeight: '700', marginTop: 5 }, heroArrow: { position: 'absolute', right: 17, bottom: 17, width: 42, height: 42, borderRadius: 21, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }, heroArrowText: { fontSize: 22, color: '#202127' }, tip: { fontSize: 13, lineHeight: 20, paddingVertical: 17 },
  actionRail: { borderTopWidth: 1, borderBottomWidth: 1 }, quick: { minHeight: 59, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center' }, quickNo: { width: 34, fontSize: 11, fontWeight: '900' }, quickLabel: { flex: 1, fontSize: 15, fontWeight: '800' }, quickNote: { fontSize: 12, marginRight: 10 }, quickArrow: { fontSize: 24 }, sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 30, marginBottom: 13 }, sectionTitle: { fontSize: 21, fontWeight: '900', letterSpacing: -.5 }, textButton: { fontSize: 13, fontWeight: '800' }, pastRow: { flexDirection: 'row', gap: 10 }, pastTrip: { flex: 1, height: 130, borderRadius: 6, padding: 14, justifyContent: 'flex-end' }, pastNo: { position: 'absolute', top: 12, right: 12, fontSize: 11, fontWeight: '900', color: '#202127' }, pastPlace: { fontSize: 22, fontWeight: '900', color: '#202127' }, pastDate: { fontSize: 11, marginTop: 3, color: '#343434' },
  switcher: { flexDirection: 'row', borderRadius: 4, padding: 3, marginBottom: 28 }, switchItem: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 3 }, switchText: { fontSize: 13, fontWeight: '800' }, timeline: { marginLeft: 8, borderLeftWidth: 1 }, tripLine: { minHeight: 93, flexDirection: 'row', alignItems: 'center', paddingLeft: 21 }, tripDot: { position: 'absolute', left: -6, width: 11, height: 11, borderRadius: 6, borderWidth: 3 }, tripYear: { position: 'absolute', top: 7, left: 21, fontSize: 10, fontWeight: '800' }, tripLineMain: { flex: 1, paddingTop: 12 }, tripPlace: { fontSize: 25, fontWeight: '900', letterSpacing: -.8 }, tripDates: { fontSize: 12, marginTop: 3 }, chevron: { fontSize: 28 },
  calendar: { borderWidth: 1, borderRadius: 6, padding: 18 }, calendarHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 22 }, calendarMonth: { fontSize: 28, fontWeight: '900' }, calendarYear: { fontSize: 12, fontWeight: '700' }, week: { flexDirection: 'row', marginBottom: 8 }, weekDay: { width: '14.285%', textAlign: 'center', fontSize: 10, fontWeight: '800' }, dayGrid: { flexDirection: 'row', flexWrap: 'wrap' }, day: { width: '14.285%', aspectRatio: 1, borderRadius: 99, alignItems: 'center', justifyContent: 'center' }, dayText: { fontSize: 12, fontWeight: '700' }, calendarCaption: { textAlign: 'right', fontSize: 12, marginTop: 15 },
  search: { height: 53, borderBottomWidth: 2, flexDirection: 'row', alignItems: 'center', marginBottom: 20 }, searchGlyph: { fontSize: 27, marginRight: 8 }, searchInput: { flex: 1, fontSize: 16, fontWeight: '700' }, tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 31 }, bigTag: { borderRadius: 99, paddingHorizontal: 15, paddingVertical: 10 }, bigTagText: { color: '#202127', fontSize: 13, fontWeight: '800' }, listTitle: { fontSize: 18, fontWeight: '900', marginBottom: 8 }, placeRow: { minHeight: 72, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center' }, placeIndex: { fontSize: 11, fontWeight: '900', width: 34 }, flex: { flex: 1 }, placeName: { fontSize: 16, fontWeight: '800' }, placeMeta: { fontSize: 11, marginTop: 4 },
  usPoster: { minHeight: 210, borderRadius: 7, padding: 20, justifyContent: 'space-between' }, usSmall: { color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 1.6 }, usTitle: { color: '#fff', fontSize: 28, lineHeight: 34, fontWeight: '900', maxWidth: 280 }, faces: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end' }, face: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }, plus: { color: '#fff', marginHorizontal: 5 }, settingTitle: { marginTop: 28, marginBottom: 12 }, settingName: { fontSize: 18, fontWeight: '900' }, settingCaption: { fontSize: 12, marginTop: 2 }, themeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, themeChoice: { width: '48.5%', height: 58, borderWidth: 1.5, borderRadius: 5, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11 }, themeBlob: { width: 24, height: 24, borderRadius: 12, marginRight: 9 }, themeName: { fontSize: 13, fontWeight: '800', flex: 1 }, themeCheck: { fontWeight: '900' }, appearance: { flexDirection: 'row', padding: 3, borderWidth: 1, borderRadius: 5 }, appearanceItem: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 3 },
  nav: { position: 'absolute', left: 18, right: 18, bottom: Platform.OS === 'ios' ? 20 : 12, height: 70, borderWidth: 1, borderRadius: 12, flexDirection: 'row', shadowColor: '#000', shadowOpacity: .1, shadowRadius: 14, shadowOffset: { width: 0, height: 7 }, elevation: 8 }, navItem: { flex: 1, alignItems: 'center', justifyContent: 'center' }, navGlyph: { fontSize: 19, lineHeight: 21, fontWeight: '700' }, navLabel: { fontSize: 10, fontWeight: '800', marginTop: 2 }, navDot: { position: 'absolute', bottom: 5, width: 4, height: 4, borderRadius: 2 },
  workspace: { flex: 1 }, tripTop: { height: 126, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'flex-end', paddingBottom: 18 }, back: { width: 35, marginRight: 4 }, backText: { color: '#fff', fontSize: 37, lineHeight: 40 }, tripTopMeta: { color: '#C8C7C2', fontSize: 10, fontWeight: '800', letterSpacing: 1 }, tripTopTitle: { color: '#fff', fontSize: 29, fontWeight: '900' }, share: { marginLeft: 'auto', borderWidth: 1, borderColor: '#777', borderRadius: 99, paddingHorizontal: 12, paddingVertical: 7 }, shareText: { color: '#fff', fontSize: 11, fontWeight: '800' }, tripTabs: { height: 52, borderBottomWidth: 1, flexDirection: 'row', paddingHorizontal: 12 }, tripTab: { flex: 1, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' }, tripTabText: { fontSize: 12, fontWeight: '800' }, tripBody: { padding: 22, paddingBottom: 80 },
  sectionIntro: { marginBottom: 25 }, sectionNumber: { fontSize: 11, fontWeight: '900', letterSpacing: 1 }, sectionIntroTitle: { fontSize: 31, fontWeight: '900', letterSpacing: -1.1, marginTop: 4 }, sectionCopy: { fontSize: 13, lineHeight: 20, marginTop: 6, maxWidth: 310 }, solidButton: { alignSelf: 'flex-start', borderRadius: 99, paddingHorizontal: 15, paddingVertical: 10, marginTop: 15 }, solidButtonText: { fontSize: 12, fontWeight: '900' }, daySection: { marginBottom: 28 }, dayLabel: { fontSize: 11, fontWeight: '900', marginBottom: 12 }, planRow: { minHeight: 62, flexDirection: 'row', alignItems: 'flex-start' }, planTime: { width: 50, fontSize: 12, fontWeight: '700', paddingTop: 2 }, planPin: { width: 8, height: 8, borderRadius: 4, marginTop: 5, marginRight: 14 }, planTitle: { fontSize: 15, fontWeight: '800' }, planPlace: { fontSize: 11, marginTop: 4 },
  inlineActions: { flexDirection: 'row', gap: 7, marginTop: -10, marginBottom: 18 }, smallAction: { borderWidth: 1, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 8 }, smallActionText: { fontSize: 11, fontWeight: '800' }, placeCard: { minHeight: 178, borderRadius: 6, padding: 17, marginBottom: 10 }, placeCardNo: { position: 'absolute', right: 15, top: 13, fontSize: 11, fontWeight: '900', color: '#202127' }, placeCardTitle: { fontSize: 22, fontWeight: '900', color: '#202127', paddingRight: 28 }, placeCardArea: { fontSize: 11, color: '#444', marginTop: 3 }, placeTags: { flexDirection: 'row', gap: 8, marginTop: 16 }, placeTag: { fontSize: 12, fontWeight: '800', color: '#202127' }, placeButtons: { marginTop: 'auto', flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#20212744', paddingTop: 11 }, placeButton: { fontSize: 11, fontWeight: '900', color: '#202127' },
  progressTrack: { height: 5, borderRadius: 3, marginBottom: 16 }, progressFill: { height: 5, borderRadius: 3 }, packRow: { height: 61, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1 }, check: { width: 23, height: 23, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginRight: 12 }, checkText: { color: '#fff', fontSize: 12, fontWeight: '900' }, packTitle: { flex: 1, fontSize: 14, fontWeight: '700' }, owner: { borderRadius: 99, paddingHorizontal: 10, paddingVertical: 6 }, ownerText: { fontSize: 10, fontWeight: '900' }, foodRow: { minHeight: 80, borderTopWidth: 1, flexDirection: 'row', alignItems: 'center' }, foodNo: { width: 39, fontSize: 11, fontWeight: '900' }, foodTitle: { fontSize: 16, fontWeight: '900' }, foodMeta: { fontSize: 11, marginTop: 3 }, foodRowLast: { borderBottomWidth: 1 },
  photoStrip: { flexDirection: 'row', gap: 9, height: 166, marginBottom: 14 }, photoLarge: { flex: 1.65, borderRadius: 6, padding: 13, justifyContent: 'flex-end' }, photoMark: { color: '#fff', fontSize: 11, fontWeight: '900', letterSpacing: 2 }, photoAdd: { flex: 1, borderWidth: 1, borderStyle: 'dashed', borderRadius: 6, alignItems: 'center', justifyContent: 'center' }, photoPlus: { fontSize: 27 }, photoAddText: { fontSize: 11, fontWeight: '700', marginTop: 4 }, note: { padding: 18, borderRadius: 5, transform: [{ rotate: '-1deg' }] }, noteDate: { color: '#202127', fontSize: 10, fontWeight: '900', marginBottom: 8 }, noteText: { color: '#202127', fontSize: 15, lineHeight: 23, fontWeight: '700' },
  scrim: { flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' }, sheet: { borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingHorizontal: 23, paddingTop: 11, paddingBottom: Platform.OS === 'ios' ? 34 : 22 }, sheetHandle: { width: 39, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 23 }, sheetTitle: { fontSize: 26, fontWeight: '900', marginBottom: 18 }, sheetInput: { borderBottomWidth: 2, fontSize: 19, fontWeight: '800', paddingVertical: 13 }, sheetInputSmall: { borderBottomWidth: 1, fontSize: 14, paddingVertical: 13, marginTop: 6 }, submit: { marginTop: 24, height: 51, borderRadius: 5, alignItems: 'center', justifyContent: 'center' }, submitText: { color: '#fff', fontWeight: '900' }, cancel: { textAlign: 'center', paddingTop: 15, fontSize: 13, fontWeight: '700' },
});
