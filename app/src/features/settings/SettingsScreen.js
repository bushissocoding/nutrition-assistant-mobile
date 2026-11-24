import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors, radius } from '../../theme/tokens';

const settingsRows = [
  ['♧', 'Cài đặt thông báo', 'settings-notifications', ''],
  ['⚿', 'Quản lý mật khẩu', 'settings-password', ''],
  ['☎', 'Số điện thoại khôi phục', 'settings-phone', ''],
  ['♙', 'Xóa tài khoản', 'settings-delete', ''],
];

export default function SettingsScreen({ screen = 'settings', account, phone, busy = false, onNavigate, onBack, onForgotPassword, onUpdatePassword, onRequestPhoneLink, onVerifyPhoneLink, onDeleteAccount, onExportAccount }) {
  const [toggles, setToggles] = useState({ general: true, sound: false, calls: false, payment: true });
  const [phoneInput, setPhoneInput] = useState(phone || '');
  const [phoneCode, setPhoneCode] = useState('');
  const [awaitingPhoneCode, setAwaitingPhoneCode] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [feedback, setFeedback] = useState('');
  const [faq, setFaq] = useState(-1);
  const [tab, setTab] = useState('faq');
  const title = ({ settings: 'Cài đặt', 'settings-notifications': 'Cài đặt thông báo', 'settings-password': 'Quản lý mật khẩu', 'settings-phone': 'Số điện thoại khôi phục', 'settings-delete': 'Xóa tài khoản', 'settings-privacy': 'Chính sách và quyền riêng tư', 'settings-help': 'Trung tâm hỗ trợ' })[screen] || 'Cài đặt';

  function toggle(key) { setToggles(value => ({ ...value, [key]: !value[key] })); }
  async function validatePassword() {
    if (newPassword.length < 8) { setFeedback('Mật khẩu cần có ít nhất 8 ký tự.'); return; }
    if (newPassword !== confirmPassword) { setFeedback('Mật khẩu xác nhận chưa khớp.'); return; }
    try {
      if (typeof onUpdatePassword !== 'function') throw new Error('Dịch vụ đổi mật khẩu chưa được cấu hình.');
      await onUpdatePassword({ password: newPassword, confirmPassword });
      setNewPassword(''); setConfirmPassword(''); setFeedback('Đã cập nhật mật khẩu.');
    } catch (error) { setFeedback(error?.message || 'Không thể đổi mật khẩu lúc này.'); }
  }
  async function requestPhoneCode() {
    setFeedback('');
    try { await onRequestPhoneLink?.(phoneInput); setAwaitingPhoneCode(true); setFeedback('Nếu yêu cầu được chấp nhận, hãy nhập mã SMS gửi tới số điện thoại.'); }
    catch (error) { setFeedback(error?.message || 'Không thể gửi mã lúc này.'); }
  }
  async function confirmPhoneCode() {
    setFeedback('');
    try { await onVerifyPhoneLink?.({ phone: phoneInput, token: phoneCode }); setAwaitingPhoneCode(false); setPhoneCode(''); setFeedback('Số điện thoại đã được xác minh.'); }
    catch (error) { setFeedback(error?.message || 'Mã không hợp lệ hoặc đã hết hạn.'); }
  }
  function confirmDeleteAccount() {
    Alert.alert('Xóa tài khoản vĩnh viễn?', 'Máy chủ sẽ xóa hồ sơ và dữ liệu liên kết. Nếu một bước xóa chưa hoàn tất, tài khoản vẫn được giữ lại để bạn thử lại.', [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Xóa tài khoản', style: 'destructive', onPress: async () => {
        try {
          if (typeof onDeleteAccount !== 'function') throw new Error('Dịch vụ xóa tài khoản chưa được cấu hình.');
          await onDeleteAccount();
        } catch (error) { setFeedback(error?.message || 'Không thể xóa tài khoản lúc này.'); }
      } },
    ]);
  }

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <View style={styles.header}><TouchableOpacity accessibilityRole="button" accessibilityLabel="Quay lại" style={styles.back} onPress={onBack}><Text style={styles.backText}>‹</Text></TouchableOpacity><Text accessibilityRole="header" style={styles.title}>{title}</Text><View style={styles.headerSpace} /></View>
    {screen === 'settings' && <>
      {settingsRows.map(([icon, label, route]) => <TouchableOpacity accessibilityRole="button" key={route} style={styles.menuRow} onPress={() => onNavigate?.(route)}><Text style={styles.menuIcon}>{icon}</Text><View style={styles.menuCopy}><Text style={styles.menuTitle}>{label}</Text></View><Text style={styles.arrow}>›</Text></TouchableOpacity>)}
      <View style={styles.demoBox}><Text style={styles.demoTitle}>TÀI KHOẢN</Text><Text style={styles.copy}>{account?.email || 'Đã đăng nhập'}</Text><Text style={styles.copy}>Hồ sơ cá nhân được tải từ API theo phiên đăng nhập hiện tại.</Text></View>
    </>}
    {screen === 'settings-notifications' && <>
      <SettingToggle label="Thông báo thông thường" hint="Cập nhật và nhắc nhở trong bản demo" value={toggles.general} onPress={() => toggle('general')} />
      <SettingToggle label="Âm thanh" hint="Âm báo thông báo" value={toggles.sound} onPress={() => toggle('sound')} />
      <SettingToggle label="Âm thanh gọi điện" hint="Âm báo cuộc gọi trong giao diện demo" value={toggles.calls} onPress={() => toggle('calls')} />
      <SettingToggle label="Thanh toán" hint="Thông báo giao dịch demo" value={toggles.payment} onPress={() => toggle('payment')} />
      <Text style={styles.notice}>Các lựa chọn chỉ áp dụng khi màn hình còn mở. Bản demo chưa gửi thông báo đẩy.</Text>
    </>}
    {screen === 'settings-password' && <>
      <Text style={styles.notice}>Mật khẩu được cập nhật qua dịch vụ tài khoản. Không chia sẻ mật khẩu hoặc mã xác minh.</Text>
      <TouchableOpacity accessibilityRole="button" style={styles.forgotButton} onPress={onForgotPassword}><Text style={styles.forgotText}>Quên mật khẩu?</Text></TouchableOpacity>
      <Input label="Mật khẩu mới" value={newPassword} setValue={setNewPassword} placeholder="Tối thiểu 8 ký tự" secureTextEntry />
      <Input label="Xác nhận mật khẩu mới" value={confirmPassword} setValue={setConfirmPassword} placeholder="••••••••" secureTextEntry />
      {!!feedback && <Text accessibilityRole="alert" style={styles.feedback}>{feedback}</Text>}
      <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} style={styles.primary} onPress={validatePassword}><Text style={styles.primaryText}>{busy ? 'Đang cập nhật…' : 'Đổi mật khẩu'}</Text></TouchableOpacity>
    </>}
    {screen === 'settings-phone' && <>
      <Text style={styles.notice}>Số điện thoại chỉ được dùng khôi phục sau khi mã SMS xác nhận được. Không thể dùng số chưa liên kết để vào tài khoản.</Text>
      <Text style={styles.copy}>Số đã xác minh: {phone || 'Chưa có'}</Text>
      <Input label="Số điện thoại (E.164)" value={phoneInput} setValue={setPhoneInput} placeholder="+84900123456" />
      {awaitingPhoneCode && <Input label="Mã xác nhận SMS" value={phoneCode} setValue={setPhoneCode} placeholder="Mã 6–8 chữ số" />}
      {!!feedback && <Text accessibilityRole="alert" style={styles.feedback}>{feedback}</Text>}
      <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} style={styles.primary} onPress={awaitingPhoneCode ? confirmPhoneCode : requestPhoneCode}><Text style={styles.primaryText}>{busy ? 'Đang xử lý…' : awaitingPhoneCode ? 'Xác minh số điện thoại' : phone ? 'Xác minh số mới' : 'Liên kết số điện thoại'}</Text></TouchableOpacity>
    </>}
    {screen === 'settings-delete' && <View style={styles.deleteCard}>
      <View style={styles.deleteIcon}><Text style={styles.deleteIconText}>!</Text></View>
      <Text accessibilityRole="header" style={styles.deleteHeading}>Xóa dữ liệu tài khoản</Text>
      <Text style={styles.copy}>Tài khoản: {account?.email || 'đang đăng nhập'}. Yêu cầu xóa sẽ dừng truy cập và xóa dữ liệu tài khoản qua API. Các phần xóa đang chờ được giữ để thử lại.</Text>
      {!!feedback && <Text accessibilityRole="alert" style={styles.feedback}>{feedback}</Text>}
      <TouchableOpacity accessibilityRole="button" disabled={busy} style={styles.primary} onPress={onExportAccount}><Text style={styles.primaryText}>Xuất dữ liệu của tôi</Text></TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" disabled={busy} style={[styles.primary, { backgroundColor: colors.danger }]} onPress={confirmDeleteAccount}><Text style={styles.primaryText}>Xóa tài khoản vĩnh viễn</Text></TouchableOpacity>
    </View>}
    {screen === 'settings-privacy' && <View style={styles.policy}>
      <Text style={styles.policyDate}>CẬP NHẬT · PHIÊN BẢN DEMO</Text>
      <Text style={styles.policyHeading}>Chính sách và quyền riêng tư</Text>
      <Text style={styles.policyCopy}>Nutrition Assistant là bản thử nghiệm. Không sử dụng thông tin cá nhân, hồ sơ bệnh án hoặc dữ liệu sức khỏe thật.</Text>
      <Text style={styles.policyHeading}>Dữ liệu được dùng</Text>
      <Text style={styles.policyCopy}>Khi cấu hình Supabase, tài khoản dùng dịch vụ xác thực; hồ sơ và biên nhận đồng ý được lưu theo account trên API/Postgres. Phiên đăng nhập nằm trong SecureStore. Nhật ký bữa ăn và danh sách đi chợ hiện vẫn dùng vùng dữ liệu demo riêng.</Text>
      <Text style={styles.policyHeading}>Giới hạn dịch vụ</Text>
      <Text style={styles.policyCopy}>Luồng tài khoản/hồ sơ cần cấu hình Supabase và kiểm thử RLS trên môi trường cơ sở dữ liệu. Nhật ký, đặt khám, thanh toán, chat bác sĩ và tư vấn dinh dưỡng chưa phải dịch vụ trực tuyến. Các giá trị dinh dưỡng chỉ là ước tính minh họa; danh mục hiện tại không phải dữ liệu chính thức của Viện Dinh dưỡng.</Text>
      <Text style={styles.policyHeading}>Quyền của bạn</Text>
      <Text style={styles.policyCopy}>Bạn có thể xuất danh tính, hồ sơ và biên nhận đồng ý hoặc yêu cầu xóa tài khoản trong Cài đặt. Xóa chỉ được xác nhận sau khi API hoàn tất các bước đã đăng ký. Dữ liệu demo của các module chưa chuyển đổi có vòng đời riêng.</Text>
    </View>}
    {screen === 'settings-help' && <>
      <View accessibilityRole="tablist" style={styles.helpTabs}>{[['faq', 'Hỏi đáp'], ['contact', 'Liên hệ']].map(([key, label]) => <TouchableOpacity key={key} accessibilityRole="tab" accessibilityState={{ selected: tab === key }} style={[styles.helpTab, tab === key && styles.helpTabActive]} onPress={() => setTab(key)}><Text style={[styles.helpTabText, tab === key && styles.helpTabTextActive]}>{label}</Text></TouchableOpacity>)}</View>
      {tab === 'faq' ? ['Ứng dụng có tư vấn y tế không?', 'Dữ liệu nhật ký được lưu ở đâu?', 'Dữ liệu thực phẩm có chính thức không?', 'Làm thế nào để xóa dữ liệu demo?', 'Tôi có thể đặt lịch bác sĩ trong bản demo không?'].map((question, index) => <TouchableOpacity key={question} accessibilityRole="button" accessibilityState={{ expanded: faq === index }} style={styles.faqRow} onPress={() => setFaq(faq === index ? -1 : index)}><View style={styles.faqTop}><Text style={styles.faqQuestion}>{question}</Text><Text style={styles.faqArrow}>{faq === index ? '−' : '⌄'}</Text></View>{faq === index && <Text style={styles.copy}>{[
        'Không. App chỉ cung cấp giao diện theo dõi và nội dung mẫu, không chẩn đoán hoặc điều trị.',
        'Hồ sơ demo lưu trên thiết bị; nhật ký và danh sách đi chợ sử dụng API demo.',
        'Không. Danh mục thực phẩm hiện tại chỉ phục vụ thử nghiệm.',
        'Mở Hồ sơ và chọn mục xem lại đồng ý hoặc yêu cầu xóa dữ liệu demo.',
        'Chưa. Các màn hình lịch hẹn và thanh toán chỉ là giao diện minh họa.',
      ][index]}</Text>}</TouchableOpacity>) : <View style={styles.contactCard}><Text style={styles.menuTitle}>Hỗ trợ bản demo</Text><Text style={styles.copy}>Chưa kết nối website, mạng xã hội hoặc nhân viên hỗ trợ. Bạn có thể tiếp tục khám phá các màn hình mẫu trong app.</Text></View>}
      <View style={styles.demoBox}><Text style={styles.demoTitle}>CHỈ DÙNG DỮ LIỆU TỔNG HỢP</Text><Text style={styles.copy}>Không gửi nội dung sức khỏe hoặc thông tin cá nhân qua các màn hình demo.</Text></View>
    </>}
  </ScrollView>;
}

