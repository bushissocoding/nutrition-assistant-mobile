import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api } from '../../services/api';
import { colors, radius } from '../../theme/tokens';
import OptionListModal from '../../shared/components/OptionListModal';
import { formatLocalDateKey } from '../diary/diary-history.cjs';
import { getAccountMonthOptions, getDateInMonth, getMonthDateOptions, monthLabel } from './home-calendar.cjs';

const shortcuts = [
  ['♙', 'Đặt khám', 'appointments'],
  ['▣', 'Lịch hẹn', 'appointments-list'],
  ['▤', 'Hồ sơ y tế', 'medical-record'],
  ['⚒', 'Thực đơn', 'planner'],
  ['☷', 'Nhật ký', 'diary'],
  ['♧', 'Đi chợ', 'grocery'],
  ['◉', 'Cá nhân hóa', 'personalization'],
  ['?', 'Hướng dẫn', 'settings-help'],
];

const mealLabels = { BREAKFAST: 'Bữa sáng', LUNCH: 'Bữa trưa', DINNER: 'Bữa tối', SNACK: 'Bữa phụ' };
const mealTimes = { BREAKFAST: '08:30', LUNCH: '12:00', DINNER: '18:30', SNACK: '15:30' };
function formatNumber(value) {
  return Math.round(Number(value) || 0).toLocaleString('vi-VN');
}

function displayInitials(value) {
  const parts = String(value || '').trim().split(/[\s._-]+/).filter(Boolean);
  return parts.slice(0, 2).map(part => Array.from(part)[0]?.toLocaleUpperCase('vi')).join('') || 'TA';
}

