import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radius } from '../../theme/tokens';

const initialItems = [
  { id: 'visit', icon: '▣', title: 'Lịch hẹn đã đặt', body: 'Bạn có thể xem và quản lý các yêu cầu lịch hẹn demo tại đây.', date: 'Hôm nay · 09:30', route: 'appointments', unread: true },
  { id: 'move', icon: '↻', title: 'Thay đổi lịch hẹn', body: 'Thông báo mẫu để minh họa trạng thái cập nhật lịch.', date: 'Hôm nay · 08:15', route: 'appointments', unread: true },
  { id: 'tip', icon: '✦', title: 'Ghi chú bữa ăn', body: 'Ghi món ăn và khẩu phần để theo dõi nhật ký trong ngày.', date: 'Hôm qua', route: 'diary', unread: false },
  { id: 'profile', icon: '♡', title: 'Hoàn thiện hồ sơ demo', body: 'Xem lại dữ liệu tổng hợp và các lựa chọn dinh dưỡng của bạn.', date: 'Tuần trước', route: 'profile', unread: false },
];

export default function NotificationsScreen({ onNavigate }) {
  const [items, setItems] = useState(initialItems);
  const [period, setPeriod] = useState('all');
  const unreadCount = items.filter(item => item.unread).length;
  const visibleItems = useMemo(() => period === 'unread' ? items.filter(item => item.unread) : items, [items, period]);

  function openItem(item) {
    setItems(current => current.map(entry => entry.id === item.id ? { ...entry, unread: false } : entry));
    onNavigate?.(item.route);
  }

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <View style={styles.header}><View><Text accessibilityRole="header" style={styles.title}>Thông báo</Text><Text style={styles.subtitle}>{unreadCount ? `${unreadCount} thông báo chưa đọc` : 'Bạn đã xem hết thông báo'}</Text></View><TouchableOpacity accessibilityRole="button" onPress={() => setItems(current => current.map(item => ({ ...item, unread: false })))} style={{ minWidth: 48, minHeight: 48, justifyContent: "center", alignItems: "center" }}><Text style={styles.markAll}>Đánh dấu đã đọc</Text></TouchableOpacity></View>
    <View accessibilityRole="tablist" style={styles.filters}>{[['all', 'Hôm nay'], ['unread', 'Chưa đọc']].map(([key, label]) => <TouchableOpacity key={key} accessibilityRole="tab" accessibilityState={{ selected: period === key }} style={[styles.filter, period === key && styles.filterActive]} onPress={() => setPeriod(key)}><Text style={[styles.filterText, period === key && styles.filterTextActive]}>{label}</Text></TouchableOpacity>)}</View>
    <Text style={styles.sectionLabel}>GẦN ĐÂY</Text>
    {visibleItems.map(item => <TouchableOpacity key={item.id} accessibilityRole="button" accessibilityLabel={`${item.title}. ${item.unread ? 'Chưa đọc' : 'Đã đọc'}`} style={styles.card} onPress={() => openItem(item)}>
      <View style={[styles.icon, item.unread && styles.iconUnread]}><Text style={styles.iconText}>{item.icon}</Text></View>
      <View style={styles.copy}><View style={styles.cardTitleRow}><Text style={styles.cardTitle}>{item.title}</Text>{item.unread && <View style={styles.unreadDot} />}</View><Text style={styles.body}>{item.body}</Text><Text style={styles.date}>{item.date}</Text></View>
    </TouchableOpacity>)}
    {!visibleItems.length && <View style={styles.empty}><Text style={styles.emptyIcon}>✓</Text><Text style={styles.emptyTitle}>Không còn thông báo chưa đọc</Text><Text style={styles.body}>Các cập nhật mới sẽ xuất hiện tại đây.</Text></View>}
    <Text style={styles.note}>Nội dung minh họa trong bản demo, không phải thông báo giao dịch hoặc lịch khám đã xác nhận.</Text>
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface }, content: { paddingHorizontal: 17, paddingTop: 17, paddingBottom: 112 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, title: { color: colors.primary, fontSize: 23, fontWeight: '800' }, subtitle: { color: colors.muted, fontSize: 12, marginTop: 4 }, markAll: { color: colors.primary, fontSize: 11, fontWeight: '800' },
  filters: { flexDirection: 'row', gap: 8, marginVertical: 18 }, filter: { minHeight: 48, paddingHorizontal: 14, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: '#E6EAFA' }, filterActive: { backgroundColor: colors.primary }, filterText: { color: colors.primaryDark, fontSize: 12, fontWeight: '700' }, filterTextActive: { color: 'white' }, sectionLabel: { color: colors.muted, fontSize: 11, fontWeight: '900', letterSpacing: 1, marginBottom: 8 },
  card: { minHeight: 48, flexDirection: 'row', gap: 11, padding: 12, borderRadius: 15, backgroundColor: '#F8FAFF', marginBottom: 9 }, icon: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#E8EDF9', alignItems: 'center', justifyContent: 'center' }, iconUnread: { backgroundColor: '#DDE8FF' }, iconText: { color: colors.primary, fontSize: 18, fontWeight: '800' }, copy: { flex: 1 }, cardTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, cardTitle: { color: colors.text, fontSize: 13, fontWeight: '800' }, unreadDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary }, body: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 5 }, date: { color: '#8B96A8', fontSize: 10, marginTop: 7 },
  empty: { minHeight: 190, alignItems: 'center', justifyContent: 'center' }, emptyIcon: { color: colors.success, fontSize: 30 }, emptyTitle: { color: colors.text, fontSize: 15, fontWeight: '800', marginTop: 8 }, note: { color: colors.muted, backgroundColor: '#FFF7E6', padding: 10, borderRadius: 10, fontSize: 11, lineHeight: 16, marginTop: 12 },
});
