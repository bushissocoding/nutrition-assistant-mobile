import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import BrandMark from './BrandMark';
import { colors } from '../../theme/tokens';

export default function WelcomeScreen({ onLogin, onRegister, serviceConfigured = true }) {
  return <ScrollView style={styles.viewport} contentContainerStyle={styles.screen}>
    <View style={styles.brand}>
      <BrandMark size={210} color={colors.primary} cutout="#FFFFFF" />
      <Text style={styles.brandName}>CLINICARE</Text>
      <Text style={styles.tagline}>Trung Tâm Dữ Liệu</Text>
    </View>
    <View style={styles.actions}>
      <TouchableOpacity accessibilityRole="button" style={styles.primary} onPress={onLogin}><Text style={styles.primaryText}>Đăng Nhập</Text></TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" style={styles.secondary} onPress={onRegister}><Text style={styles.secondaryText}>Đăng Ký</Text></TouchableOpacity>
      {!serviceConfigured && <Text accessibilityRole="alert" style={styles.demoNote}>Cần cấu hình dịch vụ tài khoản để đăng nhập hoặc đăng ký.</Text>}
    </View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  viewport: { flex: 1, width: '100%', backgroundColor: colors.surface },
  screen: { flexGrow: 1, width: '100%', paddingHorizontal: 22, paddingBottom: 34, justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.surface },
  brand: { flex: 1, alignItems: 'center', justifyContent: 'center', width: '100%', paddingTop: 12 },
  brandName: { marginTop: 22, color: colors.primary, fontSize: 42, lineHeight: 52, fontWeight: '300', letterSpacing: 1.6 },
  tagline: { color: colors.primary, fontSize: 13, fontWeight: '700', marginTop: 1 },
  actions: { width: 210, paddingBottom: 10 },
  primary: { minHeight: 56, borderRadius: 28, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  primaryText: { color: 'white', fontSize: 19, fontWeight: '800' },
  secondary: { minHeight: 56, borderRadius: 28, backgroundColor: '#CED9FF', justifyContent: 'center', alignItems: 'center', marginTop: 8 },
  secondaryText: { color: colors.primaryDark, fontSize: 19, fontWeight: '800' },
  demoNote: { color: colors.muted, fontSize: 9, lineHeight: 13, textAlign: 'center', marginTop: 10 },
});
