import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../../theme/tokens';

export const initialNotificationItems = [
  { id: 'visit', group: 'today', icon: '▣', title: 'Lịch hẹn đã đặt', body: 'Yêu cầu lịch hẹn demo đang chờ xác nhận trong ứng dụng.', date: '2 Phút', route: 'appointments-list', unread: true },
  { id: 'move', group: 'today', icon: '▣', title: 'Thay đổi lịch hẹn', body: 'Thông báo mẫu để minh họa trạng thái cập nhật lịch.', date: '2 Giờ', route: 'appointments-list', unread: true },
  { id: 'tip', group: 'yesterday', icon: '▤', title: 'Ghi chú bữa ăn', body: 'Ghi món ăn và khẩu phần để xem số liệu ước tính trong ngày.', date: '1 Ngày', route: 'diary', unread: false },
  { id: 'profile', group: 'week', icon: '◌', title: 'Cập nhật hồ sơ', body: 'Mở hồ sơ demo để xem lại các lựa chọn đã lưu trên thiết bị.', date: '5 Ngày', route: 'profile', unread: false },
];

const groups = [['today', 'Hôm nay'], ['yesterday', 'Hôm qua'], ['week', 'Tuần trước']];

export default function NotificationsScreen({ onNavigate, items: controlledItems, onItemsChange, persistenceError = '', onRetryPersistence }) {
  const [localItems, setLocalItems] = useState(initialNotificationItems);
  const items = controlledItems ?? localItems;
  const [period, setPeriod] = useState('all');
  const visibleItems = useMemo(() => period === 'unread' ? items.filter(item => item.unread) : items, [items, period]);

  function updateItems(updater) {
    if (controlledItems !== undefined) {
      onItemsChange?.(updater);
      return;
    }
    setLocalItems(updater);
  }

  function openItem(item) {
    updateItems(current => current.map(entry => entry.id === item.id ? { ...entry, unread: false } : entry));
    onNavigate?.(item.route);
  }

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <View style={styles.header}>
      <Text accessibilityRole="header" style={styles.title}>Thông báo</Text>
      <TouchableOpacity accessibilityRole="checkbox" accessibilityLabel="Chỉ xem tin mới" accessibilityState={{ checked: period === 'unread' }} style={[styles.newBadge, period === 'unread' && styles.newBadgeActive]} onPress={() => setPeriod(value => value === 'unread' ? 'all' : 'unread')}>
        <Text style={[styles.newBadgeText, period === 'unread' && styles.newBadgeTextActive]}>Tin mới</Text><View style={[styles.badgeDot, period === 'unread' && styles.badgeDotActive]} />
      </TouchableOpacity>
    </View>
    <View style={styles.actionsRow}><Text style={styles.sectionLabel}>Cập nhật gần đây</Text><TouchableOpacity accessibilityRole="button" style={styles.markButton} onPress={() => updateItems(current => current.map(item => ({ ...item, unread: false })))}><Text style={styles.markAll}>Đánh dấu đã đọc</Text></TouchableOpacity></View>
    {groups.map(([key, title]) => {
      const groupItems = visibleItems.filter(item => item.group === key);
      if (!groupItems.length) return null;
      return <View key={key}>
        <Text style={styles.groupTitle}>{title}</Text>
        {groupItems.map(item => <TouchableOpacity key={item.id} accessibilityRole="button" accessibilityLabel={`${item.title}. ${item.unread ? 'Chưa đọc' : 'Đã đọc'}`} style={[styles.card, item.unread && styles.cardUnread]} onPress={() => openItem(item)}>
          <View style={[styles.icon, item.unread && styles.iconUnread]}><Text style={[styles.iconText, item.unread && styles.iconTextUnread]}>{item.icon}</Text></View>
          <View style={styles.copy}><View style={styles.cardTitleRow}><Text style={styles.cardTitle}>{item.title}</Text><Text style={styles.date}>{item.date}</Text></View><Text style={styles.body}>{item.body}</Text></View>
        </TouchableOpacity>)}
      </View>;
    })}
    {!visibleItems.length && <View style={styles.empty}><Text style={styles.emptyIcon}>✓</Text><Text style={styles.emptyTitle}>Không còn thông báo chưa đọc</Text><Text style={styles.body}>Các cập nhật mới sẽ xuất hiện tại đây.</Text></View>}
    {!!persistenceError && <View style={styles.persistenceError}><Text accessibilityRole="alert" style={styles.persistenceErrorText}>{persistenceError}</Text><TouchableOpacity accessibilityRole="button" style={styles.retryButton} onPress={onRetryPersistence}><Text style={styles.retryText}>Thử lưu lại</Text></TouchableOpacity></View>}
    <Text style={styles.note}>Nội dung minh họa trong bản demo, không phải thông báo giao dịch hoặc lịch khám đã xác nhận.</Text>
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface }, content: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 112 },
  header: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, title: { color: colors.primary, fontSize: 23, fontWeight: '900' }, newBadge: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 20, backgroundColor: '#CED9FF' }, newBadgeActive: { backgroundColor: colors.primary }, newBadgeText: { color: colors.primaryDark, fontSize: 12, fontWeight: '800' }, newBadgeTextActive: { color: 'white' }, badgeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary }, badgeDotActive: { backgroundColor: 'white' },
  actionsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 9, marginBottom: 6 }, sectionLabel: { color: colors.text, fontSize: 14, fontWeight: '700' }, markButton: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 6 }, markAll: { color: colors.primaryDark, fontSize: 14, fontWeight: '800' }, groupTitle: { alignSelf: 'flex-start', minHeight: 38, paddingHorizontal: 16, textAlignVertical: 'center', borderRadius: 18, overflow: 'hidden', backgroundColor: '#CED9FF', color: colors.primary, fontSize: 15, fontWeight: '700', marginTop: 6, marginBottom: 8 },
  card: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: 9, padding: 10, borderRadius: 14, backgroundColor: 'white', marginBottom: 7 }, cardUnread: { backgroundColor: '#CED9FF' }, icon: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#E8EDF9', alignItems: 'center', justifyContent: 'center' }, iconUnread: { backgroundColor: colors.primary }, iconText: { color: colors.primary, fontSize: 19, fontWeight: '800' }, iconTextUnread: { color: 'white' }, copy: { flex: 1, minWidth: 0 }, cardTitleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }, cardTitle: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '800' }, body: { color: colors.text, fontSize: 13, lineHeight: 18, marginTop: 4 }, date: { color: colors.text, fontSize: 12, marginTop: 2 },
  empty: { minHeight: 190, alignItems: 'center', justifyContent: 'center' }, emptyIcon: { color: colors.success, fontSize: 30 }, emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '800', marginTop: 8 }, note: { color: colors.muted, backgroundColor: '#FFF7E6', padding: 12, borderRadius: 10, fontSize: 13, lineHeight: 18, marginTop: 12 },
  persistenceError: { marginTop: 12, padding: 12, borderRadius: 10, backgroundColor: '#FFF0F0' }, persistenceErrorText: { color: colors.danger, fontSize: 13, lineHeight: 19 }, retryButton: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: 5 }, retryText: { color: colors.primary, fontSize: 13, fontWeight: '800' },
});
