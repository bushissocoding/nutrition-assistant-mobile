import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api } from '../../services/api';
import { colors, radius, spacing } from '../../theme/tokens';
import { getRecentLocalDays, loadDiaryHistory } from '../diary/diary-history.cjs';

const metrics = [
  { key: 'proteinG', label: 'Protein', unit: 'g', icon: '♧' },
  { key: 'fatG', label: 'Lipid', unit: 'g', icon: '♙' },
  { key: 'fiberG', label: 'Chất xơ', unit: 'g', icon: '⌁' },
  { key: 'carbohydrateG', label: 'Glucid', unit: 'g', icon: '⌘' },
  { key: 'energyKcal', label: 'Năng lượng', unit: 'kcal', icon: 'ϟ' },
];

function rounded(value) {
  return Math.round(Number(value) || 0);
}

export default function DashboardScreen({ diaryTotals = {}, diary = [], diaryError = '', diaryLoading = false, onRetryDiary }) {
  const [metricIndex, setMetricIndex] = useState(0);
  const [history, setHistory] = useState({ byDate: {}, errorsByDate: {} });
  const [historyLoading, setHistoryLoading] = useState(true);
  const [retryVersion, setRetryVersion] = useState(0);
  const activeMetric = metrics[metricIndex];
  const week = useMemo(() => getRecentLocalDays(new Date(), 7), []);
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', []);

  useEffect(() => {
    let active = true;
    const dates = week.slice(0, -1).map(day => day.date);
    setHistoryLoading(true);
    loadDiaryHistory(api, dates, timeZone).then(result => {
      if (active) setHistory(result);
    }).finally(() => {
      if (active) setHistoryLoading(false);
    });
    return () => { active = false; };
  }, [week, timeZone, retryVersion]);

  const chartValues = week.map(day => {
    if (day.current) return diaryLoading || diaryError ? null : Number(diaryTotals[activeMetric.key]) || 0;
    if (history.errorsByDate[day.date]) return null;
    if (history.byDate[day.date]) return Number(history.byDate[day.date].totals[activeMetric.key]) || 0;
    return historyLoading ? null : 0;
  });
  const chartMaximum = Math.max(...chartValues.filter(value => value !== null), activeMetric.key === 'energyKcal' ? 1800 : 100);
  const failedDateCount = Object.keys(history.errorsByDate).length + (diaryError ? 1 : 0);
  const hasEntries = diary.length > 0 || week.slice(0, -1).some(day => (history.byDate[day.date]?.items.length || 0) > 0);

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <View style={styles.header}>
      <Text accessibilityRole="header" style={styles.title}>Chỉ số</Text>
      <View accessibilityLabel="Ngày xem: hôm nay" style={styles.todayButton}>
        <Text style={styles.todayText}>Hôm nay　⌄</Text>
      </View>
    </View>

    <View style={styles.metricGrid}>
      {metrics.map((metric, index) => {
        const value = rounded(diaryTotals[metric.key]);
        return <View key={metric.key} style={[styles.metricCard, index < 3 ? styles.thirdCard : styles.halfCard]}>
          <View style={styles.metricCardHeader}><Text style={styles.metricLabel}>{metric.label}</Text><Text style={styles.metricIcon}>{metric.icon}</Text></View>
          <Text style={styles.metricValue}>{value}<Text style={styles.metricUnit}> {metric.unit}</Text></Text>
        </View>;
      })}
    </View>

    <View style={styles.chartHeading}>
      <Text accessibilityRole="header" style={styles.chartTitle}>Biểu đồ 7 ngày gần nhất</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Chỉ số đang xem: ${activeMetric.label}`} style={styles.metricPicker} onPress={() => setMetricIndex(index => (index + 1) % metrics.length)}>
        <Text style={styles.metricPickerText}>{activeMetric.label}　⌄</Text>
      </TouchableOpacity>
    </View>

    <View style={styles.chartCard}>
      <View style={styles.chartGrid}>
        {[0, 1, 2, 3].map(line => <View key={line} style={styles.chartLine} />)}
        <View style={styles.chartColumns}>
          {week.map((day, index) => {
            const value = chartValues[index];
            const dayFailed = day.current ? Boolean(diaryError) : Boolean(history.errorsByDate[day.date]);
            const height = value !== null && value > 0 ? Math.max(8, value / chartMaximum * 170) : 0;
            const dayDescription = `${activeMetric.label} ${day.date}: ${value === null ? dayFailed ? 'không tải được' : 'đang tải' : `${rounded(value)} ${activeMetric.unit}`}`;
            return <View key={day.key} accessible accessibilityLabel={dayDescription} style={styles.chartColumn}>
              <View style={styles.chartTrack}>
                {value === null && dayFailed ? <Text testID="chart-unavailable" style={styles.chartMissing}>!</Text> : null}
                {!!height && <View testID="chart-bar" style={[styles.chartBar, { height }]} />}
              </View>
              <Text style={[styles.dayLabel, day.current && styles.dayLabelCurrent]}>{day.label} {day.dateObject.getDate()}</Text>
            </View>;
          })}
        </View>
      </View>
      {historyLoading || diaryLoading ? <Text accessibilityLiveRegion="polite" style={styles.chartNotice}>Đang tải nhật ký 7 ngày gần nhất…</Text> : null}
      {!historyLoading && !diaryLoading && failedDateCount > 0 ? <View>
        <Text accessibilityRole="alert" style={styles.chartNotice}>Không tải được dữ liệu của {failedDateCount} ngày. Các ngày đã tải vẫn được giữ lại.</Text>
        <TouchableOpacity accessibilityRole="button" style={styles.retryButton} onPress={() => { setRetryVersion(value => value + 1); if (diaryError) onRetryDiary?.(); }}><Text style={styles.retryText}>Tải lại lịch sử</Text></TouchableOpacity>
      </View> : null}
      {!historyLoading && !diaryLoading && failedDateCount === 0 && !hasEntries ? <Text style={styles.chartNotice}>Chưa có món ăn nào được ghi trong 7 ngày gần nhất.</Text> : null}
    </View>

    <View style={styles.noteCard}>
      <Text style={styles.noteIcon}>ⓘ</Text>
      <Text style={styles.noteText}>Giá trị là ước tính từ thực phẩm đã ghi trong nhật ký và tổng theo ngày từ API demo. Biểu đồ không thay thế hồ sơ theo dõi sức khỏe hoặc tư vấn chuyên môn.</Text>
    </View>
    <View style={styles.loggedSummary}>
      <Text style={styles.loggedTitle}>Nhật ký hôm nay</Text>
      <Text style={styles.loggedValue}>{diary.length} món đã ghi</Text>
    </View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: 112 },
  header: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 },
  title: { color: colors.text, fontSize: 24, fontWeight: '800' },
  todayButton: { minHeight: 54, minWidth: 90, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill },
  todayText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 },
  metricCard: { borderWidth: 1, borderColor: '#E6E8ED', borderRadius: 22, backgroundColor: 'white', padding: 15, minHeight: 91 },
  thirdCard: { width: '31%' },
  halfCard: { width: '48%' },
  metricCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  metricLabel: { color: colors.text, fontSize: 13, fontWeight: '600' },
  metricIcon: { color: colors.text, fontSize: 18 },
  metricValue: { color: colors.text, fontSize: 28, fontWeight: '600', marginTop: 8 },
  metricUnit: { color: colors.text, fontSize: 12, fontWeight: '700' },
  chartHeading: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 17, gap: 8 },
  chartTitle: { color: colors.text, fontSize: 16, fontWeight: '800', flex: 1 },
  metricPicker: { minHeight: 54, minWidth: 92, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill },
  metricPickerText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  chartCard: { backgroundColor: 'white', borderRadius: 18, padding: 14, borderWidth: 1, borderColor: '#EDF0F5' },
  chartGrid: { height: 210, justifyContent: 'space-between', paddingTop: 6 },
  chartLine: { height: 1, backgroundColor: '#EEF0F4' },
  chartColumns: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, flexDirection: 'row', justifyContent: 'space-around' },
  chartColumn: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  chartTrack: { height: 177, width: 28, justifyContent: 'flex-end', alignItems: 'center' },
  chartBar: { width: 28, borderRadius: 9, backgroundColor: '#56C1F5' },
  chartMissing: { color: colors.warning, fontSize: 18, fontWeight: '900' },
  dayLabel: { color: colors.muted, fontSize: 13, marginTop: 7, textTransform: 'capitalize' },
  dayLabelCurrent: { color: colors.primaryDark, fontWeight: '800' },
  chartNotice: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 12 },
  retryButton: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: 8 },
  retryText: { color: colors.primary, fontSize: 13, fontWeight: '800' },
  noteCard: { flexDirection: 'row', gap: 9, padding: 13, marginTop: spacing.md, backgroundColor: '#F5F8FF', borderRadius: radius.sm },
  noteIcon: { color: colors.primary, fontSize: 18, fontWeight: '800' },
  noteText: { flex: 1, color: colors.muted, fontSize: 13, lineHeight: 19 },
  loggedSummary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.md, borderTopWidth: 1, borderColor: colors.border, marginTop: spacing.md },
  loggedTitle: { color: colors.text, fontWeight: '800', fontSize: 15 },
  loggedValue: { color: colors.primary, fontWeight: '700', fontSize: 14 },
});
