import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radius } from '../../theme/tokens';

const shortcuts = [
  ['＋', 'Đặt khám', 'appointments'], ['▣', 'Lịch hẹn', 'appointments'], ['▤', 'Hồ sơ y tế', 'profile'], ['♨', 'Thực đơn', 'planner'],
  ['≡', 'Nhật ký', 'diary'], ['🛒', 'Đi chợ', 'grocery'], ['♡', 'Cá nhân hóa', 'profile'], ['▥', 'Báo cáo', 'dashboard'],
];

const mealLabels = { BREAKFAST: 'Sáng', LUNCH: 'Trưa', DINNER: 'Tối', SNACK: 'Phụ' };

export default function HomeScreen({ onNavigate, diary = [], diaryTotals = {}, diaryError = '', diaryLoading = false, onRetryDiary, plan }) {
  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <View style={styles.header}><View style={styles.avatar}><Text style={styles.avatarText}>🙂</Text></View><View style={{ flex: 1 }}><Text style={styles.welcome}>CHÀO MỪNG BẠN</Text><Text style={styles.name}>Clinical Nutrition Advisor</Text></View><Text style={styles.headerIcon}>♧</Text><Text style={styles.headerIcon}>⚙</Text></View>
    <View style={styles.search}><Text style={styles.muted}>⌕  Tìm món ăn, tính năng...</Text></View>
    <View style={styles.grid}>{shortcuts.map(([icon, label, target]) => <TouchableOpacity key={label} style={styles.shortcut} onPress={() => onNavigate(target)}><Text style={styles.icon}>{icon}</Text><Text style={styles.shortcutText}>{label}</Text></TouchableOpacity>)}</View>
    <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Hôm nay</Text><Text style={styles.link} onPress={() => onNavigate('dashboard')}>Xem báo cáo</Text></View>
    <View style={styles.card}><Text style={styles.cardTitle}>Chỉ số dinh dưỡng</Text><Text style={styles.muted}>{diaryLoading ? 'Đang tải nhật ký hôm nay…' : diaryError ? 'Chưa tải được nhật ký hôm nay.' : diary.length ? `Đã ghi nhận ${diary.length} món hôm nay` : 'Ghi nhật ký bữa ăn để bắt đầu theo dõi'}</Text>
      {!!diaryError && <TouchableOpacity onPress={onRetryDiary}><Text style={styles.link}>Thử tải lại</Text></TouchableOpacity>}
      <View style={styles.metric}><Text style={styles.muted}>Năng lượng · {diaryTotals.energyKcal || 0} kcal</Text><View style={styles.track}><View style={[styles.fill, { width: `${Math.min(100, Math.max(0, Number(diaryTotals.energyKcal || 0) / 1800 * 100))}%` }]} /></View></View>
      <Text style={styles.estimate}>Dinh dưỡng là ước tính từ danh mục demo, không phải tư vấn y tế.</Text>
    </View>
    <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Bữa ăn hôm nay</Text><Text style={styles.link} onPress={() => onNavigate('diary')}>+ Ghi món</Text></View>
    {diary.length ? diary.slice(0, 4).map(item => <TouchableOpacity key={item.id} style={styles.meal} onPress={() => onNavigate('diary')}><Text style={styles.time}>{mealLabels[item.mealType] || 'Hôm nay'}</Text><View style={{ flex: 1 }}><Text style={styles.cardTitle}>{item.foodName}</Text><Text style={styles.muted}>{item.portion?.amount} g · {item.nutrients?.energyKcal || 0} kcal</Text></View><Text style={{ color: colors.primary }}>›</Text></TouchableOpacity>) : <View style={styles.meal}><Text style={styles.muted}>Chưa có nhật ký thực tế. Hãy thêm món trong mục Nhật ký.</Text></View>}
    {plan && <TouchableOpacity style={styles.banner} onPress={() => onNavigate('planner')}><Text style={styles.cardTitle}>Thực đơn gợi ý đã sẵn sàng</Text><Text style={styles.muted}>{plan.plan.length} bữa · khoảng {Number(plan.estimatedCostVnd || 0).toLocaleString('vi-VN')}đ</Text></TouchableOpacity>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'white' }, content: { paddingBottom: 105 }, header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, gap: 10 }, avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#DDE8FF', alignItems: 'center', justifyContent: 'center' }, avatarText: { fontSize: 24 }, welcome: { color: colors.primary, fontSize: 11, fontWeight: '700' }, name: { color: colors.text, fontSize: 14, fontWeight: '700', marginTop: 3 }, headerIcon: { color: colors.primary, fontSize: 19, backgroundColor: colors.softBlue, padding: 9, borderRadius: 22 }, search: { margin: 16, height: 42, borderRadius: 22, justifyContent: 'center', paddingHorizontal: 14, backgroundColor: '#D5DFFF' }, muted: { color: colors.muted, fontSize: 12, lineHeight: 18 }, grid: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: '#CDD8FF', paddingHorizontal: 12, paddingVertical: 12 }, shortcut: { width: '25%', alignItems: 'center', paddingVertical: 9 }, icon: { width: 46, height: 46, textAlign: 'center', textAlignVertical: 'center', color: colors.primary, backgroundColor: '#F8FAFF', borderRadius: 13, overflow: 'hidden', fontSize: 22 }, shortcutText: { fontSize: 10, color: colors.text, fontWeight: '600', marginTop: 5 }, sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: 18, marginTop: 17, marginBottom: 8 }, sectionTitle: { color: colors.text, fontWeight: '800', fontSize: 17 }, link: { color: colors.primary, fontWeight: '700', fontSize: 12 }, card: { backgroundColor: 'white', marginHorizontal: 14, padding: 15, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }, cardTitle: { color: colors.text, fontWeight: '800', fontSize: 14 }, metric: { marginTop: 10 }, estimate: { color: colors.muted, fontSize: 10, marginTop: 8 }, track: { height: 8, backgroundColor: '#E4E8F0', borderRadius: 8, marginTop: 6 }, fill: { height: 8, backgroundColor: colors.primary, borderRadius: 8 }, meal: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FAFBFE', marginHorizontal: 14, marginVertical: 4, padding: 12, borderRadius: 14 }, time: { color: colors.primary, fontSize: 11, fontWeight: '700', width: 54 }, banner: { margin: 14, padding: 14, borderRadius: 14, backgroundColor: colors.softBlue },
});
