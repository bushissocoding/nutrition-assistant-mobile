import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api } from '../../services/api';
import { colors, radius } from '../../theme/tokens';

const CHAT_ELIGIBLE_APPOINTMENT_STATUSES = new Set(['confirmed', 'completed']);

function formatConversationTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function assistantConversation(thread) {
  const turns = Array.isArray(thread?.turns) ? thread.turns : [];
  const latest = turns[turns.length - 1];
  const hasReply = typeof latest?.assistantMessage === 'string' && latest.assistantMessage.trim();
  const message = hasReply ? latest.assistantMessage : latest?.userMessage;
  return {
    id: 'assistant',
    kind: 'assistant',
    name: 'Trợ lý ảo ViCi',
    subtitle: 'Trợ lý dinh dưỡng',
    avatar: 'V',
    preview: message ? `${hasReply ? 'ViCi' : 'Bạn'}: ${message}` : 'ViCi: Bắt đầu trò chuyện với ViCi.',
    timestamp: latest?.createdAt,
  };
}

function doctorConversation(appointment, result, userId) {
  const messages = Array.isArray(result?.items) ? result.items : [];
  const latest = messages[messages.length - 1];
  const providerName = appointment.provider?.name || 'Bác sĩ';
  return {
    id: appointment.id,
    kind: 'doctor',
    name: providerName,
    subtitle: `Lịch hẹn ${formatConversationTime(appointment.startsAt)}`,
    avatar: providerName.trim().charAt(0).toLocaleUpperCase('vi-VN') || 'B',
    preview: latest
      ? `${latest.senderUserId === userId ? 'Bạn' : 'Bác sĩ'}: ${latest.body}`
      : 'Chưa có tin nhắn. Bắt đầu cuộc trò chuyện.',
    timestamp: latest?.createdAt || appointment.updatedAt || appointment.startsAt,
    contact: { id: appointment.providerId, role: 'provider', name: providerName, appointmentId: appointment.id },
  };
}

function byRecentActivity(left, right) {
  const leftTime = Date.parse(left.timestamp || '') || 0;
  const rightTime = Date.parse(right.timestamp || '') || 0;
  return rightTime - leftTime;
}

