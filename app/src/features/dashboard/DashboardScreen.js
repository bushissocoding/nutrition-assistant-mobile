import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radius, spacing } from '../../theme/tokens';

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

function recentDays() {
  const today = new Date();
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - index));
    return {
      key: `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`,
      label: new Intl.DateTimeFormat('vi-VN', { weekday: 'short' }).format(date).replace('.', ''),
      current: index === 6,
    };
  });
}

export default function DashboardScreen({ diaryTotals = {}, diary = [] }) {
  const [metricIndex, setMetricIndex] = useState(0);
  const activeMetric = metrics[metricIndex];
  const chartMaximum = Math.max(Number(diaryTotals[activeMetric.key]) || 0, activeMetric.key === 'energyKcal' ? 1800 : 100);
  const todayValue = Number(diaryTotals[activeMetric.key]) || 0;
  const week = recentDays();

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
          {week.map(day => {
            const height = day.current && todayValue > 0 ? Math.max(8, todayValue / chartMaximum * 170) : 0;
            return <View key={day.key} style={styles.chartColumn}>
              <View style={styles.chartTrack}>
                {!!height && <View accessibilityLabel={`${activeMetric.label} hôm nay ${rounded(todayValue)} ${activeMetric.unit}`} style={[styles.chartBar, { height }]} />}
              </View>
              <Text style={[styles.dayLabel, day.current && styles.dayLabelCurrent]}>{day.label}</Text>
            </View>;
          })}
        </View>
      </View>
      <Text style={styles.chartNotice}>Chỉ có số liệu hôm nay từ nhật ký hiện tại. Lịch sử các ngày trước chưa được tải.</Text>
    </View>

    <View style={styles.noteCard}>
      <Text style={styles.noteIcon}>ⓘ</Text>
      <Text style={styles.noteText}>Giá trị là ước tính từ thực phẩm đã ghi trong nhật ký. Biểu đồ chưa thay thế hồ sơ theo dõi sức khỏe hoặc tư vấn chuyên môn.</Text>
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
  dayLabel: { color: colors.muted, fontSize: 13, marginTop: 7, textTransform: 'capitalize' },
  dayLabelCurrent: { color: colors.primaryDark, fontWeight: '800' },
  chartNotice: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 12 },
  noteCard: { flexDirection: 'row', gap: 9, padding: 13, marginTop: spacing.md, backgroundColor: '#F5F8FF', borderRadius: radius.sm },
  noteIcon: { color: colors.primary, fontSize: 18, fontWeight: '800' },
  noteText: { flex: 1, color: colors.muted, fontSize: 13, lineHeight: 19 },
  loggedSummary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.md, borderTopWidth: 1, borderColor: colors.border, marginTop: spacing.md },
  loggedTitle: { color: colors.text, fontWeight: '800', fontSize: 15 },
  loggedValue: { color: colors.primary, fontWeight: '700', fontSize: 14 },
});
