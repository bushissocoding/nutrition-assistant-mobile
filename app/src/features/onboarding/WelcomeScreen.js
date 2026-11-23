import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radius } from '../../theme/tokens';

export default function WelcomeScreen({ onLogin, onRegister, onExploreDemo }) {
  return <ScrollView style={styles.viewport} contentContainerStyle={styles.screen}>
    <View style={styles.brand}>
      <View style={styles.logo} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={styles.logoVertical} /><View style={styles.logoHorizontal} />
      </View>
      <Text style={styles.brandName}>CLINICARE</Text>
      <Text style={styles.tagline}>Sống khỏe mỗi ngày</Text>
    </View>
    <View style={styles.quoteCard}>
      <Text style={styles.quoteMark}>“</Text>
      <Text style={styles.quote}>Sức khỏe là sự hài hòa trọn vẹn giữa thể chất và tâm hồn.</Text>
      <Text style={styles.attribution}>— ARISTOTLE</Text>
    </View>
    <View style={styles.actions}>
      <Text style={styles.heading}>Chào mừng bạn</Text>
      <Text style={styles.copy}>Theo dõi bữa ăn và khám phá các công cụ dinh dưỡng trong bản demo.</Text>
      <TouchableOpacity accessibilityRole="button" style={styles.primary} onPress={onLogin}><Text style={styles.primaryText}>Đăng nhập</Text></TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" style={styles.secondary} onPress={onRegister}><Text style={styles.secondaryText}>Đăng ký</Text></TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" style={styles.demoLink} onPress={onExploreDemo}><Text style={styles.demoText}>Khám phá bản demo không cần tài khoản</Text></TouchableOpacity>
      <Text style={styles.disclaimer}>Đăng nhập và đăng ký chưa được kết nối. Không nhập thông tin cá nhân hoặc mật khẩu thật.</Text>
    </View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  viewport: { flex: 1, minWidth: 0 },
  screen: { flexGrow: 1, minWidth: 0, backgroundColor: colors.surface, padding: 22, justifyContent: 'space-between' },
  brand: { alignItems: 'center', marginTop: 42 }, logo: { width: 76, height: 76, alignItems: 'center', justifyContent: 'center' },
  logoVertical: { position: 'absolute', width: 27, height: 76, borderRadius: 11, backgroundColor: colors.primary },
  logoHorizontal: { position: 'absolute', width: 76, height: 27, borderRadius: 11, backgroundColor: colors.primary },
  brandName: { marginTop: 15, color: colors.primary, fontSize: 27, fontWeight: '300', letterSpacing: 4 },
  tagline: { color: colors.muted, fontSize: 13, marginTop: 5 },
  quoteCard: { minWidth: 0, flexShrink: 1, alignSelf: 'stretch', backgroundColor: '#E6F0FF', borderRadius: radius.lg, paddingHorizontal: 24, paddingVertical: 28, alignItems: 'center', marginVertical: 24 },
  quoteMark: { color: colors.primary, fontSize: 38, lineHeight: 42, fontWeight: '900' },
  quote: { flexShrink: 1, color: colors.text, fontSize: 19, lineHeight: 27, textAlign: 'center', fontWeight: '700' },
  attribution: { color: colors.primaryDark, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginTop: 18 },
  actions: { minWidth: 0, paddingBottom: 15 }, heading: { color: colors.text, fontSize: 24, fontWeight: '800', textAlign: 'center' },
  copy: { flexShrink: 1, color: colors.muted, fontSize: 14, lineHeight: 20, textAlign: 'center', marginVertical: 10 },
  primary: { minHeight: 48, borderRadius: radius.pill, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', marginTop: 8 },
  primaryText: { color: 'white', fontSize: 15, fontWeight: '800' },
  secondary: { minHeight: 48, borderRadius: radius.pill, backgroundColor: '#DFE7FF', justifyContent: 'center', alignItems: 'center', marginTop: 8 },
  secondaryText: { color: colors.primaryDark, fontSize: 15, fontWeight: '800' },
  demoLink: { minHeight: 48, justifyContent: 'center', alignItems: 'center', marginTop: 5 }, demoText: { color: colors.primary, fontSize: 13, fontWeight: '800' },
  disclaimer: { flexShrink: 1, color: colors.muted, fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 3 },
});
