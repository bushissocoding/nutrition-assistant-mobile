import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors, radius } from '../../theme/tokens';

const screenCopy = {
  login: { title: 'Đăng nhập', action: 'Đăng nhập' },
  register: { title: 'Đăng ký miễn phí', action: 'Đăng ký' },
  forgot: { title: 'Quên mật khẩu?', action: 'Gửi yêu cầu demo' },
  sent: { title: 'Đã gửi yêu cầu!', action: 'Quay lại đăng nhập' },
};

export default function AuthScreen({ mode = 'login', onBack, onModeChange, onExploreDemo }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [recoveryMethod, setRecoveryMethod] = useState('email');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const copy = screenCopy[mode] || screenCopy.login;

  function submit() {
    setError('');
    if (mode === 'sent') { onModeChange?.('login'); return; }
    if (mode === 'forgot' && recoveryMethod === 'email' && !/^\S+@\S+\.\S+$/.test(email.trim())) { setError('Nhập địa chỉ email hợp lệ.'); return; }
    if (mode === 'forgot' && recoveryMethod === 'sms' && !/^\+?[0-9\s-]{9,15}$/.test(email.trim())) { setError('Nhập số điện thoại hợp lệ.'); return; }
    if (mode !== 'forgot' && !/^\S+@\S+\.\S+$/.test(email.trim())) { setError('Nhập địa chỉ email hợp lệ.'); return; }
    if (mode !== 'forgot' && password.length < 8) { setError('Mật khẩu demo cần có ít nhất 8 ký tự.'); return; }
    if (mode === 'register' && name.trim().length < 2) { setError('Nhập tên hiển thị có ít nhất 2 ký tự.'); return; }
    if (mode === 'register' && confirmPassword !== password) { setError('Mật khẩu xác nhận chưa khớp.'); return; }
    if (mode === 'forgot') {
      onModeChange?.('sent');
      return;
    }
    setMessage('Tài khoản chưa được kết nối trong bản demo. Bạn có thể tiếp tục khám phá mà không cần đăng nhập.');
  }

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <View style={styles.hero}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Quay lại" style={styles.back} onPress={onBack}><Text style={styles.backText}>‹</Text></TouchableOpacity>
      <View style={styles.mark}><View style={styles.markV} /><View style={styles.markH} /></View>
      <Text accessibilityRole="header" style={styles.title}>{copy.title}</Text>
    </View>

    {mode === 'sent' ? <View style={styles.successCard}><Text style={styles.successIcon}>✉</Text><Text style={styles.heading}>Yêu cầu chỉ hiển thị trong bản demo</Text><Text style={styles.copy}>Không có email hay tin nhắn nào được gửi. Tài khoản và khôi phục mật khẩu chưa được hỗ trợ.</Text><TouchableOpacity accessibilityRole="button" style={styles.primary} onPress={() => onModeChange?.('login')}><Text style={styles.primaryText}>{copy.action}</Text></TouchableOpacity></View> : <>
      {mode === 'register' && <Field label="Tên hiển thị" value={name} onChangeText={setName} placeholder="Nhập tên hiển thị" />}
      {mode === 'forgot' && <View accessibilityRole="radiogroup" accessibilityLabel="Chọn cách khôi phục" style={styles.recoveryOptions}>{[['email', '✉', 'Gửi qua email'], ['sms', '▣', 'Gửi qua SMS']].map(([key, icon, label]) => <TouchableOpacity key={key} accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ selected: recoveryMethod === key }} style={[styles.recoveryCard, recoveryMethod === key && styles.recoverySelected]} onPress={() => { setRecoveryMethod(key); setEmail(''); setError(''); }}><Text style={[styles.recoveryIcon, recoveryMethod === key && styles.link]}>{icon}</Text><View style={{ flex: 1 }}><Text style={styles.recoveryTitle}>{label}</Text><Text style={styles.recoveryHint}>Lấy lại mật khẩu qua {key === 'email' ? 'email' : 'tin nhắn'}</Text></View><Text style={styles.link}>{recoveryMethod === key ? '›' : '›'}</Text></TouchableOpacity>)}</View>}
      <Field label={mode === 'forgot' && recoveryMethod === 'sms' ? 'Số điện thoại' : 'Địa chỉ email'} value={email} onChangeText={setEmail} placeholder={mode === 'forgot' && recoveryMethod === 'sms' ? '+84 900 000 000' : 'name@example.com'} keyboardType={mode === 'forgot' && recoveryMethod === 'sms' ? 'phone-pad' : 'email-address'} autoCapitalize="none" />
      {mode !== 'forgot' && <>
        <Field label="Mật khẩu" value={password} onChangeText={setPassword} placeholder="Tối thiểu 8 ký tự" secureTextEntry />
        {mode === 'register' && <Field label="Xác nhận mật khẩu" value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Nhập lại mật khẩu" secureTextEntry />}
      </>}
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {!!message && <View accessibilityLiveRegion="polite" style={styles.notice}><Text style={styles.noticeText}>{message}</Text></View>}
      <TouchableOpacity accessibilityRole="button" style={styles.primary} onPress={submit}><Text style={styles.primaryText}>{copy.action}</Text></TouchableOpacity>
      {mode === 'login' && <TouchableOpacity accessibilityRole="button" style={styles.linkButton} onPress={() => onModeChange?.('forgot')}><Text style={styles.link}>Quên mật khẩu?</Text></TouchableOpacity>}
      {mode === 'register' && <Text style={styles.terms}>Bằng việc tiếp tục, bạn xác nhận đã đọc chính sách và điều khoản của bản demo.</Text>}
    </>}

    <View style={styles.switchRow}>
      {mode === 'login' && <Text style={styles.copy}>Chưa có tài khoản?</Text>}
      {mode === 'login' && <TouchableOpacity accessibilityRole="button" onPress={() => onModeChange?.('register')} style={{ minWidth: 48, minHeight: 48, justifyContent: "center", alignItems: "center" }}><Text style={styles.link}> Đăng ký</Text></TouchableOpacity>}
      {mode === 'register' && <Text style={styles.copy}>Đã có tài khoản?</Text>}
      {mode === 'register' && <TouchableOpacity accessibilityRole="button" onPress={() => onModeChange?.('login')} style={{ minWidth: 48, minHeight: 48, justifyContent: "center", alignItems: "center" }}><Text style={styles.link}> Đăng nhập</Text></TouchableOpacity>}
    </View>
    <View style={styles.demoBox}><Text style={styles.demoTitle}>BẢN DEMO · KHÔNG CÓ XÁC THỰC</Text><Text style={styles.demoCopy}>Không lưu mật khẩu, không tạo tài khoản và không gửi yêu cầu đến máy chủ.</Text>
      <TouchableOpacity accessibilityRole="button" style={styles.demoButton} onPress={onExploreDemo}><Text style={styles.demoButtonText}>Tiếp tục không cần tài khoản</Text></TouchableOpacity>
    </View>
  </ScrollView>;
}

