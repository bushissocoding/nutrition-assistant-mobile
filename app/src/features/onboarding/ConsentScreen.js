import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radius } from '../../theme/tokens';
import {
  CONSENT_CHOICES,
  CONSENT_DISCLOSURE,
  CONSENT_VERSION,
  createEmptyConsentChoices,
  validateConsentChoices,
} from './consent-model.cjs';

export default function ConsentScreen({ onContinue, onWithdraw, onBack, initialChoices, busy = false }) {
  const [choices, setChoices] = useState(() => ({ ...createEmptyConsentChoices(), ...(initialChoices || {}) }));
  const errors = useMemo(() => validateConsentChoices(choices), [choices]);
  const ready = Object.keys(errors).length === 0;

  function toggle(key) {
    setChoices(current => ({ ...current, [key]: !current[key] }));
  }

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <View style={styles.brand}>
      <Text style={styles.mark}>♡</Text>
      <Text accessibilityRole="header" style={styles.title}>Nutrition Advisor</Text>
      <Text style={styles.subtitle}>Thông tin về dữ liệu tài khoản · {CONSENT_VERSION}</Text>
    </View>

    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.heading}>Dữ liệu tài khoản và cách sử dụng</Text>
      {CONSENT_DISCLOSURE.map(section => <View key={section.title} style={styles.disclosure}>
        <Text style={styles.sectionTitle}>{section.title}</Text>
        <Text style={styles.copy}>{section.body}</Text>
      </View>)}
      <Text style={styles.deviceTime}>Lựa chọn được lưu kèm thời điểm do máy chủ ghi nhận.</Text>
    </View>

    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.heading}>Lựa chọn bắt buộc và tùy chọn</Text>
      {CONSENT_CHOICES.map(choice => <TouchableOpacity
        key={choice.key}
        accessibilityRole="checkbox"
        accessibilityLabel={choice.label}
        accessibilityState={{ checked: choices[choice.key] === true }}
        style={styles.row}
        onPress={() => toggle(choice.key)}
      >
        <View style={[styles.checkbox, choices[choice.key] && styles.checked]}>
          <Text style={styles.checkText}>{choices[choice.key] ? '✓' : ''}</Text>
        </View>
        <Text style={styles.item}>{choice.label}{choice.required ? ' (bắt buộc)' : ' (tùy chọn)'}</Text>
      </TouchableOpacity>)}
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityState={{ disabled: !ready || busy }}
        disabled={!ready || busy}
        style={[styles.button, (!ready || busy) && styles.disabled]}
        onPress={() => onContinue?.(choices)}
      >
        <Text style={styles.buttonText}>{busy ? 'Đang lưu lựa chọn…' : 'Lưu lựa chọn và tiếp tục'}</Text>
      </TouchableOpacity>
      {onBack && <TouchableOpacity accessibilityRole="button" style={styles.secondary} onPress={onBack}>
        <Text style={styles.secondaryText}>Quay lại</Text>
      </TouchableOpacity>}
      {onWithdraw && <TouchableOpacity accessibilityRole="button" style={styles.withdraw} onPress={onWithdraw}>
        <Text style={styles.withdrawText}>Rút lựa chọn và yêu cầu xử lý dữ liệu</Text>
      </TouchableOpacity>}
    </View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { padding: 16, paddingBottom: 28 },
  brand: { alignItems: 'center', marginTop: 12, marginBottom: 14 },
  mark: { fontSize: 36, color: colors.primary },
  title: { color: colors.primary, fontSize: 25, fontWeight: '800', marginTop: 5 },
  subtitle: { color: colors.muted, textAlign: 'center', marginTop: 6, fontSize: 13 },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 16, marginVertical: 7, borderWidth: 1, borderColor: colors.border },
  heading: { color: colors.text, fontWeight: '800', fontSize: 18, marginBottom: 4 },
  disclosure: { marginTop: 11 },
  sectionTitle: { color: colors.primaryDark, fontWeight: '800', fontSize: 14 },
  copy: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  deviceTime: { color: colors.warning, fontSize: 12, lineHeight: 17, marginTop: 13 },
  row: { flexDirection: 'row', gap: 10, minHeight: 48, paddingVertical: 10, alignItems: 'flex-start' },
  checkbox: { width: 24, height: 24, borderWidth: 1.5, borderColor: '#9AA8C3', borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  checked: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkText: { color: 'white', fontWeight: '800' },
  item: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 19 },
  button: { minHeight: 48, backgroundColor: colors.primary, borderRadius: radius.pill, alignItems: 'center', padding: 14, marginTop: 9 },
  disabled: { opacity: 0.45 },
  buttonText: { color: 'white', fontWeight: '800', fontSize: 14 },
  secondary: { minHeight: 48, alignItems: 'center', padding: 11, marginTop: 2 },
  secondaryText: { color: colors.primary, fontWeight: '800', fontSize: 14 },
  withdraw: { minHeight: 48, padding: 12, alignItems: 'center' },
  withdrawText: { color: colors.danger, fontSize: 13, fontWeight: '700', textAlign: 'center' },
});
