import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radius } from '../../theme/tokens';
import PersonalInfoScreen from './PersonalInfoScreen';

export default function ProfileScreen({ profile, account, onSaveProfile, onNavigate, onExitDemo }) {
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showPersonalInfo, setShowPersonalInfo] = useState(false);
  const displayName = profile?.username || account?.username || 'Tài khoản';

  if (showPersonalInfo) return <PersonalInfoScreen
    profile={profile}
    account={account}
    onBack={() => setShowPersonalInfo(false)}
    onSave={onSaveProfile}
    onManageAccount={() => onNavigate?.('settings')}
  />;

  return <View style={styles.root}>
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text accessibilityRole="header" style={styles.title}>Cá nhân</Text>
      <View style={styles.accountCard}>
        <View style={styles.accountAvatar}><Text style={styles.accountAvatarText}>{Array.from(displayName.trim())[0]?.toLocaleUpperCase('vi') || 'T'}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.accountName}>{displayName}</Text>
          <Text style={styles.small}>{account?.email || 'Email chưa được cung cấp'}</Text>
        </View>
      </View>
      <View style={styles.menuCard}>
        <ProfileLink icon="♙" label="Thông tin cá nhân" onPress={() => setShowPersonalInfo(true)} />
        <ProfileLink icon="▣" label="Phương thức thanh toán" onPress={() => onNavigate?.('payment-methods')} />
        <ProfileLink icon="▢" label="Chính sách và quyền riêng tư" onPress={() => onNavigate?.('settings-privacy')} />
        <ProfileLink icon="⚙" label="Cài đặt tài khoản" onPress={() => onNavigate?.('settings')} />
        <ProfileLink icon="♧" label="Thông báo" onPress={() => onNavigate?.('notifications')} />
        <ProfileLink icon="?" label="Hỗ trợ" onPress={() => onNavigate?.('settings-help')} />
        <ProfileLink icon="↪" label="Đăng xuất" onPress={() => setShowExitConfirm(true)} />
      </View>
    </ScrollView>
    <Modal
      visible={showExitConfirm}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => setShowExitConfirm(false)}
    >
      <View testID="logout-confirmation-modal" accessibilityRole="alert" accessibilityViewIsModal style={styles.exitOverlay}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Đóng xác nhận đăng xuất" style={styles.exitBackdrop} onPress={() => setShowExitConfirm(false)} />
        <View style={styles.exitSheet}>
          <Text accessibilityRole="header" style={styles.exitHeading}>Đăng xuất</Text>
          <Text style={styles.exitMessage}>Bạn có chắc chắn muốn đăng xuất không?</Text>
          <Text style={styles.exitHint}>Dữ liệu tài khoản trên máy chủ vẫn được giữ nguyên cho lần đăng nhập sau.</Text>
          <View style={styles.exitActions}>
            <TouchableOpacity accessibilityRole="button" style={styles.stayButton} onPress={() => setShowExitConfirm(false)}><Text style={styles.stayText}>Ở lại</Text></TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" style={styles.confirmExitButton} onPress={() => { setShowExitConfirm(false); onExitDemo?.(); }}><Text style={styles.confirmExitText}>Đăng xuất</Text></TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  </View>;
}

function ProfileLink({ icon, label, onPress }) {
  return <TouchableOpacity accessibilityRole="button" style={styles.profileLink} onPress={onPress}>
    <Text style={styles.profileLinkIcon}>{icon}</Text><Text style={styles.profileLinkLabel}>{label}</Text><Text style={styles.profileLinkArrow}>›</Text>
  </TouchableOpacity>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { padding: 16, paddingBottom: 124 },
  title: { color: colors.primary, fontSize: 22, fontWeight: '800', marginBottom: 12, textAlign: 'center' },
  accountCard: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 12, marginTop: 7, borderRadius: radius.md, backgroundColor: '#F1F5FF' },
  accountAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#DCE7FF' },
  accountAvatarText: { color: colors.primary, fontSize: 18, fontWeight: '800' },
  accountName: { color: colors.text, fontSize: 14, fontWeight: '800' },
  small: { color: colors.muted, fontSize: 14, lineHeight: 18, marginTop: 5 },
  menuCard: { backgroundColor: colors.surface, paddingHorizontal: 12, borderRadius: radius.md, marginVertical: 7, borderWidth: 1, borderColor: colors.border },
  profileLink: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderColor: colors.border },
  profileLinkIcon: { width: 22, textAlign: 'center', color: colors.primary, fontSize: 17 },
  profileLinkLabel: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '700' },
  profileLinkArrow: { color: colors.primary, fontSize: 21 },
  exitOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(45, 103, 226, 0.48)' },
  exitBackdrop: { ...StyleSheet.absoluteFillObject },
  exitSheet: { minHeight: 210, padding: 22, paddingBottom: 30, borderTopLeftRadius: 26, borderTopRightRadius: 26, alignItems: 'center', backgroundColor: 'white' },
  exitHeading: { color: colors.primary, fontSize: 22, fontWeight: '800', marginTop: 4 },
  exitMessage: { color: colors.text, fontSize: 16, textAlign: 'center', marginTop: 10 },
  exitHint: { color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 6 },
  exitActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, width: '100%', marginTop: 17 },
  stayButton: { minHeight: 54, minWidth: 90, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: '#EDF3FF' },
  stayText: { color: colors.primary, fontSize: 15, fontWeight: '800' },
  confirmExitButton: { minHeight: 54, minWidth: 130, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.primary },
  confirmExitText: { color: 'white', fontSize: 15, fontWeight: '800' },
});