function Field({ label, value, onChangeText, placeholder, keyboardType, secureTextEntry, autoCapitalize }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} placeholder={placeholder} keyboardType={keyboardType} secureTextEntry={secureTextEntry} autoCapitalize={autoCapitalize} autoCorrect={false} style={styles.input} /></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface }, content: { paddingBottom: 28 },
  hero: { minHeight: 200, backgroundColor: colors.primary, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 20 },
  back: { position: 'absolute', left: 18, top: 16, width: 48, height: 48, borderWidth: 1, borderColor: '#FFFFFF88', borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, backText: { color: 'white', fontSize: 32, lineHeight: 34 },
  mark: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', marginBottom: 8 }, markV: { position: 'absolute', width: 14, height: 38, borderRadius: 8, backgroundColor: 'white' }, markH: { position: 'absolute', width: 38, height: 14, borderRadius: 8, backgroundColor: 'white' },
  title: { color: 'white', fontSize: 23, fontWeight: '800' },
  field: { paddingHorizontal: 22, marginTop: 16 }, label: { color: colors.text, fontSize: 13, fontWeight: '800', marginBottom: 6 }, input: { minHeight: 48, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: '#C8D6F4', backgroundColor: '#F8FAFF', color: colors.text, fontSize: 15 },
  recoveryOptions: { gap: 8, paddingHorizontal: 22, marginTop: 16 }, recoveryCard: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 11, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: 'white' }, recoverySelected: { borderColor: colors.primary, backgroundColor: '#F7F9FF' }, recoveryIcon: { color: colors.muted, fontSize: 19 }, recoveryTitle: { color: colors.text, fontSize: 12, fontWeight: '800' }, recoveryHint: { color: colors.muted, fontSize: 10, marginTop: 3 },
  primary: { minHeight: 48, backgroundColor: colors.primary, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginHorizontal: 22, marginTop: 20 }, primaryText: { color: 'white', fontWeight: '800', fontSize: 14 },
  linkButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center' }, link: { color: colors.primary, fontSize: 13, fontWeight: '800' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 11 }, copy: { color: colors.muted, fontSize: 13, lineHeight: 19 }, terms: { color: colors.muted, fontSize: 11, lineHeight: 16, textAlign: 'center', marginHorizontal: 24, marginTop: 12 },
  error: { color: colors.danger, fontSize: 13, marginHorizontal: 22, marginTop: 8 }, notice: { backgroundColor: '#EAF0FF', borderRadius: 12, padding: 12, marginHorizontal: 22, marginTop: 12 }, noticeText: { color: colors.primaryDark, fontSize: 13, lineHeight: 18 },
  successCard: { margin: 22, marginTop: 28, backgroundColor: '#F8FAFF', borderRadius: 18, padding: 18, alignItems: 'center' }, successIcon: { color: colors.primary, fontSize: 40, marginBottom: 9 }, heading: { color: colors.text, fontSize: 17, fontWeight: '800', textAlign: 'center' },
  demoBox: { margin: 22, marginTop: 22, padding: 13, borderRadius: 13, backgroundColor: '#F3F6FD', alignItems: 'center' }, demoTitle: { color: colors.primaryDark, fontSize: 11, letterSpacing: 0.4, fontWeight: '900' }, demoCopy: { color: colors.muted, textAlign: 'center', fontSize: 11, lineHeight: 16, marginTop: 5 }, demoButton: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 12 }, demoButtonText: { color: colors.primary, fontSize: 12, fontWeight: '800' },
});