export default function HomeScreen({ onNavigate, diary = [], diaryTotals = {}, diaryError = '', diaryLoading = false, onRetryDiary, plan, profile, account }) {
  const today = useMemo(() => new Date(), []);
  const todayKey = formatLocalDateKey(today);
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', []);
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [monthPickerVisible, setMonthPickerVisible] = useState(false);
  const [selectedDateResult, setSelectedDateResult] = useState(null);
  const [selectedDateError, setSelectedDateError] = useState('');
  const [selectedDateLoading, setSelectedDateLoading] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);
  const monthOptions = useMemo(() => getAccountMonthOptions(account?.createdAt, today), [account?.createdAt, today]);
  const selectedMonth = selectedDate.slice(0, 7);
  const dateOptions = useMemo(() => getMonthDateOptions(selectedMonth, account?.createdAt, today), [selectedMonth, account?.createdAt, today]);
  const selectedDateIndex = Math.max(0, dateOptions.indexOf(selectedDate));
  const dateStripRef = useRef(null);
  const showingToday = selectedDate === todayKey;
  const meals = showingToday ? diary : selectedDateResult?.items || [];
  const displayName = profile?.username?.trim() || account?.username?.trim() || account?.email?.split('@')[0] || 'Tài khoản';

  useEffect(() => {
    dateStripRef.current?.scrollTo({ x: Math.max(0, selectedDateIndex * 48 - 120), animated: false });
  }, [selectedDate, selectedDateIndex]);

  function selectMonth(value) {
    setSelectedDate(getDateInMonth(value, selectedDate, account?.createdAt, today) || todayKey);
  }

  useEffect(() => {
    if (showingToday) {
      setSelectedDateResult(null);
      setSelectedDateError('');
      setSelectedDateLoading(false);
      return undefined;
    }

    let active = true;
    setSelectedDateResult(null);
    setSelectedDateError('');
    setSelectedDateLoading(true);
    api.getMyMealEntries({ date: selectedDate, timeZone }).then(result => {
      if (!active) return;
      setSelectedDateResult({ items: Array.isArray(result?.items) ? result.items : [], hasEntries: result?.hasEntries === true });
      setSelectedDateError('');
    }).catch(error => {
      if (active) { setSelectedDateResult(null); setSelectedDateError(error?.message || 'Không tải được nhật ký ngày này.'); }
    }).finally(() => {
      if (active) setSelectedDateLoading(false);
    });
    return () => { active = false; };
  }, [selectedDate, showingToday, timeZone, retryVersion]);

  const events = useMemo(() => {
    const slots = ['BREAKFAST', 'LUNCH', 'DINNER'];
    const mealEvents = slots.flatMap(type => {
      const entries = meals.filter(item => item.mealType === type);
      return entries.length ? entries.map(entry => ({ type, entry, time: mealTimes[type] })) : [{ type, entry: null, time: mealTimes[type] }];
    });
    const snackEvents = meals.filter(item => item.mealType === 'SNACK').map(entry => ({ type: 'SNACK', entry, time: mealTimes.SNACK }));
    const order = { BREAKFAST: 0, LUNCH: 1, SNACK: 2, DINNER: 3 };
    return [...mealEvents, ...snackEvents].sort((left, right) => order[left.type] - order[right.type]);
  }, [meals]);

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <View style={styles.header}>
      <View style={styles.avatar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Text style={styles.avatarText}>{displayInitials(displayName)}</Text></View>
      <View style={styles.greeting}>
        <Text style={styles.welcome}>Chào mừng trở lại</Text>
        <Text style={styles.name}>{displayName}</Text>
      </View>
      <View style={styles.headerActions}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Thông báo" style={styles.headerAction} onPress={() => onNavigate('notifications')}><Text style={styles.headerActionText}>♧</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Cài đặt" style={styles.headerAction} onPress={() => onNavigate('settings')}><Text style={styles.headerActionText}>⚙</Text></TouchableOpacity>
      </View>
    </View>

    <View style={styles.quickRow}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Tìm món ăn và ghi nhật ký" style={styles.searchAction} onPress={() => onNavigate('diary')}>
        <Text style={styles.searchGlass}>⌕</Text><Text style={styles.searchPlaceholder}>Tìm kiếm</Text><Text style={styles.searchIcon}>⌕</Text>
      </TouchableOpacity>
    </View>

    <View style={styles.shortcutSection}>
      <View style={styles.shortcutGrid}>
        {shortcuts.map(([icon, label, target]) => <TouchableOpacity
          key={label}
          accessibilityRole="button"
          accessibilityLabel={label}
          style={styles.shortcut}
          onPress={() => onNavigate(target)}
        >
          <Text style={styles.shortcutIcon} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{icon}</Text>
          <Text style={styles.shortcutText}>{label}</Text>
        </TouchableOpacity>)}
      </View>
    </View>

    <View style={styles.calendarHeader}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Tháng đang chọn" style={styles.monthSelect} onPress={() => setMonthPickerVisible(true)}>
        <Text style={styles.monthLabel}>{monthLabel(selectedMonth)}</Text><Text style={styles.monthChevron}>⌄</Text>
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Mở báo cáo tổng quát" style={styles.calendarButton} onPress={() => onNavigate('dashboard')}><Text style={styles.calendarGlyph}>▥</Text></TouchableOpacity>
    </View>
    <ScrollView ref={dateStripRef} horizontal showsHorizontalScrollIndicator={false} accessibilityRole="tablist" accessibilityLabel="Các ngày trong tháng" contentContainerStyle={styles.dateStrip}>
      {dateOptions.map(date => {
        const dateObject = new Date(`${date}T12:00:00`);
        const label = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(dateObject);
        const key = date;
        const selected = selectedDate === date;
        return <TouchableOpacity
          key={key}
          accessibilityRole="tab"
          accessibilityLabel={`${label} ${dateObject.getDate()}`}
          accessibilityHint={date}
          accessibilityState={{ selected }}
          style={[styles.dayCard, selected && styles.dayCardSelected]}
          onPress={() => setSelectedDate(date)}
        ><Text style={[styles.dayName, selected && styles.dayTextSelected]}>{label}</Text><Text style={[styles.dayNumber, selected && styles.dayTextSelected]}>{dateObject.getDate()}</Text></TouchableOpacity>;
      })}
    </ScrollView>

    <View style={styles.timeline}>
      {events.map(({ type, entry, time }, index) => <View key={entry?.id || type} style={styles.timelineRow}>
        <Text style={styles.timeLabel}>{time}</Text>
        <View style={styles.timelineRail}>
          <View style={styles.timelineDot} />
          {index < events.length - 1 && <View style={styles.timelineLine} />}
        </View>
        <TouchableOpacity accessibilityRole="button" style={[styles.mealCard, entry && styles.mealCardLogged]} onPress={() => onNavigate('diary')}>
          <View style={[styles.mealIcon, type === 'BREAKFAST' ? styles.breakfastIcon : type === 'LUNCH' ? styles.lunchIcon : styles.otherMealIcon]}><Text style={styles.mealGlyph}>{type === 'BREAKFAST' ? '♨' : '⚒'}</Text></View>
          <View style={styles.mealCopy}>
            <Text style={styles.mealName}>{entry?.foodName || mealLabels[type]}</Text>
            <Text style={styles.mealDetails}>{entry ? `${formatNumber(entry.nutrients?.energyKcal)} kcal` : (showingToday ? diaryLoading ? 'Đang tải nhật ký…' : 'Chưa ghi món ăn' : selectedDateLoading ? 'Đang tải nhật ký…' : selectedDateError ? 'Không tải được nhật ký' : 'Chưa ghi món ăn')}</Text>
          </View>
        </TouchableOpacity>
      </View>)}
    </View>

    {(showingToday ? diaryError : selectedDateError) ? <View style={styles.errorNotice}>
      <Text accessibilityRole="alert" style={styles.errorText}>{showingToday ? diaryError : `Không tải được nhật ký ngày ${selectedDate}: ${selectedDateError}`}</Text>
      <TouchableOpacity accessibilityRole="button" style={styles.retryButton} onPress={() => showingToday ? onRetryDiary?.() : setRetryVersion(value => value + 1)}><Text style={styles.retryText}>Thử lại</Text></TouchableOpacity>
    </View> : null}
    <Text style={styles.disclaimer}>Giá trị dinh dưỡng là ước tính và không thay thế tư vấn y tế.</Text>

    {plan?.plan?.length ? <TouchableOpacity accessibilityRole="button" style={styles.planBanner} onPress={() => onNavigate('planner')}>
      <View style={styles.planMark}><Text style={styles.planMarkText}>✓</Text></View>
      <View style={styles.planCopy}><Text style={styles.planTitle}>Thực đơn đã sẵn sàng</Text><Text style={styles.planCaption}>{plan.plan.length} bữa trong ngày · Xem chi tiết</Text></View>
      <Text style={styles.planArrow}>›</Text>
    </TouchableOpacity> : null}
    <OptionListModal
      visible={monthPickerVisible}
      title="Chọn tháng"
      options={monthOptions}
      selectedValue={selectedMonth}
      onSelect={selectMonth}
      onClose={() => setMonthPickerVisible(false)}
    />
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, width: '100%', backgroundColor: colors.surface },
  content: { paddingBottom: 94 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 9, paddingBottom: 7, gap: 10 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#D8E2F2', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.primaryDark, fontSize: 12, fontWeight: '900' },
  greeting: { flex: 1 },
  welcome: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  name: { color: colors.text, fontSize: 15, fontWeight: '800', marginTop: 1 },
  headerActions: { flexDirection: 'row', gap: 7 },
  headerAction: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#CED9FF' },
  headerActionText: { color: colors.text, fontSize: 18, fontWeight: '800' },
  quickRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 20, paddingBottom: 7 },
  searchAction: { flex: 1, minWidth: 0, minHeight: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9, borderRadius: 24, backgroundColor: '#CED9FF' },
  searchGlass: { width: 32, height: 32, textAlign: 'center', textAlignVertical: 'center', color: colors.primaryDark, fontSize: 21, backgroundColor: 'white', borderRadius: 16, overflow: 'hidden' },
  searchPlaceholder: { flex: 1, color: '#71809D', fontSize: 14, marginLeft: 7 },
  searchIcon: { color: colors.primary, fontSize: 20, marginHorizontal: 2 },
  shortcutSection: { backgroundColor: '#CED9FF', paddingHorizontal: 10, paddingVertical: 10 },
  shortcutGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  shortcut: { width: '25%', minHeight: 82, alignItems: 'center', justifyContent: 'center', paddingVertical: 4 },
  shortcutIcon: { width: 48, height: 48, textAlign: 'center', textAlignVertical: 'center', color: colors.primary, backgroundColor: colors.surface, borderRadius: 14, overflow: 'hidden', fontSize: 25 },
  shortcutText: { color: colors.text, fontSize: 12, fontWeight: '700', marginTop: 5, textAlign: 'center' },
  calendarHeader: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 13, paddingTop: 3 },
  monthSelect: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 11, borderRadius: 20, borderWidth: 1, borderColor: '#E2E4E9', backgroundColor: 'white' },
  monthLabel: { color: colors.text, fontSize: 12, fontWeight: '700' },
  monthChevron: { color: colors.text, fontSize: 16 },
  calendarButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  calendarGlyph: { color: '#343A46', fontSize: 22 },
  dateStrip: { flexDirection: 'row', gap: 6, paddingHorizontal: 11, paddingBottom: 13 },
  dayCard: { width: 42, minHeight: 54, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: '#E3E6EA', backgroundColor: 'white' },
  dayCardSelected: { backgroundColor: '#D3F3FF', borderColor: '#4BBEFF' },
  dayName: { color: '#616875', fontSize: 12 },
  dayNumber: { color: '#333A46', fontSize: 15, fontWeight: '700', marginTop: 1 },
  dayTextSelected: { color: '#103F76' },
  timeline: { paddingHorizontal: 11, paddingTop: 1 },
  timelineRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center' },
  timeLabel: { width: 62, color: '#323844', fontSize: 12, fontWeight: '500' },
  timelineRail: { width: 18, height: '100%', alignItems: 'center', justifyContent: 'center' },
  timelineDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#CACFD6', zIndex: 1 },
  timelineLine: { position: 'absolute', width: 1, height: '100%', backgroundColor: '#E1E4E9' },
  mealCard: { minHeight: 68, flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 17, borderWidth: 1, borderColor: '#E4E7EB', backgroundColor: 'white', marginLeft: 5, marginBottom: 4 },
  mealCardLogged: { backgroundColor: '#D7F4FF', borderColor: '#4BBEFF' },
  mealIcon: { width: 37, height: 37, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  breakfastIcon: { backgroundColor: '#D8F8F3' },
  lunchIcon: { backgroundColor: '#D7F4FF' },
  otherMealIcon: { backgroundColor: '#EBF0FF' },
  mealGlyph: { color: '#27B9C6', fontSize: 20, fontWeight: '700' },
  mealCopy: { flex: 1, minWidth: 0 },
  mealName: { color: '#252B37', fontSize: 14, fontWeight: '800' },
  mealDetails: { color: '#616875', fontSize: 12, marginTop: 3 },
  errorNotice: { marginHorizontal: 16, marginTop: 6, padding: 10, borderRadius: 10, backgroundColor: '#FFF3E0' },
  errorText: { color: colors.warning, fontSize: 11, lineHeight: 16 },
  retryButton: { minHeight: 40, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: 8 },
  retryText: { color: colors.primary, fontSize: 12, fontWeight: '800' },
  disclaimer: { color: colors.muted, fontSize: 11, lineHeight: 15, textAlign: 'center', paddingHorizontal: 16, marginTop: 7 },
  planBanner: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, margin: 16, padding: 10, backgroundColor: colors.softBlue, borderRadius: radius.md },
  planMark: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  planMarkText: { color: colors.surface, fontWeight: '800' },
  planCopy: { flex: 1 },
  planTitle: { color: colors.text, fontSize: 13, fontWeight: '800' },
  planCaption: { color: colors.muted, fontSize: 12, marginTop: 3 },
  planArrow: { color: colors.primary, fontSize: 23 },
});
