import { useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors, radius } from '../../theme/tokens';
import { api } from '../../services/api';
import { registerPushDevice } from '../../services/push-notifications';

const defaultNotificationPreferences = { inAppAppointments: true, inAppPayments: true, inAppMessages: true, pushEnabled: false, pushAppointments: true, pushPayments: true, pushMessages: true };
const notificationPreferenceKeys = Object.keys(defaultNotificationPreferences);
const helpCategories = [['popular', 'Phổ biến'], ['common', 'Chung'], ['services', 'Dịch vụ']];
const helpQuestions = [
  { category: 'popular', question: 'Ứng dụng gợi ý thực đơn dựa trên những tiêu chí nào?', answer: 'Ứng dụng dùng lựa chọn và thông tin bạn nhập để đưa ra gợi ý tham khảo. Giá trị dinh dưỡng là ước tính, không phải chỉ định điều trị.' },
  { category: 'popular', question: 'Ứng dụng có tư vấn y tế không?', answer: 'Không. Ứng dụng theo dõi thông tin do bạn nhập và cung cấp gợi ý tham khảo; không chẩn đoán hoặc điều trị.' },
  { category: 'popular', question: 'Trợ lý ảo AI có thể thay thế hoàn toàn bác sĩ dinh dưỡng không?', answer: 'Không. Trợ lý AI không thay thế bác sĩ hoặc chuyên gia dinh dưỡng. Hãy trao đổi với nhân viên y tế về quyết định chăm sóc sức khỏe.' },
  { category: 'popular', question: 'Dữ liệu sức khỏe và nhật ký bữa ăn của tôi có được bảo mật không?', answer: 'Đây là bản mẫu thử nghiệm, chưa được phê duyệt cho dữ liệu sức khỏe thật và chưa có kiểm toán bảo mật. Chỉ sử dụng dữ liệu tổng hợp.' },
  { category: 'common', question: 'Dữ liệu nhật ký được lưu ở đâu?', answer: 'Khi dịch vụ tài khoản được cấu hình, nhật ký được lưu theo tài khoản qua API và cơ sở dữ liệu của đơn vị vận hành.' },
  { category: 'common', question: 'Dữ liệu thực phẩm có chính thức không?', answer: 'Không. Tra cứu có thể dùng nguồn USDA FoodData Central khi được cấu hình; dữ liệu không đại diện cho cơ sở dữ liệu chính thức của Viện Dinh dưỡng Việt Nam.' },
  { category: 'common', question: 'Làm thế nào để xuất hoặc xóa dữ liệu?', answer: 'Mở Cài đặt tài khoản, chọn xuất dữ liệu hoặc yêu cầu xóa. API chỉ xác nhận xóa sau khi các bước dọn dữ liệu hoàn tất.' },
  { category: 'common', question: 'Làm sao cập nhật tình trạng bệnh lý hoặc dị ứng thực phẩm?', answer: 'Mở hồ sơ cá nhân và chọn chỉnh sửa hồ sơ để cập nhật thông tin bạn đã nhập.' },
  { category: 'services', question: 'Tôi có thể đặt lịch với nhà cung cấp không?', answer: 'Có, nếu có nhà cung cấp đã xác minh và dịch vụ được cấu hình. Lịch chỉ xác nhận sau khi máy chủ nhận webhook thanh toán hợp lệ.' },
  { category: 'services', question: 'Tôi có thể đổi món khác nếu không thích hoặc không mua được nguyên liệu không?', answer: 'Bạn có thể thay đổi lựa chọn và tạo lại gợi ý. Hãy tự kiểm tra thành phần, nguồn thực phẩm và dị ứng trước khi sử dụng.' },
  { category: 'services', question: 'Tôi có thể chụp ảnh kết quả xét nghiệm không?', answer: 'Ứng dụng có thể nhận ảnh để trích xuất văn bản trên thiết bị khi tính năng được hỗ trợ, nhưng không diễn giải hoặc đánh giá kết quả.' },
];

const settingsRows = [
  ['♧', 'Cài đặt thông báo', 'settings-notifications', ''],
  ['⚿', 'Quản lý mật khẩu', 'settings-password', ''],
  ['☎', 'Số điện thoại khôi phục', 'settings-phone', ''],
  ['♙', 'Xóa tài khoản', 'settings-delete', ''],
];

