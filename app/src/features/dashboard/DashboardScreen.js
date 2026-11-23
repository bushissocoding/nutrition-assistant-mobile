import { ScrollView, StyleSheet, Text, View } from 'react-native';
import ProgressBar from '../../shared/components/ProgressBar';
import { colors, radius, spacing } from '../../theme/tokens';

const energyGoal = 1800;
const nutrientGoals = [
  { key: 'proteinG', label: 'Đạm', unit: 'g', goal: 90, icon: '◉', color: '#50BDF3' },
  { key: 'fatG', label: 'Chất béo', unit: 'g', goal: 65, icon: '◌', color: '#F5A623' },
  { key: 'fiberG', label: 'Chất xơ', unit: 'g', goal: 25, icon: '✳', color: '#26B98B' },
  { key: 'carbohydrateG', label: 'Tinh bột', unit: 'g', goal: 220, icon: '⌘', color: '#32B6CC' },
  { key: 'sodiumMg', label: 'Natri', unit: 'mg', goal: 2000, icon: '◍', color: '#8C9BE8' },
];

function rounded(value) {
  return Math.round(Number(value) || 0);
}

export default function DashboardScreen({ diary = [], diaryTotals = { energyKcal: 0, proteinG: 0, carbohydrateG: 0, fatG: 0, fiberG: 0, sodiumMg: 0 }, plan }) {
  const totals = diaryTotals;
  const progress = Math.min(100, Math.max(0, Number(totals.energyKcal || 0) / energyGoal * 100));

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <View style={styles.header}>
      <View>
        <Text accessibilityRole="header" style={styles.title}>Chỉ số hôm nay</Text>
        <Text style={styles.subtitle}>{new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</Text>
      </View>
      <View style={styles.todayBadge}><Text style={styles.todayText}>Hôm nay</Text></View>
    </View>

    <View style={styles.energyCard}>
      <View style={styles.energyHeader}>
        <View>
          <Text style={styles.energyLabel}>Năng lượng đã ghi</Text>
          <Text style={styles.energyValue}>{rounded(totals.energyKcal).toLocaleString('vi-VN')} <Text style={styles.energyUnit}>kcal</Text></Text>
        </View>
        <View style={styles.energyIcon}><Text style={styles.energyGlyph}>⚡</Text></View>
      </View>
      <ProgressBar value={progress} label={`Năng lượng: ${rounded(totals.energyKcal)} trên mục tiêu minh họa ${energyGoal} kcal`} color={colors.primary} />
      <View style={styles.energyFooter}><Text style={styles.caption}>Mục tiêu minh họa: {energyGoal.toLocaleString('vi-VN')} kcal</Text><Text style={styles.caption}>{rounded(progress)}%</Text></View>
    </View>

    <View style={styles.sectionHeading}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>Dinh dưỡng</Text>
      <Text style={styles.sectionMeta}>Ước tính</Text>
    </View>
    <View style={styles.nutrientGrid}>
      {nutrientGoals.map(item => {
        const value = Number(totals[item.key]) || 0;
        const percent = Math.min(100, Math.max(0, value / item.goal * 100));
        return <View key={item.key} style={styles.nutrientCard}>
          <View style={styles.nutrientTop}>
            <View style={[styles.nutrientIcon, { backgroundColor: `${item.color}1A` }]}><Text style={[styles.nutrientGlyph, { color: item.color }]}>{item.icon}</Text></View>
            <Text style={styles.nutrientLabel}>{item.label}</Text>
          </View>
          <Text style={styles.nutrientValue}>{rounded(value)} <Text style={styles.nutrientUnit}>{item.unit}</Text></Text>
          <ProgressBar value={percent} label={`${item.label}: ${rounded(value)} trên mục tiêu minh họa ${item.goal} ${item.unit}`} color={item.color} />
          <Text style={styles.nutrientGoal}>Mục tiêu minh họa {item.goal} {item.unit}</Text>
        </View>;
      })}
    </View>

    <View style={styles.noteCard}>
      <Text style={styles.noteIcon}>ⓘ</Text>
      <Text style={styles.noteText}>Giá trị được tính từ danh mục demo và nhật ký hiện có. Các mốc tham khảo không phải chỉ định dinh dưỡng cá nhân hay tư vấn y tế.</Text>
    </View>

    <View style={styles.sectionHeading}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>Thực đơn gợi ý</Text>
      <Text style={styles.sectionMeta}>{plan?.plan?.length ? `${plan.plan.length} bữa` : 'Bản demo'}</Text>
    </View>
    {plan?.plan?.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mealRow}>
      {plan.plan.map((meal, index) => <View key={`${meal.slot}-${index}`} style={styles.mealCard}>
        <View style={styles.mealImage}><Text style={styles.mealGlyph}>{['◒', '◉', '◍', '◌'][index] || '◉'}</Text></View>
        <Text style={styles.mealTitle}>{meal.slot}</Text>
        <Text style={styles.mealName} numberOfLines={2}>{meal.name}</Text>
        <View style={styles.mealDivider} />
        <Text style={styles.mealCalories}>{rounded(meal.nutrients?.energyKcal)} kcal</Text>
        <Text style={styles.caption}>{Number.isSafeInteger(meal.estimatedCostVnd) ? `${meal.estimatedCostVnd.toLocaleString('vi-VN')}đ · ước tính` : 'Chưa có giá có nguồn'}</Text>
      </View>)}
    </ScrollView> : <View style={styles.emptyCard}>
      <View style={styles.emptyIcon}><Text style={styles.emptyGlyph}>＋</Text></View>
      <View style={styles.emptyCopy}>
        <Text style={styles.emptyTitle}>Chưa có thực đơn gợi ý</Text>
        <Text style={styles.caption}>Tạo một thực đơn demo để xem lịch bữa ăn tại đây.</Text>
      </View>
    </View>}

    <View style={styles.loggedSummary}>
      <Text style={styles.loggedTitle}>Nhật ký hôm nay</Text>
      <Text style={styles.loggedValue}>{diary.length} món đã ghi</Text>
    </View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: 112 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg },
  title: { color: colors.text, fontSize: 24, fontWeight: '800' },
  subtitle: { color: colors.muted, fontSize: 13, marginTop: 4, textTransform: 'capitalize' },
  todayBadge: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill },
  todayText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  energyCard: { padding: spacing.lg, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  energyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  energyLabel: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  energyValue: { color: colors.text, fontSize: 27, fontWeight: '800', marginTop: 4 },
  energyUnit: { color: colors.muted, fontSize: 14, fontWeight: '700' },
  energyIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.softBlue, alignItems: 'center', justifyContent: 'center' },
  energyGlyph: { color: colors.primary, fontSize: 22 },
  energyFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  caption: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.lg, marginBottom: spacing.sm },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  sectionMeta: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  nutrientGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.sm },
  nutrientCard: { width: '48%', minHeight: 116, padding: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  nutrientTop: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  nutrientIcon: { width: 26, height: 26, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  nutrientGlyph: { fontSize: 16, fontWeight: '800' },
  nutrientLabel: { color: colors.text, fontSize: 12, fontWeight: '700' },
  nutrientValue: { color: colors.text, fontSize: 22, fontWeight: '800', marginTop: 5 },
  nutrientUnit: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  nutrientGoal: { color: colors.muted, fontSize: 10, marginTop: 5 },
  noteCard: { flexDirection: 'row', gap: 9, padding: spacing.md, marginTop: spacing.md, backgroundColor: '#F5F8FF', borderRadius: radius.sm },
  noteIcon: { color: colors.primary, fontSize: 17, fontWeight: '800' },
  noteText: { flex: 1, color: colors.muted, fontSize: 12, lineHeight: 17 },
  mealRow: { gap: spacing.md, paddingVertical: 4, paddingBottom: spacing.md },
  mealCard: { width: 156, alignItems: 'center', padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  mealImage: { width: 70, height: 70, borderRadius: 35, backgroundColor: colors.softBlue, alignItems: 'center', justifyContent: 'center' },
  mealGlyph: { color: colors.primary, fontSize: 33 },
  mealTitle: { color: colors.text, fontSize: 14, fontWeight: '800', marginTop: 9 },
  mealName: { color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: 4, minHeight: 28 },
  mealDivider: { height: 1, width: '100%', backgroundColor: colors.border, marginVertical: 7 },
  mealCalories: { color: colors.primary, fontSize: 13, fontWeight: '800' },
  emptyCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, backgroundColor: '#F8FAFE', borderRadius: radius.md },
  emptyIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.softBlue, alignItems: 'center', justifyContent: 'center' },
  emptyGlyph: { color: colors.primary, fontSize: 21 },
  emptyCopy: { flex: 1 },
  emptyTitle: { color: colors.text, fontSize: 14, fontWeight: '800', marginBottom: 3 },
  loggedSummary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.md, borderTopWidth: 1, borderColor: colors.border, marginTop: spacing.md },
  loggedTitle: { color: colors.text, fontWeight: '800', fontSize: 14 },
  loggedValue: { color: colors.primary, fontWeight: '700', fontSize: 13 },
});
