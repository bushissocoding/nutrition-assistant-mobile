import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radius } from '../../theme/tokens';

const consentItems = [
  'Tôi đồng ý xử lý các thông tin hồ sơ sức khỏe tôi nhập trong ứng dụng.',
  'Tôi đồng ý gửi dị ứng và giới hạn dinh dưỡng đến API demo để tính thực đơn; bản hiện tại không gọi LLM/AI bên ngoài.',
  'Tôi hiểu mình có thể thu hồi sự đồng ý và xóa hồ sơ lưu trên thiết bị bất cứ lúc nào.',
  'Tôi hiểu gợi ý dinh dưỡng không thay thế chẩn đoán hoặc chỉ định của bác sĩ.',
];

export default function ConsentScreen({ onContinue, onWithdraw }) {
  const [checks, setChecks] = useState(() => consentItems.map(() => false));
  const ready = checks.every(Boolean);
  function toggle(index) { setChecks(current => current.map((value, i) => i === index ? !value : value)); }
  return <View style={styles.screen}>
    <View style={styles.brand}><Text style={styles.mark}>♡</Text><Text style={styles.title}>Nutrition Advisor</Text><Text style={styles.subtitle}>Dinh dưỡng phù hợp, bắt đầu từ lựa chọn an toàn.</Text></View>
    <View style={styles.card}><Text style={styles.heading}>Trước khi bắt đầu</Text><Text style={styles.copy}>Dữ liệu hồ sơ lưu cục bộ bằng SecureStore. Dị ứng và giới hạn dinh dưỡng sẽ được gửi đến API demo khi tạo thực đơn. API không lưu hồ sơ nhưng có thể xử lý yêu cầu. Chỉ dùng dữ liệu giả lập; không nhập hồ sơ bệnh án thật.</Text>
      {consentItems.map((label, index) => <TouchableOpacity key={label} style={styles.row} onPress={() => toggle(index)}><View style={[styles.checkbox, checks[index] && styles.checked]}><Text style={styles.checkText}>{checks[index] ? '✓' : ''}</Text></View><Text style={styles.item}>{label}</Text></TouchableOpacity>)}
      <TouchableOpacity disabled={!ready} style={[styles.button, !ready && { opacity: 0.45 }]} onPress={onContinue}><Text style={styles.buttonText}>Đồng ý và tiếp tục</Text></TouchableOpacity>
      {onWithdraw && <TouchableOpacity style={styles.withdraw} onPress={onWithdraw}><Text style={styles.withdrawText}>Thu hồi sự đồng ý và xóa dữ liệu</Text></TouchableOpacity>}
    </View>
    <Text style={styles.footnote}>Hồ sơ và trạng thái đồng ý được lưu trên thiết bị bằng SecureStore. Khi tạo thực đơn, dị ứng và giới hạn dinh dưỡng sẽ được gửi đến API demo để tính toán. API chưa lưu hồ sơ nhưng có thể xử lý yêu cầu; chỉ dùng dữ liệu giả lập, không nhập thông tin sức khỏe thật.</Text>
  </View>;
}

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.canvas, justifyContent: 'center', padding: 22 }, brand: { alignItems: 'center', marginBottom: 24 }, mark: { fontSize: 38, color: colors.primary }, title: { color: colors.primary, fontSize: 24, fontWeight: '800', marginTop: 8 }, subtitle: { color: colors.muted, textAlign: 'center', marginTop: 8, fontSize: 13 }, card: { backgroundColor: 'white', borderRadius: radius.lg, padding: 18, elevation: 2 }, heading: { color: colors.text, fontWeight: '800', fontSize: 18 }, copy: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 8, marginBottom: 8 }, row: { flexDirection: 'row', gap: 11, paddingVertical: 12, alignItems: 'flex-start' }, checkbox: { width: 22, height: 22, borderWidth: 1.5, borderColor: '#9AA8C3', borderRadius: 6, alignItems: 'center', justifyContent: 'center' }, checked: { backgroundColor: colors.primary, borderColor: colors.primary }, checkText: { color: 'white', fontWeight: '800' }, item: { flex: 1, color: colors.text, fontSize: 12, lineHeight: 18 }, button: { backgroundColor: colors.primary, borderRadius: radius.pill, alignItems: 'center', padding: 15, marginTop: 12 }, buttonText: { color: 'white', fontWeight: '800' }, footnote: { color: colors.muted, fontSize: 11, textAlign: 'center', marginTop: 14 }, withdraw: { padding: 12, alignItems: 'center' }, withdrawText: { color: colors.danger, fontSize: 11, fontWeight: '700' } });
