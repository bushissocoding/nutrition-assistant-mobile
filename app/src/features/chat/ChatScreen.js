import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors, radius } from '../../theme/tokens';

const assistantActions = [
  ['✚', 'Đặt lịch tư vấn', 'Xem danh sách chuyên gia trong bản demo.', 'appointments'],
  ['▤', 'Nhận lời khuyên', 'Tìm hiểu cách dùng các công cụ dinh dưỡng.', 'question'],
  ['▣', 'Hồ sơ sức khỏe', 'Xem các lựa chọn hồ sơ demo trên thiết bị.', 'medical-record'],
  ['♧', 'Đội ngũ bác sĩ', 'Danh sách bác sĩ chỉ là dữ liệu mẫu.', 'appointments'],
];
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
    <View style={styles.header}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Quay lại" style={styles.backButton} onPress={() => onNavigate?.(contact ? 'appointments-list' : 'home')}><Text style={styles.backGlyph}>‹</Text></TouchableOpacity>
      <View style={styles.headerCopy}><Text accessibilityRole="header" style={styles.title}>{contact?.name || 'Trợ lý ảo ViCi'}</Text><Text style={styles.online}>{contact ? 'Hội thoại mẫu · chưa gửi tin nhắn' : 'Trợ giúp bản demo · phản hồi tự động'}</Text></View>
      {contact ? <Text style={styles.headerIcon}>◉　▣</Text> : null}
    </View>
    <ScrollView ref={scroll} style={styles.messages} contentContainerStyle={styles.messageContent} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}>
      <Text style={styles.date}>HÔM NAY</Text>
      {messages.map(item => <View key={item.id} style={[styles.bubble, item.from === 'user' ? styles.userBubble : styles.assistantBubble]}><Text style={[styles.messageText, item.from === 'user' && styles.userText]}>{item.text}</Text></View>)}
      {messages.length === 1 && <>
        {contact ? <TouchableOpacity accessibilityRole="button" style={styles.quickCard} onPress={() => onNavigate?.('appointments-list')}><Text style={styles.quickIcon}>▣</Text><Text style={styles.quickText}>Quay lại lịch hẹn demo</Text><Text style={styles.quickArrow}>›</Text></TouchableOpacity> : <View style={styles.assistantGrid}>{assistantActions.map(([icon, title, description, route]) => <TouchableOpacity key={title} accessibilityRole="button" style={styles.assistantCard} onPress={() => route === 'question' ? send('dinh dưỡng') : onNavigate?.(route)}><View style={styles.assistantIcon}><Text style={styles.featureIcon}>{icon}</Text></View><Text style={styles.assistantTitle}>{title}</Text><Text style={styles.assistantDescription}>{description}</Text></TouchableOpacity>)}</View>}
      </>}
    </ScrollView>
    <View style={styles.composer}><TextInput accessibilityLabel="Tin nhắn" value={draft} onChangeText={setDraft} onSubmitEditing={() => send()} returnKeyType="send" placeholder="Nhập tin nhắn…" style={styles.input} maxLength={500} /><TouchableOpacity accessibilityRole="button" accessibilityLabel="Gửi tin nhắn" style={styles.send} onPress={() => send()}><Text style={styles.sendText}>➤</Text></TouchableOpacity></View>
    <Text style={styles.disclaimer}>{contact ? 'Không có bác sĩ thật trong cuộc trò chuyện này. Không gửi thông tin sức khỏe thật.' : 'Không gửi thông tin sức khỏe thật. Trợ lý demo không thay thế chuyên gia y tế.'}</Text>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' }, header: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, backgroundColor: colors.primary },
  backButton: { width: 38, height: 48, alignItems: 'flex-start', justifyContent: 'center' }, backGlyph: { color: 'white', fontSize: 34, lineHeight: 38 }, headerCopy: { flex: 1 }, title: { color: 'white', fontSize: 17, fontWeight: '900' }, online: { color: '#E1E9FF', fontSize: 10, marginTop: 3 }, headerIcon: { color: 'white', fontSize: 17, fontWeight: '800' },
  messages: { flex: 1 }, messageContent: { paddingHorizontal: 15, paddingTop: 14, paddingBottom: 14 }, date: { color: colors.primary, fontSize: 10, fontWeight: '700', alignSelf: 'center', marginBottom: 10 },
  bubble: { maxWidth: '86%', padding: 12, borderRadius: 18, marginBottom: 10 }, assistantBubble: { alignSelf: 'flex-start', backgroundColor: '#EDF1FA', borderBottomLeftRadius: 4 }, userBubble: { alignSelf: 'flex-end', backgroundColor: '#CED9FF', borderBottomRightRadius: 4 }, messageText: { color: colors.text, fontSize: 12, lineHeight: 18 }, userText: { color: colors.text },
  quickCard: { minHeight: 48, borderRadius: 12, backgroundColor: colors.surface, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 9 }, quickIcon: { color: '#36ADD7', fontSize: 18 }, quickText: { flex: 1, color: colors.text, fontSize: 12, fontWeight: '700' }, quickArrow: { color: colors.primary, fontSize: 22 },
  assistantGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 3 }, assistantCard: { width: '48%', minHeight: 169, borderRadius: 20, backgroundColor: '#F4F6FA', padding: 14 }, assistantIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#4CC3F4', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }, featureIcon: { color: 'white', fontSize: 19 }, assistantTitle: { color: '#252C3B', fontSize: 12, fontWeight: '800' }, assistantDescription: { color: '#5E6676', fontSize: 11, lineHeight: 16, marginTop: 7 },
  composer: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingVertical: 9, backgroundColor: '#CED9FF' }, input: { flex: 1, minHeight: 48, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.surface, color: colors.text, fontSize: 13 }, send: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: colors.primary }, sendText: { color: 'white', fontSize: 20 }, disclaimer: { color: colors.primaryDark, backgroundColor: '#CED9FF', fontSize: 9, textAlign: 'center', paddingHorizontal: 9, paddingBottom: 6 },
});
