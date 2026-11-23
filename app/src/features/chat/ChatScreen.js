import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors, radius } from '../../theme/tokens';

const quickQuestions = ['Cách ghi món ăn', 'Xem báo cáo ở đâu?', 'Danh sách đi chợ'];
function replyFor(message, contact) {
  if (contact) return 'Đây là giao diện hội thoại minh họa. Tin nhắn chưa được gửi và không có bác sĩ hoặc nhân viên y tế phản hồi.';
  const text = message.toLowerCase();
  if (/đau|khó thở|ngất|cấp cứu|triệu chứng|chẩn đoán|điều trị/.test(text)) return 'Mình không thể đánh giá triệu chứng hoặc đưa ra chẩn đoán, điều trị. Nếu tình trạng nghiêm trọng hoặc mới xuất hiện, hãy liên hệ dịch vụ y tế tại địa phương.';
  if (/đi chợ|nguyên liệu|mua/.test(text)) return 'Bạn có thể mở mục Đi chợ từ Trang chủ. Danh sách chỉ được tạo sau khi có một thực đơn demo.';
  if (/báo cáo|chỉ số|dinh dưỡng/.test(text)) return 'Mục Báo cáo tổng hợp các món bạn ghi trong nhật ký và hiển thị giá trị ước tính từ danh mục demo.';
  if (/nhật ký|ghi món|ghi bữa/.test(text)) return 'Mở Nhật ký để tìm món trong danh mục demo, nhập khối lượng, chọn bữa và lưu. Nguồn dữ liệu sẽ hiển thị cùng món.';
  return 'Mình có thể hướng dẫn dùng các màn hình của bản demo. Thông tin thực phẩm chỉ mang tính tham khảo và mình không cung cấp tư vấn y tế cá nhân.';
}