export default function SettingsScreen({ screen = 'settings', account, phone, busy = false, onNavigate, onBack, onForgotPassword, onUpdatePassword, onRequestPhoneLink, onVerifyPhoneLink, onDeleteAccount, onExportAccount }) {
  const [notificationPreferences, setNotificationPreferences] = useState(defaultNotificationPreferences);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationBusy, setNotificationBusy] = useState('');
  const [notificationError, setNotificationError] = useState('');
  const notificationRequest = useRef(0);
  const [phoneInput, setPhoneInput] = useState(phone || '');
  const [phoneCode, setPhoneCode] = useState('');
  const [awaitingPhoneCode, setAwaitingPhoneCode] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [feedback, setFeedback] = useState('');
  const [faq, setFaq] = useState(-1);
  const [tab, setTab] = useState('faq');
  const [faqCategory, setFaqCategory] = useState('popular');
  const [faqSearch, setFaqSearch] = useState('');
  const [expandedContact, setExpandedContact] = useState('');
  const title = ({ settings: 'Cài đặt', 'settings-notifications': 'Cài đặt thông báo', 'settings-password': 'Quản lý mật khẩu', 'settings-phone': 'Số điện thoại khôi phục', 'settings-delete': 'Xóa tài khoản', 'settings-privacy': 'Chính sách và quyền riêng tư', 'settings-help': 'Trung tâm hỗ trợ' })[screen] || 'Cài đặt';
  const visibleHelpQuestions = helpQuestions.filter(item => {
    const matchesCategory = faqCategory === 'popular' ? item.category === 'popular' : item.category === faqCategory;
    const searchContent = `${item.question} ${item.answer}`.toLocaleLowerCase('vi');
    return matchesCategory && searchContent.includes(faqSearch.trim().toLocaleLowerCase('vi'));
  });

  useEffect(() => {
    if (screen !== 'settings-notifications' || !account?.id) return undefined;
    const requestId = ++notificationRequest.current;
    setNotificationLoading(true); setNotificationError('');
    api.getMyNotificationPreferences().then(result => {
      if (notificationRequest.current === requestId) setNotificationPreferences({ ...defaultNotificationPreferences, ...result?.preferences });
    }).catch(error => {
      if (notificationRequest.current === requestId) setNotificationError(error?.message || 'Không tải được tùy chọn thông báo.');
    }).finally(() => { if (notificationRequest.current === requestId) setNotificationLoading(false); });
    return () => { notificationRequest.current += 1; };
  }, [screen, account?.id]);

  async function updateNotificationPreference(key, nextValue) {
    if (!account?.id || notificationLoading || notificationBusy) return;
    const next = Object.fromEntries(notificationPreferenceKeys.map(preferenceKey => [preferenceKey, preferenceKey === key ? nextValue : notificationPreferences[preferenceKey]]));
    setNotificationBusy(key); setNotificationError('');
    try {
      const saved = await api.saveMyNotificationPreferences(next);
      setNotificationPreferences({ ...defaultNotificationPreferences, ...saved?.preferences });
      if (key === 'pushEnabled' && nextValue) {
        try { await registerPushDevice({ api, userId: account.id }); }
        catch (error) {
          const disabled = { ...next, pushEnabled: false };
          const rollback = await api.saveMyNotificationPreferences(disabled);
          setNotificationPreferences({ ...defaultNotificationPreferences, ...rollback?.preferences });
          throw error;
        }
      }
    } catch (error) { setNotificationError(error?.message || 'Không lưu được tùy chọn thông báo.'); }
    finally { setNotificationBusy(''); }
  }
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

  return <ScrollView style={styles.screen} contentContainerStyle={screen === 'settings-help' ? styles.helpContent : styles.content} keyboardShouldPersistTaps="handled">
    {screen === 'settings-help' ? <View style={styles.helpHero}>
      <View style={styles.helpHeroTop}><TouchableOpacity accessibilityRole="button" accessibilityLabel="Quay lại" style={styles.helpBack} onPress={onBack}><Text style={styles.helpBackText}>‹</Text></TouchableOpacity><Text accessibilityRole="header" style={styles.helpTitle}>Trung Tâm Hỗ Trợ</Text><View style={styles.helpHeaderSpace} /></View>
      <View style={styles.helpSearch}><Text style={styles.helpSearchIcon}>⌕</Text><TextInput accessibilityLabel="Tìm kiếm trợ giúp" value={faqSearch} onChangeText={setFaqSearch} placeholder="Tìm kiếm..." placeholderTextColor="#B5C9FF" style={styles.helpSearchInput} returnKeyType="search" /></View>
    </View> : <View style={styles.header}><TouchableOpacity accessibilityRole="button" accessibilityLabel="Quay lại" style={styles.back} onPress={onBack}><Text style={styles.backText}>‹</Text></TouchableOpacity><Text accessibilityRole="header" style={styles.title}>{title}</Text><View style={styles.headerSpace} /></View>}
    {screen === 'settings' && <>
      {settingsRows.map(([icon, label, route]) => <TouchableOpacity accessibilityRole="button" key={route} style={styles.menuRow} onPress={() => onNavigate?.(route)}><Text style={styles.menuIcon}>{icon}</Text><View style={styles.menuCopy}><Text style={styles.menuTitle}>{label}</Text></View><Text style={styles.arrow}>›</Text></TouchableOpacity>)}
      <View style={styles.demoBox}><Text style={styles.demoTitle}>TÀI KHOẢN</Text><Text style={styles.copy}>{account?.email || 'Đã đăng nhập'}</Text><Text style={styles.copy}>Hồ sơ cá nhân được tải từ API theo phiên đăng nhập hiện tại.</Text></View>
    </>}
    {screen === 'settings-notifications' && <>
      {!account?.id ? <View style={styles.notice}><Text>Hãy đăng nhập để quản lý tùy chọn thông báo theo tài khoản.</Text></View> : <>
        {notificationLoading && <Text accessibilityRole="text" style={styles.copy}>Đang tải tùy chọn đã lưu…</Text>}
        {!!notificationError && <Text accessibilityRole="alert" style={styles.feedback}>{notificationError}</Text>}
        <Text style={styles.sectionHeading}>Thông báo trong ứng dụng</Text>
        <SettingToggle label="Lịch hẹn" hint="Yêu cầu, xác nhận và thay đổi lịch hẹn" value={notificationPreferences.inAppAppointments} disabled={notificationLoading || !!notificationBusy} onPress={() => updateNotificationPreference('inAppAppointments', !notificationPreferences.inAppAppointments)} />
        <SettingToggle label="Thanh toán" hint="Trạng thái thanh toán lịch khám" value={notificationPreferences.inAppPayments} disabled={notificationLoading || !!notificationBusy} onPress={() => updateNotificationPreference('inAppPayments', !notificationPreferences.inAppPayments)} />
        <SettingToggle label="Tin nhắn bác sĩ" hint="Thông báo khi có tin nhắn mới trong hội thoại lịch hẹn" value={notificationPreferences.inAppMessages} disabled={notificationLoading || !!notificationBusy} onPress={() => updateNotificationPreference('inAppMessages', !notificationPreferences.inAppMessages)} />
        <Text style={styles.sectionHeading}>Thông báo đẩy</Text>
        <SettingToggle label="Gửi tới thiết bị này" hint="Chỉ bật sau khi bạn đồng ý quyền thông báo của hệ điều hành. Nội dung đẩy luôn ở dạng chung." value={notificationPreferences.pushEnabled} disabled={notificationLoading || !!notificationBusy} onPress={() => updateNotificationPreference('pushEnabled', !notificationPreferences.pushEnabled)} />
        {notificationPreferences.pushEnabled && <>
          <SettingToggle label="Lịch hẹn qua push" hint="Thông báo chung khi lịch hẹn có thay đổi" value={notificationPreferences.pushAppointments} disabled={notificationLoading || !!notificationBusy} onPress={() => updateNotificationPreference('pushAppointments', !notificationPreferences.pushAppointments)} />
          <SettingToggle label="Thanh toán qua push" hint="Thông báo chung khi trạng thái thanh toán thay đổi" value={notificationPreferences.pushPayments} disabled={notificationLoading || !!notificationBusy} onPress={() => updateNotificationPreference('pushPayments', !notificationPreferences.pushPayments)} />
          <SettingToggle label="Tin nhắn qua push" hint="Thông báo chung khi có tin nhắn mới" value={notificationPreferences.pushMessages} disabled={notificationLoading || !!notificationBusy} onPress={() => updateNotificationPreference('pushMessages', !notificationPreferences.pushMessages)} />
        </>}
        <Text style={styles.notice}>Thông báo đẩy cần ứng dụng iOS/Android đã cài, EAS Project ID, quyền hệ điều hành và dịch vụ push phía máy chủ. Khi dịch vụ chưa sẵn sàng, trạng thái lịch sử trong ứng dụng vẫn hoạt động.</Text>
      </>}
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
      <Text style={styles.policyDate}>THÔNG TIN DỊCH VỤ · V1</Text>
      <Text style={styles.policyHeading}>Chính sách và quyền riêng tư</Text>
      <Text style={styles.policyCopy}>Ứng dụng chưa được phê duyệt để xử lý dữ liệu sức khỏe thật hoặc dùng như dịch vụ lâm sàng. Chỉ tiếp tục với dữ liệu tổng hợp cho đến khi đơn vị vận hành hoàn tất các điều kiện phát hành và thông báo quyền riêng tư chính thức.</Text>
      <Text style={styles.policyHeading}>Dữ liệu được dùng</Text>
      <Text style={styles.policyCopy}>Khi các dịch vụ được cấu hình, tài khoản, hồ sơ, đồng ý, kế hoạch, nhật ký, danh sách đi chợ, lịch hẹn, tin nhắn, thông báo, lựa chọn cá nhân hóa và hồ sơ xét nghiệm được xử lý qua API/Postgres theo tài khoản. Phiên đăng nhập và token thông báo của thiết bị được giữ trong vùng lưu trữ bảo mật của thiết bị.</Text>
      <Text style={styles.policyHeading}>Giới hạn dịch vụ</Text>
      <Text style={styles.policyCopy}>Dịch vụ trực tuyến cần Supabase và cấu hình nhà cung cấp tương ứng. Thanh toán chỉ mở trên trang PayOS và chỉ xác nhận sau webhook đã kiểm tra chữ ký. Chat AI chỉ gửi nội dung bạn nhập sau khi đồng ý riêng; chat nhà cung cấp cần lịch hẹn hợp lệ. OCR chạy trên thiết bị và không diễn giải kết quả. Thực phẩm/dinh dưỡng chỉ là dữ liệu có nguồn tham khảo, không phải dữ liệu chính thức của Viện Dinh dưỡng hay tư vấn chẩn đoán/điều trị.</Text>
      <Text style={styles.policyHeading}>Quyền của bạn</Text>
      <Text style={styles.policyCopy}>Bạn có thể xuất dữ liệu tài khoản hoặc yêu cầu xóa tài khoản trong Cài đặt. API chỉ xác nhận xóa khi các bước dọn dữ liệu đã hoàn tất. Rút đồng ý sẽ chặn các luồng yêu cầu quyền đó; việc xử lý bản sao lưu và thời hạn lưu do đơn vị vận hành công bố trước khi dịch vụ được phát hành.</Text>
    </View>}
    {screen === 'settings-help' && <>
      <View accessibilityRole="tablist" style={styles.helpTabs}>{[['faq', 'Hỏi đáp'], ['contact', 'Liên hệ']].map(([key, label]) => <TouchableOpacity key={key} accessibilityRole="tab" accessibilityState={{ selected: tab === key }} style={[styles.helpTab, tab === key && styles.helpTabActive]} onPress={() => setTab(key)}><Text style={[styles.helpTabText, tab === key && styles.helpTabTextActive]}>{label}</Text></TouchableOpacity>)}</View>
      {tab === 'faq' ? <>
        <View accessibilityRole="tablist" accessibilityLabel="Danh mục câu hỏi" style={styles.faqCategories}>{helpCategories.map(([key, label]) => <TouchableOpacity key={key} accessibilityRole="button" accessibilityState={{ selected: faqCategory === key }} style={[styles.faqCategory, faqCategory === key && styles.faqCategoryActive]} onPress={() => setFaqCategory(key)}><Text style={[styles.faqCategoryText, faqCategory === key && styles.faqCategoryTextActive]}>{label}</Text></TouchableOpacity>)}</View>
        {visibleHelpQuestions.map(item => <TouchableOpacity key={item.question} accessibilityRole="button" accessibilityState={{ expanded: faq === item.question }} style={styles.faqRow} onPress={() => setFaq(faq === item.question ? -1 : item.question)}><View style={styles.faqTop}><Text style={styles.faqQuestion}>{item.question}</Text><Text style={styles.faqArrow}>{faq === item.question ? '−' : '⌄'}</Text></View>{faq === item.question && <Text style={styles.copy}>{item.answer}</Text>}</TouchableOpacity>)}
        {!visibleHelpQuestions.length && <Text style={styles.helpEmpty}>Không tìm thấy câu hỏi phù hợp.</Text>}
      </> : <View style={styles.contactList}>
        {[
          ['Website', '◎', 'Website hỗ trợ chưa được cấu hình.'],
          ['Facebook', 'f', 'Trang Facebook hỗ trợ chưa được cấu hình.'],
        ].map(([label, icon, description]) => <View key={label}>
          <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: expandedContact === label }} style={styles.contactRow} onPress={() => setExpandedContact(expandedContact === label ? '' : label)}><View style={styles.contactIcon}><Text style={styles.contactIconText}>{icon}</Text></View><Text style={styles.contactLabel}>{label}</Text><Text style={styles.contactArrow}>{expandedContact === label ? '−' : '⌄'}</Text></TouchableOpacity>
          {expandedContact === label && <Text style={styles.contactDescription}>{description}</Text>}
        </View>)}
      </View>}
    </>}
  </ScrollView>;
}

