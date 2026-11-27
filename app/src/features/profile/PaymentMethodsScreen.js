import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors, radius } from '../../theme/tokens';

const emptyCard = { holder: '', number: '', expiry: '', cvv: '' };
const paymentOptions = [
  { key: 'apple-pay', icon: '●', label: 'Apple Pay' },
  { key: 'paypal', icon: 'ℙ', label: 'PayPal' },
  { key: 'google-pay', icon: 'G', label: 'Google Pay' },
];

function formatCardNumber(value) {
  return value.replace(/\D/g, '').slice(0, 19).replace(/(.{4})/g, '$1 ').trim();
}

function PaymentOption({ icon, label, selected, onPress }) {
  return <TouchableOpacity
    accessibilityRole="radio"
    accessibilityLabel={label}
    accessibilityState={{ selected }}
    style={styles.option}
    onPress={onPress}
  >
    <Text style={[styles.optionIcon, label === 'Apple Pay' && styles.appleIcon]}>{icon}</Text>
    <Text style={styles.optionLabel}>{label}</Text>
    <Text accessibilityElementsHidden style={styles.radio}>{selected ? '⦿' : '◎'}</Text>
  </TouchableOpacity>;
}

export default function PaymentMethodsScreen({ onBack }) {
  const [showAddCard, setShowAddCard] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState('new-card');
  const [card, setCard] = useState(emptyCard);
  const [savedCard, setSavedCard] = useState(null);
  const [feedback, setFeedback] = useState('');

  function leaveCardForm() {
    setCard(emptyCard);
    setFeedback('');
    setShowAddCard(false);
  }

  function updateCard(field, value) {
    if (field === 'number') value = value.replace(/\D/g, '').slice(0, 19);
    if (field === 'cvv') value = value.replace(/\D/g, '').slice(0, 4);
    if (field === 'expiry') {
      const digits = value.replace(/\D/g, '').slice(0, 4);
      value = digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
    }
    setCard(current => ({ ...current, [field]: value }));
    setFeedback('');
  }

  function saveCard() {
    const digits = card.number.replace(/\D/g, '');
    if (!card.holder.trim() || digits.length < 12 || !/^\d{2}\/\d{2}$/.test(card.expiry) || !/^\d{3,4}$/.test(card.cvv)) {
      setFeedback('Vui lòng nhập đủ thông tin theo mẫu.');
      return;
    }
    setSavedCard({ lastFour: digits.slice(-4), holder: card.holder.trim(), expiry: card.expiry });
    setSelectedMethod('saved-card');
    leaveCardForm();
  }

  if (showAddCard) return <ScrollView style={styles.screen} contentContainerStyle={styles.addContent} keyboardShouldPersistTaps="handled">
    <View style={styles.header}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Quay lại" style={styles.back} onPress={leaveCardForm}>
        <Text style={styles.backText}>‹</Text>
      </TouchableOpacity>
      <Text accessibilityRole="header" style={styles.title}>Thêm Thẻ</Text>
      <View style={styles.headerSpace} />
    </View>

    <View accessibilityLabel="Xem trước thẻ" style={styles.cardPreview}>
      <View pointerEvents="none" style={styles.cardFacetLight} />
      <View pointerEvents="none" style={styles.cardFacetDeep} />
      <View style={styles.cardChip}><Text style={styles.cardChipText}>▦</Text></View>
      <Text style={styles.previewNumber}>{formatCardNumber(card.number) || '000 000 000 00'}</Text>
      <View style={styles.previewDetails}>
        <View style={styles.previewName}><Text style={styles.previewCaption}>Tên Chủ Thẻ</Text><Text numberOfLines={1} style={styles.previewValue}>{card.holder.trim() || 'Tên chủ thẻ'}</Text></View>
        <View><Text style={styles.previewCaption}>Hạn Dùng</Text><Text style={styles.previewValue}>{card.expiry || '04/28'}</Text></View>
        <Text accessibilityElementsHidden style={styles.previewMark}>▤</Text>
      </View>
    </View>

    <View style={styles.field}>
      <Text style={styles.fieldLabel}>Tên Chủ Thẻ</Text>
      <TextInput accessibilityLabel="Tên Chủ Thẻ" autoCapitalize="words" value={card.holder} onChangeText={value => updateCard('holder', value)} placeholder="Nguyễn Văn A" placeholderTextColor="#7895E8" style={styles.input} />
    </View>
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>Số Thẻ</Text>
      <TextInput accessibilityLabel="Số Thẻ" keyboardType="number-pad" value={formatCardNumber(card.number)} onChangeText={value => updateCard('number', value)} placeholder="000 000 000 000" placeholderTextColor="#7895E8" maxLength={23} style={styles.input} />
    </View>
    <View style={styles.splitFields}>
      <View style={[styles.field, styles.splitField]}>
        <Text style={styles.fieldLabel}>Hạn Dùng</Text>
        <TextInput accessibilityLabel="Hạn Dùng" keyboardType="number-pad" value={card.expiry} onChangeText={value => updateCard('expiry', value)} placeholder="04/28" placeholderTextColor="#7895E8" maxLength={5} style={styles.input} />
      </View>
      <View style={[styles.field, styles.splitField]}>
        <Text style={styles.fieldLabel}>CVV</Text>
        <TextInput accessibilityLabel="CVV" keyboardType="number-pad" secureTextEntry value={card.cvv} onChangeText={value => updateCard('cvv', value)} placeholder="000" placeholderTextColor="#7895E8" maxLength={4} style={styles.input} />
      </View>
    </View>
    <Text style={styles.demoNotice}>Giao diện mẫu: thông tin thẻ không được gửi tới dịch vụ thanh toán.</Text>
    {!!feedback && <Text accessibilityRole="alert" style={styles.feedback}>{feedback}</Text>}
    <TouchableOpacity accessibilityRole="button" style={styles.saveButton} onPress={saveCard}>
      <Text style={styles.saveButtonText}>Lưu Thẻ</Text>
    </TouchableOpacity>
  </ScrollView>;

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <View style={styles.header}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Quay lại" style={styles.back} onPress={onBack}>
        <Text style={styles.backText}>‹</Text>
      </TouchableOpacity>
      <Text accessibilityRole="header" style={styles.title}>Thanh Toán</Text>
      <View style={styles.headerSpace} />
    </View>

    <Text style={styles.sectionTitle}>Thẻ Tín Dụng/Ghi Nợ</Text>
    {savedCard && <PaymentOption
      icon="▤"
      label={`Thẻ •••• ${savedCard.lastFour}`}
      selected={selectedMethod === 'saved-card'}
      onPress={() => setSelectedMethod('saved-card')}
    />}
    <PaymentOption
      icon="▤"
      label="Thêm Thẻ Mới"
      selected={selectedMethod === 'new-card'}
      onPress={() => { setSelectedMethod('new-card'); setShowAddCard(true); }}
    />

    <Text style={[styles.sectionTitle, styles.otherTitle]}>Thanh Toán Khác</Text>
    {paymentOptions.map(option => <PaymentOption
      key={option.key}
      icon={option.icon}
      label={option.label}
      selected={selectedMethod === option.key}
      onPress={() => setSelectedMethod(option.key)}
    />)}
    {!!savedCard && <Text style={styles.demoNotice}>Thẻ •••• {savedCard.lastFour} chỉ được giữ tạm trong màn hình này. Không thể thực hiện thanh toán.</Text>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: 30, paddingTop: 0, paddingBottom: 32 },
  addContent: { paddingHorizontal: 30, paddingTop: 0, paddingBottom: 28 },
  header: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 26 },
  back: { width: 34, height: 44, justifyContent: 'center' },
  backText: { color: colors.primary, fontSize: 34, lineHeight: 38 },
  title: { color: colors.primary, fontSize: 22, fontWeight: '800', textAlign: 'center' },
  headerSpace: { width: 34 },
  sectionTitle: { color: '#141820', fontSize: 16, marginBottom: 12 },
  otherTitle: { marginTop: 26 },
  option: { minHeight: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, marginBottom: 8, borderRadius: radius.pill, backgroundColor: '#EAF0FF' },
  optionIcon: { width: 26, color: colors.primary, fontSize: 20, fontWeight: '700', textAlign: 'left' },
  appleIcon: { fontSize: 15 },
  optionLabel: { flex: 1, color: '#7895E8', fontSize: 16 },
  radio: { color: colors.primary, fontSize: 22, lineHeight: 26 },
  cardPreview: { height: 178, overflow: 'hidden', borderRadius: 16, padding: 22, justifyContent: 'flex-end', backgroundColor: '#3973FF' },
  cardFacetLight: { position: 'absolute', top: -74, right: -42, width: 230, height: 180, backgroundColor: '#6992FF', transform: [{ rotate: '32deg' }] },
  cardFacetDeep: { position: 'absolute', left: -72, bottom: -92, width: 380, height: 170, backgroundColor: '#1F58F6', transform: [{ rotate: '-27deg' }] },
  cardChip: { position: 'absolute', right: 17, bottom: 26, width: 29, height: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.8)', borderRadius: 3 },
  cardChipText: { color: 'rgba(255,255,255,0.86)', fontSize: 18 },
  previewNumber: { color: 'white', fontSize: 17, letterSpacing: 0.3 },
  previewDetails: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 12 },
  previewName: { flex: 1, marginRight: 18 },
  previewCaption: { color: 'white', fontSize: 9 },
  previewValue: { color: 'white', fontSize: 12, fontWeight: '700', marginTop: 2 },
  previewMark: { color: 'rgba(255,255,255,0.78)', fontSize: 22, marginRight: 4 },
  field: { marginTop: 18 },
  fieldLabel: { color: '#141820', fontSize: 15, marginBottom: 9 },
  input: { minHeight: 44, paddingHorizontal: 18, borderRadius: radius.pill, backgroundColor: '#EAF0FF', color: colors.text, fontSize: 16 },
  splitFields: { flexDirection: 'row', gap: 8, marginTop: 1 },
  splitField: { flex: 1, minWidth: 0 },
  demoNotice: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 14 },
  feedback: { color: colors.danger, fontSize: 13, lineHeight: 18, marginTop: 12 },
  saveButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 22, borderRadius: radius.pill, backgroundColor: colors.primary },
  saveButtonText: { color: 'white', fontSize: 18, fontWeight: '800' },
});
