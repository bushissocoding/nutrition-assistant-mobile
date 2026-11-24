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
import { clearStoredProfile, loadConsent, loadProfile, revokeConsentAndClear, saveConsent, saveProfile } from '../services/profile-storage';
import { api } from '../services/api';
import { colors } from '../theme/tokens';
import { hasUrgentRedFlags, validateProfile } from '../features/profile/profile-model.cjs';
import { purgeBeforeLocalDelete } from './purge-before-local-delete.cjs';

const tabs = [
  { key: 'home', icon: '⌂', title: 'Trang chủ' },
  { key: 'planner', icon: '▤', title: 'Thực đơn' },
  { key: 'profile', icon: '♡', title: 'Hồ sơ' },
  { key: 'diary', icon: '▣', title: 'Nhật ký' },
];

const emptyTotals = { energyKcal: 0, proteinG: 0, carbohydrateG: 0, fatG: 0, fiberG: 0, sodiumMg: 0 };

function getCurrentLocalDay() {
  const now = new Date();
  const pad = value => String(value).padStart(2, '0');
  return {
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  };
}

export default function AppShell() {
  const [ready, setReady] = useState(false);
  const [consented, setConsented] = useState(false);
  const [consentRecord, setConsentRecord] = useState(null);
  const [consentSaving, setConsentSaving] = useState(false);
  const [consentReturnScreen, setConsentReturnScreen] = useState('profile-setup');
  const [profile, setProfile] = useState(null);
  const [screen, setScreen] = useState('home');
  const [groceryItems, setGroceryItems] = useState(null);
  const [plan, setPlan] = useState(null);
  const [diary, setDiary] = useState([]);
  const [diaryTotals, setDiaryTotals] = useState(emptyTotals);
  const [diaryHydrationError, setDiaryHydrationError] = useState('');
  const [diaryLoading, setDiaryLoading] = useState(false);
  const [diaryHydrationVersion, setDiaryHydrationVersion] = useState(0);
  const [storageError, setStorageError] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([loadConsent(), loadProfile()]).then(([accepted, savedProfile]) => {
      if (!active) return;
      setConsentRecord(accepted);
      setConsented(Boolean(accepted));
      setProfile(savedProfile);
      setScreen(savedProfile ? 'home' : accepted ? 'profile-setup' : 'consent');
    }).catch(() => {
      if (!active) return;
      setStorageError('Không thể truy cập vùng lưu trữ an toàn. Chưa thể lưu hồ sơ trên thiết bị này.');
    }).finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!ready || !consented || !profile) return undefined;
    let active = true;
    const day = getCurrentLocalDay();
    setDiaryLoading(true);
    setDiaryHydrationError('');
    api.getMealEntries(day).then(result => {
      if (!active) return;
      setDiary(Array.isArray(result?.items) ? result.items : []);
      setDiaryTotals(result?.totals || emptyTotals);
    }).catch(error => {
      if (active) setDiaryHydrationError(error?.message || 'Không tải được nhật ký hôm nay.');
    }).finally(() => {
      if (active) setDiaryLoading(false);
    });
    return () => { active = false; };
  }, [ready, consented, profile, diaryHydrationVersion]);

  async function acceptConsent(choices) {
    setConsentSaving(true);
    try {
      const record = await saveConsent(choices);
      setConsentRecord(record);
      setConsented(true);
      setScreen(screen === 'consent-review' ? consentReturnScreen : profile ? 'home' : 'profile-setup');
      setStorageError('');
    } catch { setStorageError('Không lưu được lựa chọn trên thiết bị. Chưa thể tiếp tục; hãy thử lại.'); }
    finally { setConsentSaving(false); }
  }

  function reviewConsent(returnTo) {
    setConsentReturnScreen(returnTo);
    setScreen('consent-review');
    setStorageError('');
  }

  function backFromProfileSetup() {
    if (profile) setScreen('profile');
    else reviewConsent('profile-setup');
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

  async function purgeRemoteDemoData() {
    await api.purgeMealEntries();
    await api.purgeShoppingLists();
  }

  async function withdrawConsentAndDelete() {
    Alert.alert('Thu hồi sự đồng ý?', 'Nhật ký và danh sách đi chợ demo trên máy chủ sẽ được xóa trước. Nếu máy chủ chưa xác nhận, hồ sơ và trạng thái đồng ý trên thiết bị vẫn được giữ lại.', [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Thu hồi và xóa', style: 'destructive', onPress: async () => {
        try {
          await purgeBeforeLocalDelete(purgeRemoteDemoData, () => revokeConsentAndClear());
          setProfile(null); setPlan(null); setDiary([]); setDiaryTotals(emptyTotals); setGroceryItems(null); setConsentRecord(null); setConsented(false); setScreen('consent'); setStorageError('');
          Alert.alert('Đã rút đồng ý và xóa dữ liệu demo', 'API đã xác nhận xóa nhật ký và danh sách đi chợ. Hồ sơ và lựa chọn đồng ý trên thiết bị đã được xóa.');
        } catch (error) { setStorageError(error?.message || 'Không xóa được nhật ký trên máy chủ. Hãy kiểm tra kết nối rồi thử lại.'); }
      } },
    ]);
  }

  if (!ready) return <SafeAreaView style={styles.safe}><StatusBar barStyle="dark-content" /><View style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={styles.placeholderCopy}>Đang mở hồ sơ cục bộ…</Text></View></SafeAreaView>;
  if (!consented || screen === 'consent-review') return <SafeAreaView style={styles.safe}><StatusBar barStyle="dark-content" /><ConsentScreen onContinue={acceptConsent} busy={consentSaving} initialChoices={consentRecord?.choices} onBack={screen === 'consent-review' ? () => setScreen(consentReturnScreen) : undefined} onWithdraw={profile || consentRecord ? withdrawConsentAndDelete : undefined} />{!!storageError && <Text style={styles.storageError}>{storageError}</Text>}</SafeAreaView>;
  if (!profile || screen === 'profile-setup') return <SafeAreaView style={styles.safe}><StatusBar barStyle="dark-content" /><ProfileSetupScreen key={`${profile?.mode || 'new'}-${profile?.version || 1}`} initialProfile={profile} onComplete={completeProfile} onBack={backFromProfileSetup} onWithdrawConsent={withdrawConsentAndDelete} />{!!storageError && <Text style={styles.storageError}>{storageError}</Text>}</SafeAreaView>;

  function openGrocery(items) { setGroceryItems(Array.isArray(items) ? items : null); setScreen('grocery'); }
  async function deleteProfileData() {
    await purgeBeforeLocalDelete(purgeRemoteDemoData, () => clearStoredProfile());
    setProfile(null);
    setPlan(null);
    setDiary([]);
    setDiaryTotals(emptyTotals);
    setGroceryItems(null);
    setScreen('profile-setup');
    Alert.alert('Đã xóa hồ sơ demo', 'Nhật ký và danh sách đi chợ trên API, hồ sơ trên thiết bị và dữ liệu trong bộ nhớ đã được xóa. Biên nhận đồng ý vẫn được giữ lại.');
  }
  function updateTodayDiary(date, entries, totals) {
    if (date !== getCurrentLocalDay().date) return;
    setDiary(entries);
    setDiaryTotals(totals || emptyTotals);
    setDiaryHydrationError('');
    setDiaryLoading(false);
  }
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
  if (screen === 'home') content = <HomeScreen onNavigate={navigate} diary={diary} diaryTotals={diaryTotals} diaryError={diaryHydrationError} diaryLoading={diaryLoading} onRetryDiary={() => setDiaryHydrationVersion(value => value + 1)} plan={plan} />;
  else if (screen === 'planner') content = <MealPlanScreen profile={profile} onOpenProfile={() => setScreen('profile-setup')} onOpenGrocery={openGrocery} onPlanGenerated={setPlan} />;
  else if (screen === 'grocery') content = <GroceryScreen sourceItems={groceryItems || []} />;
  else if (screen === 'diary') content = <DiaryScreen onTodayDataLoaded={updateTodayDiary} onDiaryMutation={() => setDiaryHydrationVersion(value => value + 1)} />;
  else if (screen === 'dashboard') content = <DashboardScreen diary={diary} diaryTotals={diaryTotals} plan={plan} />;
  else if (screen === 'profile') content = <ProfileScreen profile={profile} consentRecord={consentRecord} onEdit={() => setScreen('profile-setup')} onDeleted={deleteProfileData} onWithdrawConsent={withdrawConsentAndDelete} onReviewConsent={() => reviewConsent('profile')} />;
  else content = <PlaceholderScreen title={screen === 'appointments' ? 'Đặt khám & lịch hẹn' : 'Tính năng'} />;

  return <SafeAreaView style={styles.safe}><StatusBar barStyle="dark-content" />{content}
    {!!storageError && <Text style={styles.storageError}>{storageError}</Text>}
    <View style={styles.nav}>{tabs.map(tab => <TouchableOpacity key={tab.key} style={styles.navItem} onPress={() => navigate(tab.key)}><Text style={[styles.navIcon, { color: screen === tab.key ? 'white' : '#C9D6FF' }]}>{tab.icon}</Text><Text style={[styles.navLabel, { color: screen === tab.key ? 'white' : '#C9D6FF' }]}>{tab.title}</Text></TouchableOpacity>)}</View>
  </SafeAreaView>;
}

function PlaceholderScreen({ title }) {
  return <View style={styles.placeholder}><Text style={styles.placeholderTitle}>{title}</Text><Text style={styles.placeholderCopy}>Chức năng này chưa được triển khai trong nền MVP.</Text></View>;
}

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.canvas }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center' }, nav: { position: 'absolute', bottom: 14, left: 20, right: 20, height: 62, borderRadius: 32, backgroundColor: colors.primary, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', elevation: 8 }, navItem: { alignItems: 'center', minWidth: 54 }, navIcon: { fontSize: 20 }, navLabel: { fontSize: 9, fontWeight: '700', marginTop: 2 }, placeholder: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }, placeholderTitle: { color: colors.primary, fontWeight: '800', fontSize: 23 }, placeholderCopy: { color: colors.muted, textAlign: 'center', marginTop: 10 }, storageError: { color: colors.danger, backgroundColor: '#FFF0F0', padding: 10, marginHorizontal: 16, borderRadius: 9, fontSize: 12 } });
