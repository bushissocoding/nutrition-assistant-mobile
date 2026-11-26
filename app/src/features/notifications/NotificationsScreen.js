import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Notifications from '../../services/notifications';
import { api } from '../../services/api';
import { colors } from '../../theme/tokens';

const GROUPS = [['today', 'Hôm nay'], ['yesterday', 'Hôm qua'], ['week', '7 ngày gần đây'], ['older', 'Trước đó']];
const KIND_PRESENTATION = {
  appointment: { icon: '▣', route: 'appointments-list' },
  payment: { icon: '₫', route: 'appointments-list' },
  message: { icon: '✉', route: 'appointments-list' },
};

function dayStart(date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime(); }

export function notificationGroup(createdAt, now = new Date()) {
  const created = new Date(createdAt);
  if (!Number.isFinite(created.getTime())) return 'older';
  const ageInDays = Math.floor((dayStart(now) - dayStart(created)) / 86400000);
  if (ageInDays <= 0) return 'today';
  if (ageInDays === 1) return 'yesterday';
  if (ageInDays < 7) return 'week';
  return 'older';
}

function relativeDate(createdAt, now = Date.now()) {
  const timestamp = new Date(createdAt).getTime();
  if (!Number.isFinite(timestamp)) return '';
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60000));
  if (minutes < 1) return 'Vừa xong';
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ`;
  const days = Math.floor(hours / 24);
  return `${days} ngày`;
}

export default function NotificationsScreen({ accountId, onNavigate }) {
  const [items, setItems] = useState([]);
  const [period, setPeriod] = useState('all');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const [actionId, setActionId] = useState(null);
  const itemsRef = useRef([]);
  const requestVersion = useRef(0);

  const load = useCallback(async ({ append = false } = {}) => {
    if (!accountId) { itemsRef.current = []; setItems([]); setLoading(false); return; }
    const version = ++requestVersion.current;
    const offset = append ? itemsRef.current.length : 0;
    if (append) setLoadingMore(true); else setLoading(true);
    setError('');
    try {
      const result = await api.getMyNotifications({ limit: 50, offset, unread: false });
      const nextItems = Array.isArray(result?.items) ? result.items : [];
      if (version !== requestVersion.current) return;
      const allItems = append ? [...itemsRef.current, ...nextItems] : nextItems;
      itemsRef.current = allItems;
      setItems(allItems);
      setHasMore(result?.pagination?.hasMore === true);
    } catch (cause) {
      if (version === requestVersion.current) setError(cause?.message || 'Không tải được thông báo của tài khoản.');
    } finally { if (version === requestVersion.current) { setLoading(false); setLoadingMore(false); } }
  }, [accountId]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    setItems([]);
    setPeriod('all');
    load();
  }, [accountId, load]);

  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener(() => load());
    return () => subscription?.remove?.();
  }, [load]);

  const visibleItems = useMemo(() => {
    const filtered = period === 'unread' ? items.filter(item => !item.readAt) : items;
    return filtered.map(item => ({ ...item, group: notificationGroup(item.createdAt), date: relativeDate(item.createdAt) }));
  }, [items, period]);

  async function openItem(item) {
    if (item.readAt) { onNavigate?.(KIND_PRESENTATION[item.kind]?.route || 'appointments-list'); return; }
    setActionId(item.id); setError('');
    try {
      await api.markMyNotificationRead(item.id);
      setItems(current => current.map(entry => entry.id === item.id ? { ...entry, readAt: new Date().toISOString() } : entry));
    } catch (cause) { setError(cause?.message || 'Không thể đồng bộ trạng thái đã đọc.'); }
    finally { setActionId(null); }
    onNavigate?.(KIND_PRESENTATION[item.kind]?.route || 'appointments-list');
  }

  async function markAllRead() {
    if (!items.some(item => !item.readAt)) return;
    setActionId('all'); setError('');
    try {
      await api.markAllMyNotificationsRead();
      const readAt = new Date().toISOString();
      setItems(current => current.map(item => item.readAt ? item : { ...item, readAt }));
    } catch (cause) { setError(cause?.message || 'Không thể đồng bộ trạng thái đã đọc.'); }
    finally { setActionId(null); }
  }

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <View style={styles.header}>
      <Text accessibilityRole="header" style={styles.title}>Thông báo</Text>
      <TouchableOpacity accessibilityRole="checkbox" accessibilityLabel="Chỉ xem tin mới" accessibilityState={{ checked: period === 'unread' }} style={[styles.newBadge, period === 'unread' && styles.newBadgeActive]} onPress={() => setPeriod(value => value === 'unread' ? 'all' : 'unread')}>
        <Text style={[styles.newBadgeText, period === 'unread' && styles.newBadgeTextActive]}>Tin mới</Text><View style={[styles.badgeDot, period === 'unread' && styles.badgeDotActive]} />
      </TouchableOpacity>
    </View>
    <View style={styles.actionsRow}><Text style={styles.sectionLabel}>Cập nhật tài khoản</Text><TouchableOpacity accessibilityRole="button" disabled={loading || actionId !== null} style={styles.markButton} onPress={markAllRead}><Text style={styles.markAll}>{actionId === 'all' ? 'Đang lưu…' : 'Đánh dấu đã đọc'}</Text></TouchableOpacity></View>
    {loading && <View style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={styles.body}>Đang tải thông báo…</Text></View>}
    {!!error && <View style={styles.error}><Text accessibilityRole="alert" style={styles.errorText}>{error}</Text><TouchableOpacity accessibilityRole="button" style={styles.retryButton} onPress={() => load()}><Text style={styles.retryText}>Thử tải lại</Text></TouchableOpacity></View>}
    {!loading && GROUPS.map(([key, title]) => {
      const groupItems = visibleItems.filter(item => item.group === key);
      if (!groupItems.length) return null;
      return <View key={key}>
        <Text style={styles.groupTitle}>{title}</Text>
        {groupItems.map(item => <TouchableOpacity key={item.id} accessibilityRole="button" accessibilityLabel={`${item.title}. ${item.readAt ? 'Đã đọc' : 'Chưa đọc'}`} accessibilityState={{ disabled: actionId === item.id }} style={[styles.card, !item.readAt && styles.cardUnread]} disabled={actionId === item.id} onPress={() => openItem(item)}>
          <View style={[styles.icon, !item.readAt && styles.iconUnread]}><Text style={[styles.iconText, !item.readAt && styles.iconTextUnread]}>{KIND_PRESENTATION[item.kind]?.icon || '•'}</Text></View>
          <View style={styles.copy}><View style={styles.cardTitleRow}><Text style={styles.cardTitle}>{item.title}</Text><Text style={styles.date}>{item.date}</Text></View><Text style={styles.body}>{item.body}</Text></View>
        </TouchableOpacity>)}
      </View>;
    })}
    {!loading && !visibleItems.length && <View style={styles.empty}><Text style={styles.emptyIcon}>✓</Text><Text style={styles.emptyTitle}>{period === 'unread' ? 'Không còn thông báo chưa đọc' : 'Chưa có thông báo'}</Text><Text style={styles.body}>Các cập nhật từ lịch hẹn, thanh toán và tin nhắn sẽ xuất hiện tại đây.</Text></View>}
    {!loading && hasMore && <TouchableOpacity accessibilityRole="button" disabled={loadingMore} style={styles.loadMore} onPress={() => load({ append: true })}><Text style={styles.retryText}>{loadingMore ? 'Đang tải…' : 'Tải thông báo cũ hơn'}</Text></TouchableOpacity>}
    <Text style={styles.note}>Thông báo đẩy, nếu được bật, chỉ hiển thị nội dung chung. Hãy mở ứng dụng để xem chi tiết sau khi đăng nhập.</Text>
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface }, content: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 112 },
  header: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, title: { color: colors.primary, fontSize: 23, fontWeight: '900' }, newBadge: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 20, backgroundColor: '#CED9FF' }, newBadgeActive: { backgroundColor: colors.primary }, newBadgeText: { color: colors.primaryDark, fontSize: 12, fontWeight: '800' }, newBadgeTextActive: { color: 'white' }, badgeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary }, badgeDotActive: { backgroundColor: 'white' },
  actionsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 9, marginBottom: 6 }, sectionLabel: { color: colors.text, fontSize: 14, fontWeight: '700' }, markButton: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 6 }, markAll: { color: colors.primaryDark, fontSize: 14, fontWeight: '800' }, groupTitle: { alignSelf: 'flex-start', minHeight: 38, paddingHorizontal: 16, textAlignVertical: 'center', borderRadius: 18, overflow: 'hidden', backgroundColor: '#CED9FF', color: colors.primary, fontSize: 15, fontWeight: '700', marginTop: 6, marginBottom: 8 },
  card: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: 9, padding: 10, borderRadius: 14, backgroundColor: 'white', marginBottom: 7 }, cardUnread: { backgroundColor: '#CED9FF' }, icon: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#E8EDF9', alignItems: 'center', justifyContent: 'center' }, iconUnread: { backgroundColor: colors.primary }, iconText: { color: colors.primary, fontSize: 19, fontWeight: '800' }, iconTextUnread: { color: 'white' }, copy: { flex: 1, minWidth: 0 }, cardTitleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }, cardTitle: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '800' }, body: { color: colors.text, fontSize: 13, lineHeight: 18, marginTop: 4 }, date: { color: colors.text, fontSize: 12, marginTop: 2 },
  empty: { minHeight: 190, alignItems: 'center', justifyContent: 'center' }, loading: { minHeight: 170, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 }, emptyIcon: { color: colors.success, fontSize: 30 }, emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '800', marginTop: 8 }, note: { color: colors.muted, backgroundColor: '#FFF7E6', padding: 12, borderRadius: 10, fontSize: 13, lineHeight: 18, marginTop: 12 },
  error: { marginTop: 12, padding: 12, borderRadius: 10, backgroundColor: '#FFF0F0' }, errorText: { color: colors.danger, fontSize: 13, lineHeight: 19 }, retryButton: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: 5 }, retryText: { color: colors.primary, fontSize: 13, fontWeight: '800' }, loadMore: { minHeight: 48, justifyContent: 'center', alignItems: 'center' },
});
