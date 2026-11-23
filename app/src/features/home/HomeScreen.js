import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radius, spacing } from '../../theme/tokens';

const shortcuts = [
  ['＋', 'Đặt khám', 'appointments'],
  ['▣', 'Lịch hẹn', 'appointments-list'],
  ['▤', 'Hồ sơ y tế', 'medical-record'],
  ['♨', 'Thực đơn', 'planner'],
  ['≡', 'Nhật ký', 'diary'],
  ['◉', 'Đi chợ', 'grocery'],
  ['♡', 'Cá nhân hóa', 'personalization'],
  ['♧', 'Thông báo', 'notifications'],
];

const mealLabels = { BREAKFAST: 'Bữa sáng', LUNCH: 'Bữa trưa', DINNER: 'Bữa tối', SNACK: 'Bữa phụ' };
const energyGoal = 1800;

function formatNumber(value) {
  return Math.round(Number(value) || 0).toLocaleString('vi-VN');
}

export default function HomeScreen({ onNavigate, diary = [], diaryTotals = {}, diaryError = '', diaryLoading = false, onRetryDiary, plan }) {
  const energy = Number(diaryTotals.energyKcal) || 0;
  const progress = Math.min(100, Math.max(0, energy / energyGoal * 100));

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <View style={styles.header}>
      <View style={styles.avatar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Text style={styles.avatarText}>♡</Text></View>
      <View style={styles.greeting}>
        <Text style={styles.welcome}>CHÀO MỪNG BẠN</Text>
        <Text style={styles.name}>Hồ sơ tham khảo</Text>
      </View>
      <View style={styles.headerActions}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Thông báo" style={styles.headerAction} onPress={() => onNavigate('notifications')}><Text style={styles.headerActionText}>♧</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Cài đặt" style={styles.headerAction} onPress={() => onNavigate('settings')}><Text style={styles.headerActionText}>⚙</Text></TouchableOpacity>
      </View>
    </View>

    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Ghi món ăn vào nhật ký" style={styles.searchAction} onPress={() => onNavigate('diary')}>
      <Text style={styles.searchIcon}>⌕</Text>
      <Text style={styles.searchText}>Ghi món ăn hôm nay</Text>
      <Text style={styles.searchArrow}>›</Text>
    </TouchableOpacity>

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

    <View style={styles.sectionHeading}>
      <View>
        <Text accessibilityRole="header" style={styles.sectionTitle}>Hôm nay</Text>
        <Text style={styles.sectionCaption}>Tóm tắt từ nhật ký bữa ăn</Text>
      </View>
      <TouchableOpacity accessibilityRole="button" onPress={() => onNavigate('dashboard')} style={{ minWidth: 48, minHeight: 48, justifyContent: "center", alignItems: "center" }}>
        <Text style={styles.link}>Báo cáo ›</Text>
      </TouchableOpacity>
    </View>

    <View style={styles.summaryCard}>
      <View style={styles.summaryTop}>
        <View>
          <Text style={styles.summaryLabel}>Năng lượng đã ghi</Text>
          <Text style={styles.energyValue}>{formatNumber(energy)} <Text style={styles.energyUnit}>kcal</Text></Text>
        </View>
        <View style={styles.energyBadge}><Text style={styles.energyBadgeText}>⚡</Text></View>
      </View>
      <View style={styles.progressTrack} accessibilityRole="progressbar" accessibilityLabel="Tiến độ năng lượng so với mục tiêu minh họa" accessibilityValue={{ min: 0, max: 100, now: Math.round(progress) }}>
        <View style={[styles.progressFill, { width: `${progress}%` }]} />
      </View>
      <View style={styles.goalRow}>
        <Text style={styles.summaryCaption}>{diaryLoading ? 'Đang đồng bộ nhật ký…' : `Mục tiêu minh họa: ${formatNumber(energyGoal)} kcal`}</Text>
        {!!diaryError && <TouchableOpacity accessibilityRole="button" onPress={onRetryDiary} style={{ minWidth: 48, minHeight: 48, justifyContent: "center", alignItems: "center" }}><Text style={styles.link}>Tải lại</Text></TouchableOpacity>}
      </View>
      <Text style={styles.disclaimer}>Giá trị ước tính từ danh mục demo, không phải tư vấn y tế.</Text>
    </View>

    <View style={styles.sectionHeading}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>Bữa ăn hôm nay</Text>
      <TouchableOpacity accessibilityRole="button" onPress={() => onNavigate('diary')} style={{ minWidth: 48, minHeight: 48, justifyContent: "center", alignItems: "center" }}>
        <Text style={styles.link}>+ Ghi món</Text>
      </TouchableOpacity>
    </View>
    {diary.length ? diary.slice(0, 4).map(item => <TouchableOpacity
      key={item.id}
      accessibilityRole="button"
      accessibilityLabel={`${item.foodName}, ${mealLabels[item.mealType] || 'Bữa ăn'}, ${item.portion?.amount} g, ${formatNumber(item.nutrients?.energyKcal)} kcal`}
      style={styles.mealRow}
      onPress={() => onNavigate('diary')}
    >
      <View style={styles.mealIcon}><Text style={styles.mealIconText}>◷</Text></View>
      <View style={styles.mealCopy}>
        <Text style={styles.mealTitle}>{item.foodName}</Text>
        <Text style={styles.mealCaption}>{mealLabels[item.mealType] || 'Bữa ăn'} · {item.portion?.amount} g</Text>
      </View>
      <Text style={styles.mealCalories}>{formatNumber(item.nutrients?.energyKcal)} kcal</Text>
    </TouchableOpacity>) : <View style={styles.emptyCard}>
      <View style={styles.emptyIcon}><Text style={styles.emptyIconText}>＋</Text></View>
      <View style={styles.emptyCopy}>
        <Text style={styles.emptyTitle}>{diaryLoading ? 'Đang tải nhật ký' : diaryError ? 'Chưa tải được dữ liệu' : 'Chưa có bữa ăn nào'}</Text>
        <Text style={styles.emptyText}>{diaryError || 'Ghi lại món ăn để xem tóm tắt dinh dưỡng trong ngày.'}</Text>
      </View>
      {diaryError ? <TouchableOpacity accessibilityRole="button" onPress={onRetryDiary} style={{ minWidth: 48, minHeight: 48, justifyContent: "center", alignItems: "center" }}><Text style={styles.link}>Thử lại</Text></TouchableOpacity> : null}
    </View>}

    {plan?.plan?.length ? <TouchableOpacity accessibilityRole="button" style={styles.planBanner} onPress={() => onNavigate('planner')}>
      <View style={styles.planMark}><Text style={styles.planMarkText}>✓</Text></View>
      <View style={styles.planCopy}>
        <Text style={styles.planTitle}>Thực đơn demo đã sẵn sàng</Text>
        <Text style={styles.planCaption}>{plan.plan.length} bữa trong ngày · Xem chi tiết</Text>
      </View>
      <Text style={styles.planArrow}>›</Text>
    </TouchableOpacity> : null}
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { paddingBottom: 112 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md, gap: spacing.md },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.softBlue, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.primary, fontSize: 27, fontWeight: '700' },
  greeting: { flex: 1 },
  welcome: { color: colors.primary, fontSize: 12, fontWeight: '800', letterSpacing: 0.6 },
  name: { color: colors.text, fontSize: 17, fontWeight: '800', marginTop: 3 },
  headerActions: { flexDirection: 'row', gap: 7 },
  headerAction: { width: 48, height: 48, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.softBlue },
  headerActionText: { color: colors.primary, fontSize: 17, fontWeight: '800' },
  searchAction: { minHeight: 48, flexDirection: 'row', alignItems: 'center', marginHorizontal: spacing.lg, marginVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.softBlue },
  searchIcon: { color: colors.primary, fontSize: 24, marginRight: 8 },
  searchText: { flex: 1, color: colors.primaryDark, fontSize: 14, fontWeight: '700' },
  searchArrow: { color: colors.primary, fontSize: 25 },
  shortcutSection: { backgroundColor: '#CED9FF', paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  shortcutGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  shortcut: { width: '25%', minHeight: 74, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.sm },
  shortcutIcon: { width: 44, height: 44, textAlign: 'center', textAlignVertical: 'center', color: colors.primary, backgroundColor: colors.surface, borderRadius: 13, overflow: 'hidden', fontSize: 23 },
  shortcutText: { color: colors.text, fontSize: 12, fontWeight: '700', marginTop: 5, textAlign: 'center' },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: spacing.lg, marginTop: spacing.lg, marginBottom: spacing.sm },
  sectionTitle: { color: colors.text, fontWeight: '800', fontSize: 19 },
  sectionCaption: { color: colors.muted, fontSize: 12, marginTop: 3 },
  link: { color: colors.primary, fontWeight: '800', fontSize: 13 },
  summaryCard: { backgroundColor: colors.surface, marginHorizontal: spacing.lg, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  summaryTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryLabel: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  energyValue: { color: colors.text, fontSize: 29, fontWeight: '800', marginTop: 3 },
  energyUnit: { color: colors.muted, fontSize: 14, fontWeight: '700' },
  energyBadge: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.softBlue, alignItems: 'center', justifyContent: 'center' },
  energyBadgeText: { color: colors.primary, fontSize: 22 },
  progressTrack: { height: 8, borderRadius: 8, backgroundColor: '#E4EAF7', overflow: 'hidden', marginTop: spacing.md },
  progressFill: { height: '100%', borderRadius: 8, backgroundColor: colors.primary },
  goalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  summaryCaption: { color: colors.muted, fontSize: 12 },
  disclaimer: { color: colors.muted, fontSize: 11, marginTop: 9, lineHeight: 16 },
  mealRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginHorizontal: spacing.lg, marginBottom: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  mealIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.softBlue, alignItems: 'center', justifyContent: 'center' },
  mealIconText: { color: colors.primary, fontSize: 21 },
  mealCopy: { flex: 1 },
  mealTitle: { color: colors.text, fontWeight: '800', fontSize: 14 },
  mealCaption: { color: colors.muted, fontSize: 12, marginTop: 4 },
  mealCalories: { color: colors.primary, fontSize: 12, fontWeight: '800' },
  emptyCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginHorizontal: spacing.lg, padding: spacing.md, backgroundColor: '#F8FAFE', borderRadius: radius.md },
  emptyIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.softBlue, alignItems: 'center', justifyContent: 'center' },
  emptyIconText: { color: colors.primary, fontSize: 22 },
  emptyCopy: { flex: 1 },
  emptyTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  emptyText: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  planBanner: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.md, margin: spacing.lg, padding: spacing.md, backgroundColor: colors.softBlue, borderRadius: radius.md },
  planMark: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  planMarkText: { color: colors.surface, fontWeight: '800' },
  planCopy: { flex: 1 },
  planTitle: { color: colors.text, fontSize: 13, fontWeight: '800' },
  planCaption: { color: colors.muted, fontSize: 12, marginTop: 3 },
  planArrow: { color: colors.primary, fontSize: 23 },
});
