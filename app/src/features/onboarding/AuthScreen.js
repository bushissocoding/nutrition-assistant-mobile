import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import BrandMark from './BrandMark';
import { colors } from '../../theme/tokens';

const BLUE = '#245CFF';

function maskEmail(value) {
  const [local = '', domain = ''] = value.trim().split('@');
  return `${local.slice(0, 1)}***@${domain}`;
}

export default function AuthScreen({ mode = 'login', onBack, onModeChange, onSubmit, onRecoveryRequest, onRecoveryVerify, onUpdatePassword, busy = false }) {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [method, setMethod] = useState('email');
  const [recipient, setRecipient] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const registering = mode === 'register';
  const resetting = mode === 'reset-password';

  async function submit() {
    setError('');
    setMessage('');
    if (busy) return;
    try {
      if (mode === 'forgot') {
        const value = recipient.trim();
        const validEmail = method === 'email' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
        const phone = value.replace(/[\s().-]/g, '');
        const validPhone = method === 'sms' && /^\+[1-9]\d{7,14}$/.test(phone);
        if (!validEmail && !validPhone) throw new Error(method === 'email' ? 'Nhập địa chỉ email hợp lệ.' : 'Nhập số điện thoại quốc tế hợp lệ, ví dụ +84900123456.');
        if (!onRecoveryRequest) throw new Error('Dịch vụ khôi phục chưa được cấu hình.');
        await onRecoveryRequest({ method, recipient: value });
        onModeChange?.(method === 'sms' ? 'sms-reset' : 'sent');
        return;
      }
      if (mode === 'sms-reset') {
        if (!/^\d{6,8}$/.test(code.trim())) throw new Error('Nhập mã xác nhận gồm 6–8 chữ số.');
        if (password.length < 8 || confirmPassword !== password) throw new Error('Mật khẩu cần ít nhất 8 ký tự và phải khớp xác nhận.');
        if (!onRecoveryVerify) throw new Error('Dịch vụ xác minh chưa được cấu hình.');
        await onRecoveryVerify({ phone: recipient, token: code.trim(), password, confirmPassword });
        setPassword(''); setConfirmPassword(''); setCode('');
        setMessage('Mật khẩu đã được cập nhật. Hãy đăng nhập bằng mật khẩu mới.');
        onModeChange?.('login');
        return;
      }
      if (resetting) {
        if (password.length < 8 || confirmPassword !== password) throw new Error('Mật khẩu cần ít nhất 8 ký tự và phải khớp xác nhận.');
        if (!onUpdatePassword) throw new Error('Dịch vụ cập nhật mật khẩu chưa được cấu hình.');
        await onUpdatePassword({ password, confirmPassword });
        setPassword(''); setConfirmPassword('');
        setMessage('Mật khẩu đã được cập nhật. Hãy đăng nhập lại.');
        onModeChange?.('login');
        return;
      }
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) throw new Error('Nhập địa chỉ email hợp lệ.');
      if (password.length < 8) throw new Error('Mật khẩu cần có ít nhất 8 ký tự.');
      if (registering && !/^[A-Za-z0-9_.-]{3,30}$/.test(username.trim())) throw new Error('Tên người dùng gồm 3–30 chữ cái, số hoặc . _ - .');
      if (registering && confirmPassword !== password) throw new Error('Mật khẩu xác nhận chưa khớp.');
      if (!onSubmit) throw new Error('Dịch vụ tài khoản chưa được cấu hình.');
      const result = await onSubmit({ mode: registering ? 'register' : 'login', email, username, password, confirmPassword });
      if (result?.status === 'verification-required') setMessage('Tài khoản đã được tạo. Mở email để xác minh trước khi đăng nhập.');
    } catch (submitError) { setError(submitError?.message || 'Không thể xử lý yêu cầu. Hãy thử lại sau.'); }
  }

  if (mode === 'forgot' || mode === 'sent' || mode === 'sms-reset') {
    return <ScrollView style={styles.recoveryScreen} contentContainerStyle={styles.recoveryContent} keyboardShouldPersistTaps="handled">
      <View style={styles.recoveryHero}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Quay lại" style={styles.back} onPress={mode === 'sms-reset' || mode === 'sent' ? () => onModeChange?.('login') : onBack}><Text style={styles.backText}>‹</Text></TouchableOpacity>
        <Text accessibilityRole="header" style={styles.recoveryTitle}>{mode === 'sms-reset' ? 'Xác nhận mã SMS' : mode === 'sent' ? 'Khôi phục mật khẩu' : 'Quên mật khẩu?'}</Text>
      </View>
      <View style={styles.recoveryBody}>
        {mode === 'forgot' && <>
          {[['email', 'Gửi qua email'], ['sms', 'Gửi qua SMS']].map(([key, title]) => <TouchableOpacity key={key} accessibilityRole="radio" accessibilityLabel={title} accessibilityState={{ selected: method === key }} style={[styles.methodCard, method === key && styles.methodSelected]} onPress={() => { setMethod(key); setRecipient(''); setError(''); }}><Text style={styles.methodTitle}>{title}</Text><Text style={styles.methodHint}>{key === 'sms' ? 'Chỉ dùng số đã liên kết và xác minh' : 'Nhận liên kết đặt lại mật khẩu'}</Text></TouchableOpacity>)}
        </>}
        {mode === 'sent' && <View style={styles.confirmation}>
          <Text style={styles.confirmationIcon}>✉</Text>
          <Text accessibilityRole="header" style={styles.confirmationTitle}>Đã tiếp nhận yêu cầu</Text>
          <Text style={styles.confirmationCopy}>Nếu email này khớp với một tài khoản, hướng dẫn khôi phục sẽ được gửi. Kiểm tra hộp thư và mở liên kết để đặt mật khẩu mới.</Text>
          <Text style={styles.confirmationCopy}>{maskEmail(recipient)}</Text>
          <TouchableOpacity accessibilityRole="button" disabled={busy} style={styles.primary} onPress={async () => {
            try { await onRecoveryRequest?.({ method: 'email', recipient }); setMessage('Yêu cầu gửi lại đã được tiếp nhận.'); }
            catch (submitError) { setError(submitError?.message || 'Không thể gửi lại lúc này.'); }
          }}><Text style={styles.primaryText}>{busy ? 'Đang gửi…' : 'Gửi lại hướng dẫn'}</Text></TouchableOpacity>
        </View>}
        {(mode === 'forgot' || mode === 'sms-reset') && <Field label={method === 'email' ? 'Địa chỉ email khôi phục' : 'Số điện thoại'} value={recipient} onChangeText={setRecipient} placeholder={method === 'email' ? 'name@example.com' : '+84 900 000 000'} keyboardType={method === 'email' ? 'email-address' : 'phone-pad'} editable={mode === 'forgot'} />}
        {mode === 'sms-reset' && <>
          <Field label="Mã xác nhận SMS" value={code} onChangeText={setCode} placeholder="Mã 6–8 chữ số" keyboardType="number-pad" />
          <Field label="Mật khẩu mới" value={password} onChangeText={setPassword} secureTextEntry={!showPassword} onToggleSecure={() => setShowPassword(value => !value)} placeholder="Tối thiểu 8 ký tự" />
          <Field label="Xác nhận mật khẩu mới" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry placeholder="Nhập lại mật khẩu" />
        </>}
        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        {!!message && <Text accessibilityLiveRegion="polite" style={styles.noticeText}>{message}</Text>}
        {(mode === 'forgot' || mode === 'sms-reset') && <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} style={styles.primary} onPress={submit}><Text style={styles.primaryText}>{busy ? 'Đang xử lý…' : mode === 'sms-reset' ? 'Xác nhận và đổi mật khẩu' : 'Đặt lại mật khẩu'}</Text></TouchableOpacity>}
        {mode === 'forgot' && <Text style={styles.note}>Nếu thông tin khớp tài khoản, hướng dẫn sẽ được gửi qua kênh đã chọn.</Text>}
      </View>
    </ScrollView>;
  }

  return <ScrollView style={styles.screen} contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
    <View style={styles.hero}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Quay lại" style={styles.back} onPress={onBack}><Text style={styles.backText}>‹</Text></TouchableOpacity>
      <BrandMark size={150} color="#FFFFFF" cutout={BLUE} />
      <Text accessibilityRole="header" style={styles.title}>{registering ? 'Đăng ký miễn phí!' : resetting ? 'Tạo mật khẩu mới' : 'Đăng nhập'}</Text>
    </View>
    {!resetting && <Field label="Địa chỉ email" value={email} onChangeText={setEmail} placeholder="name@example.com" keyboardType="email-address" autoCapitalize="none" />}
    {registering && <Field label="Tên người dùng" value={username} onChangeText={setUsername} placeholder="3–30 chữ cái, số, . _ -" />}
    <Field label={resetting ? 'Mật khẩu mới' : 'Mật khẩu'} value={password} onChangeText={setPassword} placeholder="Tối thiểu 8 ký tự" secureTextEntry={!showPassword} onToggleSecure={() => setShowPassword(value => !value)} />
    {(registering || resetting) && <Field label="Xác nhận mật khẩu" value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Nhập lại mật khẩu" secureTextEntry />}
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {!!message && <View accessibilityLiveRegion="polite" style={styles.notice}><Text style={styles.noticeText}>{message}</Text></View>}
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={registering ? 'Đăng ký' : resetting ? 'Lưu mật khẩu mới' : 'Đăng nhập'} accessibilityState={{ disabled: busy }} disabled={busy} style={styles.primary} onPress={submit}><Text style={styles.primaryText}>{busy ? 'Đang xử lý…' : registering ? 'Đăng ký' : resetting ? 'Lưu mật khẩu mới' : 'Đăng nhập'}</Text></TouchableOpacity>
    {!registering && !resetting && <TouchableOpacity accessibilityRole="button" style={styles.secondaryButton} onPress={() => onModeChange?.('forgot')}><Text style={styles.link}>Quên mật khẩu?</Text></TouchableOpacity>}
    {!resetting && <View style={styles.switchRow}><Text style={styles.copy}>{registering ? 'Đã có tài khoản?' : 'Chưa có tài khoản?'}</Text><TouchableOpacity accessibilityRole="button" style={styles.switchButton} onPress={() => onModeChange?.(registering ? 'login' : 'register')}><Text style={styles.switchText}>{registering ? 'Đăng nhập.' : 'Đăng ký.'}</Text></TouchableOpacity></View>}
  </ScrollView>;
}

