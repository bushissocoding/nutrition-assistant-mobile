import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../../services/api';
import { colors, radius } from '../../theme/tokens';

const AI_CONSENT_VERSION = 'ai-assistant-processing-v1';

function newClientMessageId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const value = Math.floor(Math.random() * 16);
    return (char === 'x' ? value : (value & 0x3) | 0x8).toString(16);
  });
}

function assistantItems(thread) {
  return (thread?.turns || []).flatMap(turn => [
    { id: `${turn.id}-user`, from: 'user', text: turn.userMessage },
    ...(turn.assistantMessage ? [{ id: `${turn.id}-assistant`, from: 'assistant', text: turn.assistantMessage }] : []),
  ]);
}

function appointmentItems(result, userId) {
  return (result?.items || []).map(item => ({
    id: item.id,
    from: item.senderUserId === userId ? 'user' : 'assistant',
    text: item.body,
  }));
}

export default function ChatScreen({ onNavigate, onBack, contact, account }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [aiConsent, setAiConsent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingConsent, setSavingConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [consentError, setConsentError] = useState('');
  const [version, setVersion] = useState(0);
  const scroll = useRef(null);
  const retryRequest = useRef(null);

  const loadMessages = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (contact?.appointmentId) {
        const result = await api.getMyAppointmentMessages(contact.appointmentId);
        setMessages(appointmentItems(result, account?.id));
      } else {
        const result = await api.getMyAssistantThread();
        setAiConsent(result?.aiConsent === true);
        setMessages(assistantItems(result));
      }
    } catch (loadError) {
      setError(loadError?.message || 'Không tải được lịch sử hội thoại.');
    } finally {
      setLoading(false);
    }
  }, [account?.id, contact?.appointmentId]);

  useEffect(() => { loadMessages(); }, [loadMessages, version]);

  async function chooseAiConsent(accepted) {
    setSavingConsent(true);
    setConsentError('');
    try {
      const result = await api.saveMyAssistantConsent({ version: AI_CONSENT_VERSION, accepted });
      setAiConsent(result?.accepted === true);
    } catch (saveError) {
      setConsentError(saveError?.message || 'Không lưu được lựa chọn trợ lý AI.');
    } finally {
      setSavingConsent(false);
    }
  }

  async function send(value = draft, pendingRequest = null) {
    const text = value.trim();
    if (!text || sending || loading) return;
    if (!contact && !aiConsent) return;
    const request = pendingRequest || { id: newClientMessageId(), text };
    retryRequest.current = request;
    setSending(true);
    setError('');
    try {
      if (contact?.appointmentId) {
        const result = await api.sendMyAppointmentMessage(contact.appointmentId, { clientMessageId: request.id, body: request.text });
        setMessages(current => current.some(item => item.id === result?.message?.id)
          ? current
          : [...current, { id: result.message.id, from: 'user', text: result.message.body }]);
      } else {
        const result = await api.sendMyAssistantTurn({ clientMessageId: request.id, message: request.text });
        const turn = result?.turn;
        if (!turn) throw new Error('Máy chủ chưa lưu được tin nhắn. Hãy thử gửi lại.');
        setMessages(current => [
          ...current,
          { id: `${turn.id}-user`, from: 'user', text: turn.userMessage },
          ...(turn.assistantMessage ? [{ id: `${turn.id}-assistant`, from: 'assistant', text: turn.assistantMessage }] : []),
        ]);
      }
      retryRequest.current = null;
      setDraft('');
    } catch (sendError) {
      setError(sendError?.message || 'Không gửi được tin nhắn. Bạn có thể thử lại.');
    } finally {
      setSending(false);
    }
  }

  return <View style={styles.screen}>
    <View style={styles.header}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Quay lại" style={styles.backButton} onPress={() => (onBack ? onBack() : onNavigate?.(contact ? 'appointments-list' : 'home'))}><Text style={styles.backGlyph}>‹</Text></TouchableOpacity>
      <View style={styles.headerCopy}><Text accessibilityRole="header" style={styles.title}>{contact?.name || 'Trợ lý ảo ViCi'}</Text><Text style={styles.online}>{contact ? 'Tin nhắn trong lịch hẹn đã xác nhận' : 'Trợ lý dinh dưỡng · dữ liệu tài khoản'}</Text></View>
    </View>
    {!contact && <View style={styles.consentCard}>
      <Text style={styles.consentTitle}>Chia sẻ tin nhắn với trợ lý AI</Text>
      <Text style={styles.consentCopy}>Khi bật, nội dung bạn gửi và tối đa 12 lượt chat gần nhất sẽ được gửi tới OpenAI để tạo câu trả lời. Không gửi hồ sơ, nhật ký hay hồ sơ y tế. Trợ lý không chẩn đoán hoặc điều trị.</Text>
      {aiConsent
        ? <TouchableOpacity accessibilityRole="button" onPress={() => chooseAiConsent(false)} disabled={savingConsent}><Text style={styles.consentAction}>{savingConsent ? 'Đang lưu…' : 'Tắt chia sẻ với trợ lý AI'}</Text></TouchableOpacity>
        : <TouchableOpacity accessibilityRole="button" style={styles.consentButton} onPress={() => chooseAiConsent(true)} disabled={savingConsent}><Text style={styles.consentButtonText}>{savingConsent ? 'Đang lưu…' : 'Đồng ý và bật trợ lý AI'}</Text></TouchableOpacity>}
      {!!consentError && <Text accessibilityRole="alert" style={styles.errorText}>{consentError}</Text>}
    </View>}
    <ScrollView ref={scroll} style={styles.messages} contentContainerStyle={styles.messageContent} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}>
      {loading ? <View style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={styles.empty}>Đang tải hội thoại…</Text></View> : null}
      {!loading && messages.length === 0 && !error ? <Text style={styles.empty}>{contact ? 'Chưa có tin nhắn trong lịch hẹn này.' : 'Lịch sử hội thoại của bạn sẽ hiển thị tại đây.'}</Text> : null}
      {messages.map(item => <View key={item.id} style={[styles.bubble, item.from === 'user' ? styles.userBubble : styles.assistantBubble]}><Text style={[styles.messageText, item.from === 'user' && styles.userText]}>{item.text}</Text></View>)}
      {!!error && <View style={styles.errorCard}><Text accessibilityRole="alert" style={styles.errorText}>{error}</Text><TouchableOpacity accessibilityRole="button" onPress={() => retryRequest.current ? send(retryRequest.current.text, retryRequest.current) : setVersion(value => value + 1)}><Text style={styles.consentAction}>{retryRequest.current ? 'Thử gửi lại' : 'Tải lại'}</Text></TouchableOpacity></View>}
      {sending && <Text style={styles.pending}>{contact ? 'Đang gửi tin nhắn…' : 'Đang chờ trợ lý trả lời…'}</Text>}
    </ScrollView>
    <View style={styles.composer}><TextInput accessibilityLabel="Tin nhắn" value={draft} onChangeText={setDraft} onSubmitEditing={() => send()} returnKeyType="send" placeholder={contact ? 'Nhập tin nhắn cho nhà cung cấp…' : 'Nhập tin nhắn…'} style={styles.input} maxLength={2000} editable={!loading && !sending && (Boolean(contact) || aiConsent)} /><TouchableOpacity accessibilityRole="button" accessibilityLabel="Gửi tin nhắn" style={[styles.send, (loading || sending || (!contact && !aiConsent)) && styles.sendDisabled]} onPress={() => send()} disabled={loading || sending || (!contact && !aiConsent)}><Text style={styles.sendText}>➤</Text></TouchableOpacity></View>
    <Text style={styles.disclaimer}>{contact ? 'Tin nhắn chỉ gửi cho người cung cấp dịch vụ đã xác minh trong lịch hẹn này.' : 'Thông tin chỉ để tham khảo; không thay thế tư vấn của nhân viên y tế.'}</Text>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' }, header: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, backgroundColor: colors.primary },
  backButton: { width: 38, height: 48, alignItems: 'flex-start', justifyContent: 'center' }, backGlyph: { color: 'white', fontSize: 34, lineHeight: 38 }, headerCopy: { flex: 1 }, title: { color: 'white', fontSize: 17, fontWeight: '900' }, online: { color: '#E1E9FF', fontSize: 10, marginTop: 3 },
  consentCard: { margin: 12, padding: 12, borderRadius: 14, backgroundColor: '#F4F6FA' }, consentTitle: { color: colors.text, fontSize: 13, fontWeight: '800' }, consentCopy: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 5 }, consentAction: { color: colors.primary, fontSize: 12, fontWeight: '800', marginTop: 8 }, consentButton: { minHeight: 40, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: 14, marginTop: 8, borderRadius: radius.pill, backgroundColor: colors.primary }, consentButtonText: { color: 'white', fontSize: 12, fontWeight: '800' },
  messages: { flex: 1 }, messageContent: { paddingHorizontal: 15, paddingTop: 14, paddingBottom: 14 }, loading: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'center' }, empty: { color: colors.muted, fontSize: 12, textAlign: 'center', alignSelf: 'center', marginVertical: 16 },
  bubble: { maxWidth: '86%', padding: 12, borderRadius: 18, marginBottom: 10 }, assistantBubble: { alignSelf: 'flex-start', backgroundColor: '#EDF1FA', borderBottomLeftRadius: 4 }, userBubble: { alignSelf: 'flex-end', backgroundColor: '#CED9FF', borderBottomRightRadius: 4 }, messageText: { color: colors.text, fontSize: 12, lineHeight: 18 }, userText: { color: colors.text },
  errorCard: { borderRadius: 12, backgroundColor: '#FFF0F0', padding: 10, marginBottom: 10 }, errorText: { color: colors.danger, fontSize: 11, lineHeight: 16 }, pending: { color: colors.muted, fontSize: 11, marginBottom: 8 },
  composer: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingVertical: 9, backgroundColor: '#CED9FF' }, input: { flex: 1, minHeight: 48, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.surface, color: colors.text, fontSize: 13 }, send: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: colors.primary }, sendDisabled: { opacity: 0.45 }, sendText: { color: 'white', fontSize: 20 }, disclaimer: { color: colors.primaryDark, backgroundColor: '#CED9FF', fontSize: 9, textAlign: 'center', paddingHorizontal: 9, paddingBottom: 6 },
});