function SettingToggle({ label, hint, value, onPress }) {
  return <TouchableOpacity accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: value }} style={styles.toggleRow} onPress={onPress}><View style={styles.toggleCopy}><Text style={styles.menuTitle}>{label}</Text><Text style={styles.menuHint}>{hint}</Text></View><View style={[styles.track, value && styles.trackOn]}><View style={[styles.thumb, value && styles.thumbOn]} /></View></TouchableOpacity>;
}
function Input({ label, value, setValue, placeholder, secureTextEntry }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={setValue} placeholder={placeholder} secureTextEntry={secureTextEntry} style={styles.input} autoCapitalize="none" /></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface }, content: { paddingHorizontal: 17, paddingTop: 12, paddingBottom: 112 },
  header: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }, back: { width: 48, height: 48, justifyContent: 'center' }, backText: { color: colors.primary, fontSize: 31 }, title: { color: colors.primary, fontSize: 20, fontWeight: '800' }, headerSpace: { width: 38 },
  menuRow: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 14, borderBottomWidth: 1, borderBottomColor: colors.border }, menuIcon: { width: 34, color: colors.primary, textAlign: 'center', fontSize: 25 }, menuCopy: { flex: 1 }, menuTitle: { color: colors.text, fontSize: 16, fontWeight: '700' }, menuHint: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 4 }, arrow: { color: colors.primary, fontSize: 27 },
  demoBox: { marginTop: 20, borderRadius: 13, padding: 16, backgroundColor: '#F2F5FD' }, demoTitle: { color: colors.primaryDark, fontSize: 13, fontWeight: '900', letterSpacing: 0.5 }, copy: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 8 },
  toggleRow: { minHeight: 82, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: colors.border }, toggleCopy: { flex: 1, paddingRight: 14 }, track: { width: 51, height: 30, borderRadius: 16, justifyContent: 'center', padding: 4, backgroundColor: '#D8DFEE' }, trackOn: { backgroundColor: colors.primary }, thumb: { width: 22, height: 22, borderRadius: 12, backgroundColor: 'white' }, thumbOn: { alignSelf: 'flex-end' }, notice: { backgroundColor: '#FFF7E6', color: colors.warning, borderRadius: 11, padding: 14, marginTop: 17, fontSize: 14, lineHeight: 21 },
  field: { marginTop: 16 }, label: { color: colors.text, fontSize: 15, fontWeight: '800', marginBottom: 8 }, input: { minHeight: 56, backgroundColor: '#EAF0FF', borderRadius: 13, paddingHorizontal: 15, color: colors.text, fontSize: 16 }, forgotButton: { minHeight: 48, alignSelf: 'flex-end', justifyContent: 'center', paddingHorizontal: 4 }, forgotText: { color: colors.primary, textDecorationLine: 'underline', fontSize: 14, fontWeight: '700' }, feedback: { color: colors.warning, fontSize: 14, lineHeight: 20, marginTop: 12 }, primary: { minHeight: 56, backgroundColor: colors.primary, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginTop: 22 }, primaryText: { color: 'white', fontSize: 16, fontWeight: '800' },
  policy: { padding: 16, backgroundColor: '#FBFCFF', borderRadius: 13 }, policyDate: { color: colors.muted, fontSize: 12, fontWeight: '800' }, policyHeading: { color: colors.primaryDark, fontSize: 17, fontWeight: '800', marginTop: 18 }, policyCopy: { color: colors.text, fontSize: 14, lineHeight: 21, marginTop: 8 },
  helpTabs: { flexDirection: 'row', gap: 8, marginBottom: 16 }, helpTab: { minHeight: 52, flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: '#E7EBF9' }, helpTabActive: { backgroundColor: colors.primary }, helpTabText: { color: colors.primaryDark, fontSize: 15, fontWeight: '700' }, helpTabTextActive: { color: 'white' }, faqRow: { minHeight: 56, paddingVertical: 15, borderBottomWidth: 1, borderColor: colors.border }, faqTop: { flexDirection: 'row', alignItems: 'center' }, faqQuestion: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '700', lineHeight: 21 }, faqArrow: { color: colors.primary, fontSize: 24 }, contactCard: { padding: 16, backgroundColor: '#F5F7FC', borderRadius: 13 },
  deleteCard: { alignItems: 'center', padding: 20, marginTop: 16, backgroundColor: '#FFFFFF', borderRadius: 18 }, deleteIcon: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#FFF1F0', alignItems: 'center', justifyContent: 'center' }, deleteIconText: { color: colors.danger, fontSize: 30, fontWeight: '900' }, deleteHeading: { color: colors.text, textAlign: 'center', fontSize: 20, fontWeight: '800', marginTop: 18 },
});