export default function ChatScreen({ onNavigate, contact }) {
  const [messages, setMessages] = useState(() => [{ id: 'hello', from: 'assistant', text: contact ? 'Xin chào, đây là nội dung hội thoại mẫu để xem trước giao diện.' : 'Xin chào! Mình là ViCi. Mình có thể hướng dẫn bạn sử dụng các tính năng trong bản demo.' }]);
  const [draft, setDraft] = useState('');
  const scroll = useRef(null);

  function send(value = draft) {
    const text = value.trim();
    if (!text) return;
    setMessages(current => [...current, { id: `u-${Date.now()}`, from: 'user', text }, { id: `a-${Date.now() + 1}`, from: 'assistant', text: replyFor(text, contact) }]);
    setDraft('');
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 20);
  }

  return <View style={styles.screen}>
    <View style={styles.header}><View style={styles.avatar}><Text style={styles.avatarText}>{contact?.avatar || 'V'}</Text></View><View style={styles.headerCopy}><Text accessibilityRole="header" style={styles.title}>{contact?.name || 'Trợ lý ảo ViCi'}</Text><Text style={styles.online}>{contact ? 'Hội thoại mẫu · chưa gửi tin nhắn' : 'Trợ giúp bản demo · phản hồi tự động'}</Text></View><Text style={styles.headerIcon}>ⓘ</Text></View>
    <ScrollView ref={scroll} style={styles.messages} contentContainerStyle={styles.messageContent} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}>
      <Text style={styles.date}>HÔM NAY</Text>
      {messages.map(item => <View key={item.id} style={[styles.bubble, item.from === 'user' ? styles.userBubble : styles.assistantBubble]}><Text style={[styles.messageText, item.from === 'user' && styles.userText]}>{item.text}</Text></View>)}
      {messages.length === 1 && <>
        {contact ? <TouchableOpacity accessibilityRole="button" style={styles.quickCard} onPress={() => onNavigate?.('appointments')}><Text style={styles.quickIcon}>▣</Text><Text style={styles.quickText}>Quay lại lịch hẹn demo</Text><Text style={styles.quickArrow}>›</Text></TouchableOpacity> : <>
          <View style={styles.quickGrid}>{quickQuestions.map(question => <TouchableOpacity key={question} accessibilityRole="button" style={styles.quickCard} onPress={() => send(question)}><Text style={styles.quickIcon}>✦</Text><Text style={styles.quickText}>{question}</Text><Text style={styles.quickArrow}>›</Text></TouchableOpacity>)}</View>
          <Text style={styles.featureHeading}>Truy cập nhanh</Text>
          <View style={styles.featureGrid}>{[['▣', 'Đặt lịch demo', 'appointments'], ['≡', 'Ghi nhật ký', 'diary'], ['▤', 'Hồ sơ y tế', 'medical-record'], ['♡', 'Cá nhân hóa', 'personalization']].map(([icon, label, route]) => <TouchableOpacity key={route} accessibilityRole="button" style={styles.featureCard} onPress={() => onNavigate?.(route)}><Text style={styles.featureIcon}>{icon}</Text><Text style={styles.featureText}>{label}</Text></TouchableOpacity>)}</View>
        </>}
      </>}
    </ScrollView>
    <View style={styles.composer}><TextInput accessibilityLabel="Tin nhắn" value={draft} onChangeText={setDraft} onSubmitEditing={() => send()} returnKeyType="send" placeholder="Nhập tin nhắn…" style={styles.input} maxLength={500} /><TouchableOpacity accessibilityRole="button" accessibilityLabel="Gửi tin nhắn" style={styles.send} onPress={() => send()}><Text style={styles.sendText}>➤</Text></TouchableOpacity></View>
    <Text style={styles.disclaimer}>{contact ? 'Không có bác sĩ thật trong cuộc trò chuyện này. Không gửi thông tin sức khỏe thật.' : 'Không gửi thông tin sức khỏe thật. Trợ lý demo không thay thế chuyên gia y tế.'}</Text>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F6F8FD' }, header: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 16, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  avatar: { width: 40, height: 40, borderRadius: 14, backgroundColor: '#DBF2FF', alignItems: 'center', justifyContent: 'center' }, avatarText: { color: colors.primary, fontSize: 19, fontWeight: '900' }, headerCopy: { flex: 1 }, title: { color: colors.text, fontSize: 16, fontWeight: '800' }, online: { color: colors.success, fontSize: 11, marginTop: 3 }, headerIcon: { color: colors.primary, fontSize: 21 },
  messages: { flex: 1 }, messageContent: { padding: 15, paddingBottom: 20 }, date: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1, alignSelf: 'center', marginBottom: 16 },
  bubble: { maxWidth: '86%', padding: 12, borderRadius: 16, marginBottom: 10 }, assistantBubble: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderTopLeftRadius: 4 }, userBubble: { alignSelf: 'flex-end', backgroundColor: colors.primary, borderTopRightRadius: 4 }, messageText: { color: colors.text, fontSize: 13, lineHeight: 19 }, userText: { color: 'white' },
  quickGrid: { marginTop: 7, gap: 8 }, quickCard: { minHeight: 48, borderRadius: 12, backgroundColor: colors.surface, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 9 }, quickIcon: { color: '#36ADD7', fontSize: 18 }, quickText: { flex: 1, color: colors.text, fontSize: 12, fontWeight: '700' }, quickArrow: { color: colors.primary, fontSize: 22 },
  featureHeading: { color: colors.text, fontSize: 12, fontWeight: '900', marginTop: 17, marginBottom: 8 }, featureGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, featureCard: { width: '48%', minHeight: 67, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }, featureIcon: { color: '#36ADD7', fontSize: 19 }, featureText: { color: colors.text, fontSize: 11, fontWeight: '700', marginTop: 4 },
  composer: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 13, paddingVertical: 9, backgroundColor: '#E8EEFF' }, input: { flex: 1, minHeight: 48, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.surface, color: colors.text, fontSize: 13 }, send: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: colors.primary }, sendText: { color: 'white', fontSize: 18 }, disclaimer: { color: colors.muted, backgroundColor: '#E8EEFF', fontSize: 10, textAlign: 'center', paddingHorizontal: 9, paddingBottom: 6 },
});