function Field({ label, value, onChangeText, placeholder, keyboardType = 'default', secureTextEntry, onToggleSecure, autoCapitalize, editable = true }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><View style={styles.inputRow}>
    <TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} placeholder={placeholder} keyboardType={keyboardType} secureTextEntry={secureTextEntry} autoCapitalize={autoCapitalize} autoCorrect={false} editable={editable} style={styles.input} />
    {!!onToggleSecure && <TouchableOpacity accessibilityRole="button" accessibilityLabel={secureTextEntry ? 'Hiện mật khẩu' : 'Ẩn mật khẩu'} onPress={onToggleSecure} style={styles.eye}><Text>{secureTextEntry ? 'Hiện' : 'Ẩn'}</Text></TouchableOpacity>}
  </View></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, width: '100%', backgroundColor: colors.surface }, formContent: { paddingBottom: 24 },
  hero: { height: 242, backgroundColor: BLUE, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 19, marginBottom: 15 },
  back: { position: 'absolute', left: 16, top: 28, width: 48, height: 48, borderWidth: 1, borderColor: '#FFFFFF99', borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, backText: { color: 'white', fontSize: 32 }, title: { color: 'white', fontSize: 25, fontWeight: '900', marginTop: 8 },
  field: { paddingHorizontal: 16, marginTop: 11 }, label: { color: '#202A45', fontSize: 13, fontWeight: '900', marginBottom: 5 }, inputRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', borderRadius: 13, borderWidth: 1, borderColor: '#D6DFEF', backgroundColor: 'white', paddingHorizontal: 13 }, input: { flex: 1, minWidth: 0, minHeight: 52, paddingHorizontal: 7, color: '#26314F', fontSize: 15, fontWeight: '600' }, eye: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  primary: { minHeight: 54, backgroundColor: BLUE, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginHorizontal: 16, marginTop: 19, padding: 12 }, primaryText: { color: 'white', fontWeight: '900', fontSize: 15, textAlign: 'center' }, secondaryButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center' }, link: { color: BLUE, fontWeight: '900' }, switchRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }, copy: { color: '#7B879D', fontSize: 13, fontWeight: '700' }, switchButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 5 }, switchText: { color: '#7B879D', fontSize: 13, fontWeight: '900' },
  error: { color: colors.danger, fontSize: 13, marginHorizontal: 18, marginTop: 9 }, notice: { backgroundColor: '#EEF3FF', borderRadius: 12, padding: 12, marginHorizontal: 16, marginTop: 10 }, noticeText: { color: '#1747C8', fontSize: 13, lineHeight: 18, margin: 14 },
  recoveryScreen: { flex: 1, backgroundColor: '#F1F4F9' }, recoveryContent: { paddingBottom: 24 }, recoveryHero: { height: 220, backgroundColor: BLUE, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 26 }, recoveryTitle: { color: 'white', fontSize: 24, fontWeight: '900' }, recoveryBody: { paddingHorizontal: 20, paddingTop: 24 }, methodCard: { minHeight: 76, justifyContent: 'center', padding: 14, borderRadius: 18, backgroundColor: 'white', borderWidth: 1, borderColor: '#E3E9F4', marginBottom: 10 }, methodSelected: { borderColor: BLUE, borderWidth: 2 }, methodTitle: { color: '#26314F', fontWeight: '900', fontSize: 14 }, methodHint: { color: '#69768C', fontSize: 12, marginTop: 5 }, note: { color: '#69768C', textAlign: 'center', fontSize: 11, lineHeight: 17, marginTop: 12 }, confirmation: { backgroundColor: 'white', borderRadius: 20, padding: 18 }, confirmationIcon: { fontSize: 42, textAlign: 'center', color: BLUE }, confirmationTitle: { color: '#26314F', fontSize: 21, fontWeight: '900', marginTop: 10 }, confirmationCopy: { color: '#69768C', fontSize: 13, lineHeight: 20, marginTop: 9 },
});
