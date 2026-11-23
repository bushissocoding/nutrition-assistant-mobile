import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import BrandMark from './BrandMark';
import { colors } from '../../theme/tokens';

const BLUE = '#245CFF';

function maskRecoveryRecipient(method, recipient) {
  const value = recipient.trim();
  if (method === 'email') {
    const [local, domain] = value.split('@');
    return `${local.slice(0, 1)}***@${domain}`;
  }
  const countryCode = value.match(/^\+(\d{1,3})/)?.[1];
  const lastDigits = value.replace(/\D/g, '').slice(-2);
  return `${countryCode ? `+${countryCode} ` : ''}••• ••• ${lastDigits}`;
}

export default function AuthScreen({ mode = 'login', onBack, onModeChange, onExploreDemo }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [recoveryMethod, setRecoveryMethod] = useState('email');
  const [recoveryRecipient, setRecoveryRecipient] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [resendMessage, setResendMessage] = useState('');

  function submit() {
    setError('');
    if (mode === 'forgot') {
      const recipient = recoveryRecipient.trim();
      const validEmail = recoveryMethod === 'email' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient);
      const normalizedPhone = recipient.replace(/[\s().-]/g, '');
      const phoneDigits = normalizedPhone.replace(/\D/g, '');
      const validPhone = recoveryMethod === 'sms' && /^\+?\d+$/.test(normalizedPhone) && phoneDigits.length >= 7 && phoneDigits.length <= 15;
      if (recoveryMethod === 'email' && !validEmail) { setError('Nhập địa chỉ email hợp lệ.'); return; }
      if (recoveryMethod === 'sms' && !validPhone) { setError('Nhập số điện thoại hợp lệ.'); return; }
      onModeChange?.('sent');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setError('Nhập địa chỉ email hợp lệ.'); return; }
    if (password.length < 8) { setError('Mật khẩu demo cần có ít nhất 8 ký tự.'); return; }
    if (mode === 'register' && name.trim().length < 2) { setError('Nhập tên hiển thị có ít nhất 2 ký tự.'); return; }
    if (mode === 'register' && confirmPassword !== password) { setError('Mật khẩu xác nhận chưa khớp.'); return; }
    setMessage('Tài khoản chưa được kết nối trong bản demo. Không có thông tin đăng nhập nào được lưu.');
  }

  if (mode === 'forgot' || mode === 'sent') {
    return <View style={styles.recoveryScreen}>
      <View style={styles.recoveryHero}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Quay lại" style={styles.recoveryBack} onPress={mode === 'sent' ? () => onModeChange?.('forgot') : onBack}><Text style={styles.recoveryBackText}>‹</Text></TouchableOpacity>
        <Text accessibilityRole="header" style={styles.recoveryTitle}>Quên mật khẩu?</Text>
      </View>
      <View style={styles.recoveryBody}>
        {[
          ['email', '✉', 'Gửi qua email', 'Đặt lại mật khẩu qua email'],
          ['sms', '▣', 'Gửi qua SMS', 'Đặt lại mật khẩu qua SMS'],
        ].map(([key, icon, label, hint]) => <TouchableOpacity
          key={key}
          accessibilityRole="radio"
          accessibilityLabel={label}
          accessibilityState={{ selected: recoveryMethod === key, disabled: mode === 'sent' }}
          disabled={mode === 'sent'}
          style={[styles.recoveryCard, recoveryMethod === key && styles.recoverySelected]}
          onPress={() => { setRecoveryMethod(key); setRecoveryRecipient(''); setError(''); setResendMessage(''); }}
        >
          <View style={[styles.recoveryIconBox, recoveryMethod === key && styles.recoveryIconSelected]}><Text style={[styles.recoveryIcon, recoveryMethod === key && styles.link]}>{icon}</Text></View>
          <View style={styles.recoveryCopy}><Text style={styles.recoveryHeading}>{label}</Text><Text style={styles.recoveryHint}>{hint}</Text></View>
          <Text style={[styles.recoveryArrow, recoveryMethod === key && styles.link]}>›</Text>
        </TouchableOpacity>)}
        <Field
          label={recoveryMethod === 'email' ? 'Địa chỉ email khôi phục' : 'Số điện thoại'}
          icon={recoveryMethod === 'email' ? '✉' : '▣'}
          value={recoveryRecipient}
          onChangeText={value => { setRecoveryRecipient(value); setError(''); }}
          placeholder={recoveryMethod === 'email' ? 'name@example.com' : '+84 900 000 000'}
          keyboardType={recoveryMethod === 'email' ? 'email-address' : 'phone-pad'}
          autoCapitalize="none"
        />
        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: mode === 'sent' }} disabled={mode === 'sent'} style={styles.primary} onPress={submit}><Text style={styles.primaryText}>Đặt lại mật khẩu　▣</Text></TouchableOpacity>
        <Text style={styles.recoveryNote}>Bản demo · Không gửi email hoặc tin nhắn thật</Text>
      </View>
      {mode === 'sent' && <View style={styles.modalOverlay}>
        <View style={styles.confirmation}>
          <View style={styles.confirmationArt}>
            <View style={styles.phoneOutline}><View style={styles.phoneTop}><View style={styles.phoneDot} /><View style={styles.phoneDot} /><View style={styles.phoneDot} /></View><View style={styles.lockCircle}><Text style={styles.lockGlyph}>▣</Text></View></View>
          </View>
          <Text accessibilityRole="header" style={styles.confirmationTitle}>Đã gửi yêu cầu!</Text>
          <Text style={styles.confirmationCopy}>{recoveryMethod === 'email' ? 'Yêu cầu đặt lại mật khẩu đã được ghi nhận trong bản demo.' : 'Yêu cầu qua SMS đã được ghi nhận trong bản demo.'} Không có email hoặc tin nhắn nào được gửi.</Text>
          <Text style={styles.maskedRecipient}>{maskRecoveryRecipient(recoveryMethod, recoveryRecipient)}</Text>
          <TouchableOpacity accessibilityRole="button" style={styles.confirmationButton} onPress={() => setResendMessage('Bản demo không gửi mã xác nhận.') }><Text style={styles.primaryText}>Gửi lại mã　›</Text></TouchableOpacity>
          {!!resendMessage && <Text accessibilityLiveRegion="polite" style={styles.resendMessage}>{resendMessage}</Text>}
        </View>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Đóng xác nhận" style={styles.closeButton} onPress={() => onModeChange?.('login')}><Text style={styles.closeText}>×</Text></TouchableOpacity>
      </View>}
    </View>;
  }

  const registering = mode === 'register';
  return <ScrollView style={styles.screen} contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
    <View style={styles.hero}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Quay lại" style={styles.back} onPress={onBack}><Text style={styles.backText}>‹</Text></TouchableOpacity>
      <BrandMark size={150} color="#FFFFFF" cutout={BLUE} />
      <Text accessibilityRole="header" style={styles.title}>{registering ? 'Đăng ký miễn phí!' : 'Đăng nhập'}</Text>
    </View>

    <Field label="Địa chỉ email" icon="✉" value={email} onChangeText={setEmail} placeholder={registering ? 'Nhập địa chỉ email…' : 'nguoibenh@example.com'} keyboardType="email-address" autoCapitalize="none" />
    {registering && <Field label="Tên người dùng" icon="♙" value={name} onChangeText={setName} placeholder="Tên người dùng" />}
    <Field label="Mật khẩu" icon="▣" value={password} onChangeText={setPassword} placeholder="Tối thiểu 8 ký tự" secureTextEntry={!showPassword} onToggleSecure={() => setShowPassword(value => !value)} />
    {registering && <Field label="Xác nhận mật khẩu" icon="▣" value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Nhập lại mật khẩu" secureTextEntry={!showConfirmPassword} onToggleSecure={() => setShowConfirmPassword(value => !value)} />}
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {!!message && <View accessibilityLiveRegion="polite" style={styles.notice}><Text style={styles.noticeText}>{message}</Text></View>}
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={registering ? 'Đăng ký' : 'Đăng nhập'} style={styles.primary} onPress={submit}><Text style={styles.primaryText}>{registering ? 'Đăng ký　＋' : 'Đăng nhập　＋'}</Text></TouchableOpacity>
    {!registering && <TouchableOpacity accessibilityRole="button" style={styles.forgotButton} onPress={() => onModeChange?.('forgot')}><Text style={styles.link}>Quên mật khẩu?</Text></TouchableOpacity>}
    <View style={styles.switchRow}>
      <Text style={styles.copy}>{registering ? 'Đã có tài khoản?' : 'Chưa có tài khoản?'}</Text>
      <TouchableOpacity accessibilityRole="button" style={styles.switchButton} onPress={() => onModeChange?.(registering ? 'login' : 'register')}><Text style={styles.switchText}>{registering ? 'Đăng nhập.' : 'Đăng ký.'}</Text></TouchableOpacity>
    </View>
    <Text style={styles.demoCaption}>Bản demo · Không lưu mật khẩu hoặc tạo tài khoản.</Text>
    {!!onExploreDemo && <TouchableOpacity accessibilityRole="button" style={styles.demoButton} onPress={onExploreDemo}><Text style={styles.demoButtonText}>Tiếp tục không cần tài khoản</Text></TouchableOpacity>}
  </ScrollView>;
}