function SettingToggle({ label, hint, value, onPress, disabled = false }) {
  return <TouchableOpacity accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: value, disabled }} disabled={disabled} style={[styles.toggleRow, disabled && { opacity: 0.55 }]} onPress={onPress}><View style={styles.toggleCopy}><Text style={styles.menuTitle}>{label}</Text><Text style={styles.menuHint}>{hint}</Text></View><View style={[styles.track, value && styles.trackOn]}><View style={[styles.thumb, value && styles.thumbOn]} /></View></TouchableOpacity>;
}
function Input({ label, value, setValue, placeholder, secureTextEntry }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={setValue} placeholder={placeholder} secureTextEntry={secureTextEntry} style={styles.input} autoCapitalize="none" /></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface }, content: { paddingHorizontal: 17, paddingTop: 12, paddingBottom: 112 }, helpContent: { paddingBottom: 112 },
  header: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }, back: { width: 48, height: 48, justifyContent: 'center' }, backText: { color: colors.primary, fontSize: 31 }, title: { color: colors.primary, fontSize: 20, fontWeight: '800' }, headerSpace: { width: 38 },
  menuRow: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 14, borderBottomWidth: 1, borderBottomColor: colors.border }, menuIcon: { width: 34, color: colors.primary, textAlign: 'center', fontSize: 25 }, menuCopy: { flex: 1 }, menuTitle: { color: colors.text, fontSize: 16, fontWeight: '700' }, menuHint: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 4 }, arrow: { color: colors.primary, fontSize: 27 },
  demoBox: { marginTop: 20, borderRadius: 13, padding: 16, backgroundColor: '#F2F5FD' }, demoTitle: { color: colors.primaryDark, fontSize: 13, fontWeight: '900', letterSpacing: 0.5 }, copy: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 8 }, sectionHeading: { color: colors.primaryDark, fontSize: 14, fontWeight: '900', marginTop: 16 },
  toggleRow: { minHeight: 82, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: colors.border }, toggleCopy: { flex: 1, paddingRight: 14 }, track: { width: 51, height: 30, borderRadius: 16, justifyContent: 'center', padding: 4, backgroundColor: '#D8DFEE' }, trackOn: { backgroundColor: colors.primary }, thumb: { width: 22, height: 22, borderRadius: 12, backgroundColor: 'white' }, thumbOn: { alignSelf: 'flex-end' }, notice: { backgroundColor: '#FFF7E6', color: colors.warning, borderRadius: 11, padding: 14, marginTop: 17, fontSize: 14, lineHeight: 21 },
  field: { marginTop: 16 }, label: { color: colors.text, fontSize: 15, fontWeight: '800', marginBottom: 8 }, input: { minHeight: 56, backgroundColor: '#EAF0FF', borderRadius: 13, paddingHorizontal: 15, color: colors.text, fontSize: 16 }, forgotButton: { minHeight: 48, alignSelf: 'flex-end', justifyContent: 'center', paddingHorizontal: 4 }, forgotText: { color: colors.primary, textDecorationLine: 'underline', fontSize: 14, fontWeight: '700' }, feedback: { color: colors.warning, fontSize: 14, lineHeight: 20, marginTop: 12 }, primary: { minHeight: 56, backgroundColor: colors.primary, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginTop: 22 }, primaryText: { color: 'white', fontSize: 16, fontWeight: '800' },
  policy: { padding: 16, backgroundColor: '#FBFCFF', borderRadius: 13 }, policyDate: { color: colors.muted, fontSize: 12, fontWeight: '800' }, policyHeading: { color: colors.primaryDark, fontSize: 17, fontWeight: '800', marginTop: 18 }, policyCopy: { color: colors.text, fontSize: 14, lineHeight: 21, marginTop: 8 },
  helpHero: { paddingHorizontal: 30, paddingTop: 8, paddingBottom: 18, backgroundColor: colors.primary }, helpHeroTop: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, helpBack: { width: 42, minHeight: 48, justifyContent: 'center' }, helpBackText: { color: 'white', fontSize: 32 }, helpTitle: { flex: 1, color: 'white', fontSize: 20, fontWeight: '800', textAlign: 'center' }, helpHeaderSpace: { width: 42 }, helpSearch: { height: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, marginTop: 18, borderRadius: radius.pill, backgroundColor: 'white' }, helpSearchIcon: { color: colors.primary, fontSize: 24 }, helpSearchInput: { flex: 1, minWidth: 0, paddingHorizontal: 9, color: colors.text, fontSize: 14 },
  helpTabs: { flexDirection: 'row', gap: 8, marginTop: 14, marginBottom: 15 }, helpTab: { minHeight: 46, flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: '#CCD8FF' }, helpTabActive: { backgroundColor: colors.primary }, helpTabText: { color: colors.primaryDark, fontSize: 15, fontWeight: '700' }, helpTabTextActive: { color: 'white' }, faqCategories: { flexDirection: 'row', gap: 8, marginBottom: 12 }, faqCategory: { minHeight: 32, flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: '#CCD8FF' }, faqCategoryActive: { backgroundColor: colors.primary }, faqCategoryText: { color: colors.primaryDark, fontSize: 12, fontWeight: '700' }, faqCategoryTextActive: { color: 'white' }, faqRow: { minHeight: 48, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 7, borderRadius: 14, backgroundColor: '#EEF2FF' }, faqTop: { flexDirection: 'row', alignItems: 'center' }, faqQuestion: { flex: 1, color: colors.text, fontSize: 13, fontWeight: '600', lineHeight: 18 }, faqArrow: { color: colors.primary, fontSize: 22, marginLeft: 8 }, helpEmpty: { color: colors.muted, fontSize: 14, lineHeight: 20, paddingVertical: 12 },
  contactList: { marginTop: 24 }, contactRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 12 }, contactIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: '#CCD8FF' }, contactIconText: { color: colors.primary, fontSize: 22, fontWeight: '800' }, contactLabel: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '600' }, contactArrow: { color: colors.primary, fontSize: 24, paddingHorizontal: 3 }, contactDescription: { color: colors.muted, fontSize: 13, lineHeight: 19, paddingLeft: 52, paddingBottom: 12 }, contactCard: { padding: 16, backgroundColor: '#F5F7FC', borderRadius: 13 },
  deleteCard: { alignItems: 'center', padding: 20, marginTop: 16, backgroundColor: '#FFFFFF', borderRadius: 18 }, deleteIcon: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#FFF1F0', alignItems: 'center', justifyContent: 'center' }, deleteIconText: { color: colors.danger, fontSize: 30, fontWeight: '900' }, deleteHeading: { color: colors.text, textAlign: 'center', fontSize: 20, fontWeight: '800', marginTop: 18 },
});
