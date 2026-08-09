import { useMemo, useState } from 'react';
import { Modal, Pressable, SafeAreaView, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { WarmTripDetail } from './WarmTripDetail';

type MainView = '홈' | '여행' | '찾기' | '우리';

const trips = [
  { name: '서울 구로구', date: '8월 21일 — 23일', note: '느긋한 숙소와 밀푀유나베', color: '#FF6B5F', mark: '08' },
  { name: '안양 평촌', date: '8월 1일 — 2일', note: '생새우 파티와 치킨', color: '#8B7CF6', mark: '08' },
  { name: '부산', date: '7월 24일 — 26일', note: '바다와 드론쇼', color: '#19B6A3', mark: '07' },
];

export function WarmAppShell() {
  const [view, setView] = useState<MainView>('홈');
  const [isTripOpen, setTripOpen] = useState(false);
  const [done, setDone] = useState<string[]>(['깻잎', '양파']);
  const toggle = (item: string) => setDone((items) => items.includes(item) ? items.filter((value) => value !== item) : [...items, item]);
  if (isTripOpen) return <WarmTripDetail done={done} toggle={toggle} onClose={() => setTripOpen(false)} />;
  return <SafeAreaView style={s.safe}><View style={s.body}>{view === '홈' && <Home open={() => setTripOpen(true)} goTrips={() => setView('여행')} />}{view === '여행' && <Trips open={() => setTripOpen(true)} />}{view === '찾기' && <Search open={() => setTripOpen(true)} />}{view === '우리' && <Together />}</View><BottomBar active={view} setActive={setView} /></SafeAreaView>;
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

function Trips({ open }: { open: () => void }) {
  const [filter, setFilter] = useState<'전체' | '예정' | '추억'>('전체');
  const [items, setItems] = useState(trips);
  const [creating, setCreating] = useState(false);
  const [place, setPlace] = useState('');
  const [date, setDate] = useState('9월 12일 — 14일');
  const [note, setNote] = useState('함께 만들 새로운 여행');
  const visibleTrips = filter === '예정' ? items.slice(0, Math.max(1, items.length - 2)) : filter === '추억' ? items.slice(-2) : items;
  const addTrip = () => { if (!place.trim()) return; setItems((current) => [{ name: place.trim(), date, note, color: '#19B6A3', mark: date.slice(0, 2).replace(/\D/g, '') || 'NEW' }, ...current]); setPlace(''); setCreating(false); setFilter('전체'); };
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
