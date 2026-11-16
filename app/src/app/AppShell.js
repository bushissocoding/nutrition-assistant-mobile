import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import ConsentScreen from '../features/onboarding/ConsentScreen';
import ProfileSetupScreen from '../features/onboarding/ProfileSetupScreen';
import DashboardScreen from '../features/dashboard/DashboardScreen';
import DiaryScreen from '../features/diary/DiaryScreen';
import GroceryScreen from '../features/grocery/GroceryScreen';
import HomeScreen from '../features/home/HomeScreen';
import MealPlanScreen from '../features/meal-planning/MealPlanScreen';
import ProfileScreen from '../features/profile/ProfileScreen';
import { loadConsent, loadProfile, revokeConsentAndClear, saveConsent, saveProfile } from '../services/profile-storage';
import { colors } from '../theme/tokens';
import { hasUrgentRedFlags, validateProfile } from '../features/profile/profile-model.cjs';

const tabs = [
  { key: 'home', icon: '⌂', title: 'Trang chủ' },
  { key: 'planner', icon: '▤', title: 'Thực đơn' },
  { key: 'profile', icon: '♡', title: 'Hồ sơ' },
  { key: 'diary', icon: '▣', title: 'Nhật ký' },
];

export default function AppShell() {
  const [ready, setReady] = useState(false);
  const [consented, setConsented] = useState(false);
  const [profile, setProfile] = useState(null);
  const [screen, setScreen] = useState('home');
  const [groceryItems, setGroceryItems] = useState([]);
  const [plan, setPlan] = useState(null);
  const [diary, setDiary] = useState([]);
  const [storageError, setStorageError] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([loadConsent(), loadProfile()]).then(([accepted, savedProfile]) => {
      if (!active) return;
      setConsented(accepted);
      setProfile(savedProfile);
      setScreen(savedProfile ? 'home' : 'profile-setup');
    }).catch(() => {
      if (!active) return;
      setStorageError('Không thể truy cập vùng lưu trữ an toàn. Chưa thể lưu hồ sơ trên thiết bị này.');
    }).finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);

  async function acceptConsent() {
    try {
      await saveConsent();
      setConsented(true);
      setScreen(profile ? 'home' : 'profile-setup');
      setStorageError('');
    } catch { setStorageError('Không lưu được sự đồng ý trên thiết bị. Hãy thử lại.'); }
  }

  async function completeProfile(nextProfile) {
    try {
      await saveProfile(nextProfile);
      setProfile(nextProfile);
      setPlan(null);
      setScreen('home');
      setStorageError('');
    } catch { setStorageError('Không lưu được hồ sơ vào SecureStore. Không tiếp tục với dữ liệu chưa lưu.'); }
  }

  async function withdrawConsentAndDelete() {
    Alert.alert('Thu hồi sự đồng ý?', 'Hồ sơ và trạng thái đồng ý trên thiết bị sẽ bị xóa. Nhật ký và thực đơn tạm thời trong bộ nhớ cũng sẽ bị xóa.', [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Thu hồi và xóa', style: 'destructive', onPress: async () => {
        try {
          await revokeConsentAndClear();
          setProfile(null); setPlan(null); setDiary([]); setGroceryItems([]); setConsented(false); setScreen('profile-setup'); setStorageError('');
        } catch { setStorageError('Không xóa được dữ liệu an toàn. Hãy thử lại.'); }
      } },
    ]);
  }

  if (!ready) return <SafeAreaView style={styles.safe}><StatusBar barStyle="dark-content" backgroundColor={colors.canvas} /><View style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={styles.placeholderCopy}>Đang mở hồ sơ cục bộ…</Text></View></SafeAreaView>;
  if (!consented) return <SafeAreaView style={styles.safe}><StatusBar barStyle="dark-content" backgroundColor={colors.canvas} /><ConsentScreen onContinue={acceptConsent} onWithdraw={profile ? withdrawConsentAndDelete : undefined} />{!!storageError && <Text style={styles.storageError}>{storageError}</Text>}</SafeAreaView>;
  if (!profile || screen === 'profile-setup') return <SafeAreaView style={styles.safe}><StatusBar barStyle="dark-content" backgroundColor={colors.canvas} /><ProfileSetupScreen key={`${profile?.mode || 'new'}-${profile?.version || 1}`} initialProfile={profile} onComplete={completeProfile} />{!!storageError && <Text style={styles.storageError}>{storageError}</Text>}</SafeAreaView>;

  function openGrocery(items) { setGroceryItems(items || []); setScreen('grocery'); }
  function navigate(target) {
    if (target === 'planner' && hasUrgentRedFlags(profile)) {
      setScreen('profile');
      Alert.alert('Cần được nhân viên y tế đánh giá', 'Bạn đã đánh dấu một dấu hiệu cảnh báo. Ứng dụng không tạo thực đơn trong trường hợp này. Hãy liên hệ dịch vụ y tế khẩn cấp tại địa phương nếu triệu chứng nghiêm trọng.');
      return;
    }
    if (target === 'planner' && profile.mode === 'patient' && Object.keys(validateProfile(profile)).length > 0) {
      setScreen('profile-setup');
      Alert.alert('Cần hoàn tất chỉ tiêu', 'Hồ sơ bệnh nhân cần có giới hạn dinh dưỡng được đối chiếu với bác sĩ trước khi tạo thực đơn.');
      return;
    }
    setScreen(target);
  }

  let content;
  if (screen === 'home') content = <HomeScreen onNavigate={navigate} diary={diary} plan={plan} />;
  else if (screen === 'planner') content = <MealPlanScreen profile={profile} onOpenProfile={() => setScreen('profile-setup')} onOpenGrocery={openGrocery} onPlanGenerated={setPlan} />;
  else if (screen === 'grocery') content = <GroceryScreen items={groceryItems} />;
  else if (screen === 'diary') content = <DiaryScreen diary={diary} onAddMeal={item => setDiary(current => [item, ...current])} />;
  else if (screen === 'dashboard') content = <DashboardScreen diary={diary} plan={plan} />;
  else if (screen === 'profile') content = <ProfileScreen profile={profile} onEdit={() => setScreen('profile-setup')} onDeleted={() => { setProfile(null); setPlan(null); setDiary([]); setGroceryItems([]); setScreen('profile-setup'); }} onWithdrawConsent={withdrawConsentAndDelete} />;
  else content = <PlaceholderScreen title={screen === 'appointments' ? 'Đặt khám & lịch hẹn' : 'Tính năng'} />;

  return <SafeAreaView style={styles.safe}><StatusBar barStyle="dark-content" backgroundColor={colors.canvas} />{content}
    {!!storageError && <Text style={styles.storageError}>{storageError}</Text>}
    <View style={styles.nav}>{tabs.map(tab => <TouchableOpacity key={tab.key} style={styles.navItem} onPress={() => navigate(tab.key)}><Text style={[styles.navIcon, { color: screen === tab.key ? 'white' : '#C9D6FF' }]}>{tab.icon}</Text><Text style={[styles.navLabel, { color: screen === tab.key ? 'white' : '#C9D6FF' }]}>{tab.title}</Text></TouchableOpacity>)}</View>
  </SafeAreaView>;
}

function PlaceholderScreen({ title }) {
  return <View style={styles.placeholder}><Text style={styles.placeholderTitle}>{title}</Text><Text style={styles.placeholderCopy}>Chức năng này chưa được triển khai trong nền MVP.</Text></View>;
}

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.canvas }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center' }, nav: { position: 'absolute', bottom: 14, left: 20, right: 20, height: 62, borderRadius: 32, backgroundColor: colors.primary, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', elevation: 8 }, navItem: { alignItems: 'center', minWidth: 54 }, navIcon: { fontSize: 20 }, navLabel: { fontSize: 9, fontWeight: '700', marginTop: 2 }, placeholder: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }, placeholderTitle: { color: colors.primary, fontWeight: '800', fontSize: 23 }, placeholderCopy: { color: colors.muted, textAlign: 'center', marginTop: 10 }, storageError: { color: colors.danger, backgroundColor: '#FFF0F0', padding: 10, marginHorizontal: 16, borderRadius: 9, fontSize: 12 } });