export default function ChatInboxScreen({ account, onOpenAssistant, onOpenDoctorChat }) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [loadVersion, setLoadVersion] = useState(0);
  const userId = account?.id;

  useEffect(() => {
    let active = true;

    async function loadInbox() {
      setLoading(true);
      setError(false);
      setConversations([]);

      const [assistantResult, appointmentResult] = await Promise.allSettled([
        api.getMyAssistantThread(),
        api.getMyAppointments({ limit: 25, offset: 0 }),
      ]);

      const next = [assistantConversation(assistantResult.status === 'fulfilled' ? assistantResult.value : null)];
      let loadFailed = assistantResult.status === 'rejected' || appointmentResult.status === 'rejected';
      const appointments = appointmentResult.status === 'fulfilled' && Array.isArray(appointmentResult.value?.items)
        ? appointmentResult.value.items.filter(item => CHAT_ELIGIBLE_APPOINTMENT_STATUSES.has(item.status) && item.providerId)
        : [];

      const doctorResults = await Promise.allSettled(appointments.map(appointment =>
        api.getMyAppointmentMessages(appointment.id).then(result => ({ appointment, result }))));

      for (const result of doctorResults) {
        if (result.status === 'rejected' || !result.value.result) {
          loadFailed = true;
          continue;
        }
        next.push(doctorConversation(result.value.appointment, result.value.result, userId));
      }

      if (!active) return;
      setConversations(next.sort(byRecentActivity));
      setError(loadFailed);
      setLoading(false);
    }

    loadInbox();
    return () => { active = false; };
  }, [userId, loadVersion]);

  return <View style={styles.screen}>
    <View style={styles.header}>
      <Text style={styles.eyebrow}>TIN NHẮN</Text>
      <Text accessibilityRole="header" style={styles.title}>Trò chuyện</Text>
      <Text style={styles.subtitle}>Các cuộc trò chuyện gần đây của bạn</Text>
    </View>
    {loading && <View style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={styles.helper}>Đang tải tin nhắn…</Text></View>}
    {!!error && <View style={styles.errorCard}>
      <Text accessibilityRole="alert" style={styles.errorText}>Không tải được một số hội thoại.</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Tải lại" onPress={() => setLoadVersion(value => value + 1)}>
        <Text style={styles.retry}>Tải lại</Text>
      </TouchableOpacity>
    </View>}
    <ScrollView style={styles.scroll} contentContainerStyle={styles.list}>
      {conversations.map(conversation => <TouchableOpacity
        key={conversation.id}
        accessibilityRole="button"
        accessibilityLabel={`${conversation.name}. ${conversation.preview}`}
        style={styles.row}
        onPress={() => conversation.kind === 'assistant'
          ? onOpenAssistant?.()
          : onOpenDoctorChat?.(conversation.contact)}
      >
        <View style={[styles.avatar, conversation.kind === 'assistant' && styles.assistantAvatar]}>
          <Text style={[styles.avatarText, conversation.kind === 'assistant' && styles.assistantAvatarText]}>{conversation.avatar}</Text>
        </View>
        <View style={styles.rowCopy}>
          <View style={styles.nameLine}>
            <Text numberOfLines={1} style={styles.name}>{conversation.name}</Text>
            {!!conversation.timestamp && <Text style={styles.time}>{formatConversationTime(conversation.timestamp)}</Text>}
          </View>
          <Text numberOfLines={1} style={styles.preview}>{conversation.preview}</Text>
          <Text numberOfLines={1} style={styles.rowSubtitle}>{conversation.subtitle}</Text>
        </View>
      </TouchableOpacity>)}
      {!loading && !error && !conversations.some(item => item.kind === 'doctor') && <View style={styles.emptyDoctor}>
        <Text style={styles.emptyTitle}>Chưa có cuộc trò chuyện với bác sĩ</Text>
        <Text style={styles.helper}>Tin nhắn trong lịch hẹn đã xác nhận hoặc hoàn tất sẽ xuất hiện ở đây.</Text>
      </View>}
      {!loading && <View style={styles.bottomSpace} />}
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFF' },
  header: { paddingHorizontal: 20, paddingTop: 15, paddingBottom: 16, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: colors.border },
  eyebrow: { color: colors.primary, fontSize: 10, letterSpacing: 1.2, fontWeight: '900' },
  title: { color: colors.text, fontSize: 25, lineHeight: 31, fontWeight: '900', marginTop: 5 },
  subtitle: { color: colors.muted, fontSize: 13, marginTop: 3 },
  loading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingVertical: 18 },
  helper: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  errorCard: { marginHorizontal: 15, marginTop: 12, padding: 12, borderRadius: radius.md, backgroundColor: '#FFF0F0', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  errorText: { flex: 1, color: colors.danger, fontSize: 12, lineHeight: 17 },
  retry: { color: colors.primaryDark, fontSize: 12, fontWeight: '900', padding: 8 },
  scroll: { flex: 1 },
  list: { paddingHorizontal: 15, paddingTop: 5 },
  row: { minHeight: 86, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: '#D9E5FF' },
  assistantAvatar: { backgroundColor: colors.primary },
  assistantAvatarText: { color: 'white' },
  avatarText: { color: colors.primaryDark, fontSize: 19, fontWeight: '900' },
  rowCopy: { flex: 1, minWidth: 0 },
  nameLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '900' },
  time: { color: colors.muted, fontSize: 10 },
  preview: { color: colors.muted, fontSize: 12, marginTop: 5 },
  rowSubtitle: { color: colors.primaryDark, fontSize: 10, marginTop: 4 },
  emptyDoctor: { alignItems: 'center', paddingHorizontal: 20, paddingVertical: 24, gap: 7 },
  emptyTitle: { color: colors.text, fontSize: 13, fontWeight: '800', textAlign: 'center' },
  bottomSpace: { height: 88 },
});