function Field({ label, icon, value, onChangeText, placeholder, keyboardType = 'default', secureTextEntry, onToggleSecure, autoCapitalize }) {
  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <View style={styles.inputRow}>
      <Text style={styles.fieldIcon} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{icon}</Text>
      <TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} placeholder={placeholder} keyboardType={keyboardType} secureTextEntry={secureTextEntry} autoCapitalize={autoCapitalize} autoCorrect={false} style={styles.input} />
      {!!onToggleSecure && <TouchableOpacity accessibilityRole="button" accessibilityLabel={secureTextEntry ? 'Hiện mật khẩu' : 'Ẩn mật khẩu'} style={styles.eyeButton} onPress={onToggleSecure}><Text style={styles.eye}>◉</Text></TouchableOpacity>}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, width: '100%', backgroundColor: colors.surface },
  formContent: { width: '100%', paddingBottom: 18 },
  hero: { height: 242, width: '100%', backgroundColor: BLUE, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 19, marginBottom: 15 },
  back: { position: 'absolute', left: 16, top: 28, width: 48, height: 48, borderWidth: 1, borderColor: '#FFFFFF99', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  backText: { color: 'white', fontSize: 32, lineHeight: 34 },
  title: { color: 'white', fontSize: 25, fontWeight: '900', marginTop: 8 },
  field: { paddingHorizontal: 16, marginTop: 11 },
  label: { color: '#202A45', fontSize: 13, fontWeight: '900', marginBottom: 5 },
  inputRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', borderRadius: 13, borderWidth: 1, borderColor: '#D6DFEF', backgroundColor: '#FFFFFF', paddingHorizontal: 13 },
  fieldIcon: { width: 28, color: '#26314F', fontSize: 20, fontWeight: '700' },
  input: { flex: 1, minWidth: 0, minHeight: 52, paddingHorizontal: 7, color: '#26314F', fontSize: 15, fontWeight: '600' },
  eyeButton: { minWidth: 44, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  eye: { color: '#AEB8C9', fontSize: 21 },
  primary: { minHeight: 56, backgroundColor: BLUE, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginHorizontal: 16, marginTop: 19 },
  primaryText: { color: 'white', fontWeight: '900', fontSize: 15 },
  forgotButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-end', paddingHorizontal: 18 },
  link: { color: BLUE, fontSize: 14, fontWeight: '900' },
  switchRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  copy: { color: '#7B879D', fontSize: 13, fontWeight: '700' },
  switchButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 5 },
  switchText: { color: '#7B879D', fontSize: 13, fontWeight: '900' },
  demoCaption: { color: '#7B879D', fontSize: 10, textAlign: 'center', marginTop: 8 },
  demoButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  demoButtonText: { color: BLUE, fontSize: 12, fontWeight: '900' },
  error: { color: colors.danger, fontSize: 13, marginHorizontal: 18, marginTop: 9 },
  notice: { backgroundColor: '#EEF3FF', borderRadius: 12, padding: 12, marginHorizontal: 16, marginTop: 10 },
  noticeText: { color: '#1747C8', fontSize: 13, lineHeight: 18 },
  recoveryScreen: { flex: 1, width: '100%', backgroundColor: '#F1F4F9' },
  recoveryHero: { height: 242, backgroundColor: BLUE, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 26 },
  recoveryBack: { position: 'absolute', top: 64, left: 16, minWidth: 48, minHeight: 48, borderColor: '#FFFFFF99', borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  recoveryBackText: { color: 'white', fontSize: 32, lineHeight: 34 },
  recoveryTitle: { color: 'white', fontSize: 25, fontWeight: '900' },
  recoveryBody: { paddingHorizontal: 24, paddingTop: 31 },
  recoveryCard: { minHeight: 88, flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 22, borderWidth: 1, borderColor: '#FFFFFF', backgroundColor: 'white', marginBottom: 10 },
  recoverySelected: { borderColor: BLUE, borderWidth: 2, shadowColor: BLUE, shadowOpacity: 0.17, shadowRadius: 5, elevation: 2 },
  recoveryIconBox: { width: 64, height: 64, borderRadius: 14, backgroundColor: '#F0F3F9', alignItems: 'center', justifyContent: 'center' },
  recoveryIconSelected: { backgroundColor: '#EAF0FF' },
  recoveryIcon: { color: '#69768C', fontSize: 23 },
  recoveryCopy: { flex: 1, paddingHorizontal: 12 },
  recoveryHeading: { color: '#26314F', fontSize: 14, fontWeight: '900' },
  recoveryHint: { color: '#69768C', fontSize: 12, lineHeight: 18, marginTop: 4 },
  recoveryArrow: { color: '#B8C1D0', fontSize: 28, paddingHorizontal: 3 },
  recoveryNote: { color: '#69768C', fontSize: 10, textAlign: 'center', marginTop: 12 },
  modalOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: '#111B3BCC', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  confirmation: { width: '100%', maxWidth: 390, backgroundColor: 'white', borderRadius: 24, padding: 16 },
  confirmationArt: { height: 238, borderRadius: 17, backgroundColor: '#F1F4F9', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  phoneOutline: { width: 180, height: 280, borderRadius: 28, backgroundColor: '#D9E0E9', borderWidth: 9, borderColor: '#26314F', transform: [{ rotate: '-14deg' }], alignItems: 'center' },
  phoneTop: { width: '100%', height: 34, flexDirection: 'row', gap: 8, alignItems: 'center', paddingHorizontal: 12 },
  phoneDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'white' },
  lockCircle: { width: 130, height: 130, borderRadius: 65, backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center', marginTop: 22 },
  lockGlyph: { color: 'white', fontSize: 57, fontWeight: '900' },
  confirmationTitle: { color: '#26314F', fontSize: 25, fontWeight: '900', marginTop: 20 },
  confirmationCopy: { color: '#69768C', fontSize: 13, lineHeight: 21, marginTop: 7 },
  maskedRecipient: { color: '#69768C', fontSize: 13, fontWeight: '700', marginTop: 5 },
  confirmationButton: { minHeight: 56, backgroundColor: BLUE, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 17 },
  resendMessage: { color: '#1747C8', fontSize: 11, marginTop: 8 },
  closeButton: { position: 'absolute', bottom: -56, width: 54, height: 54, borderRadius: 14, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center' },
  closeText: { color: '#26314F', fontSize: 33, lineHeight: 36 },
});
