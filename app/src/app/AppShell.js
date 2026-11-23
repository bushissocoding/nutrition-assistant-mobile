import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import ConsentScreen from '../features/onboarding/ConsentScreen';
import ProfileSetupScreen from '../features/onboarding/ProfileSetupScreen';
import DashboardScreen from '../features/dashboard/DashboardScreen';
import DiaryScreen from '../features/diary/DiaryScreen';
import GroceryScreen from '../features/grocery/GroceryScreen';
import HomeScreen from '../features/home/HomeScreen';
import MealPlanScreen from '../features/meal-planning/MealPlanScreen';
import ProfileScreen from '../features/profile/ProfileScreen';
import WelcomeScreen from '../features/onboarding/WelcomeScreen';
import LaunchScreen from '../features/onboarding/LaunchScreen';
import AuthScreen from '../features/onboarding/AuthScreen';
import ChatScreen from '../features/chat/ChatScreen';
import NotificationsScreen, { initialNotificationItems } from '../features/notifications/NotificationsScreen';
import SettingsScreen from '../features/settings/SettingsScreen';
import AppointmentScreen from '../features/appointments/AppointmentScreen';
import MedicalRecordScreen from '../features/medical-record/MedicalRecordScreen';
import PersonalizationScreen from '../features/personalization/PersonalizationScreen';
import { clearStoredProfile, loadConsent, loadProfile, revokeConsentAndClear, saveConsent, saveProfile } from '../services/profile-storage';
import { api } from '../services/api';
import { colors } from '../theme/tokens';
import { bottomTabs } from '../navigation/routes';
import { hasUrgentRedFlags, validateProfile } from '../features/profile/profile-model.cjs';
import { purgeBeforeLocalDelete } from './purge-before-local-delete.cjs';

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
  const [launchComplete, setLaunchComplete] = useState(false);
  const [ready, setReady] = useState(false);
  const [consented, setConsented] = useState(false);
  const [consentRecord, setConsentRecord] = useState(null);
  const [consentSaving, setConsentSaving] = useState(false);
  const [consentReturnScreen, setConsentReturnScreen] = useState('profile-setup');
  const [profileSetupReturn, setProfileSetupReturn] = useState('home');
  const [authReturn, setAuthReturn] = useState('welcome');
  const [profile, setProfile] = useState(null);
  const [screen, setScreen] = useState('welcome');
  const [groceryItems, setGroceryItems] = useState(null);
  const [groceryReturn, setGroceryReturn] = useState('home');
  const [plan, setPlan] = useState(null);
  const [diary, setDiary] = useState([]);
  const [diaryTotals, setDiaryTotals] = useState(emptyTotals);
  const [diaryHydrationError, setDiaryHydrationError] = useState('');
  const [diaryLoading, setDiaryLoading] = useState(false);
  const [diaryHydrationVersion, setDiaryHydrationVersion] = useState(0);
  const [storageError, setStorageError] = useState('');
  const [bookingRequest, setBookingRequest] = useState(null);
  const [medicalRecordReturn, setMedicalRecordReturn] = useState('profile');
  const [settingsReturn, setSettingsReturn] = useState('profile');
  const [personalizationReturn, setPersonalizationReturn] = useState('profile');
  const [appointmentReturn, setAppointmentReturn] = useState('home');
  const [chatContact, setChatContact] = useState(null);
  const [notifications, setNotifications] = useState(initialNotificationItems);
  const finishLaunch = useCallback(() => setLaunchComplete(true), []);

  useEffect(() => {
    let active = true;
    Promise.all([loadConsent(), loadProfile()]).then(([accepted, savedProfile]) => {
      if (!active) return;
      setConsentRecord(accepted);
      setConsented(Boolean(accepted));
      setProfile(savedProfile);
      setScreen(savedProfile ? 'home' : accepted ? 'profile-setup' : 'welcome');
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
    if (profile) setScreen(profileSetupReturn);
    else reviewConsent('profile-setup');
  }

  function openProfileSetup(returnTo) {
    setProfileSetupReturn(returnTo);
    setScreen('profile-setup');
  }

  async function completeProfile(nextProfile) {
    try {
      await saveProfile(nextProfile);
      setProfile(nextProfile);
      setPlan(null);
      setScreen(profile ? profileSetupReturn : 'home');
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
          setProfile(null); setPlan(null); setDiary([]); setDiaryTotals(emptyTotals); setGroceryItems(null); setBookingRequest(null); setConsentRecord(null); setConsented(false); setScreen('welcome'); setStorageError('');
          Alert.alert('Đã rút đồng ý và xóa dữ liệu demo', 'API đã xác nhận xóa nhật ký và danh sách đi chợ. Hồ sơ và lựa chọn đồng ý trên thiết bị đã được xóa.');
        } catch (error) { setStorageError(error?.message || 'Không xóa được nhật ký trên máy chủ. Hãy kiểm tra kết nối rồi thử lại.'); }
      } },
    ]);
  }

  if (!launchComplete) return <SafeAreaView style={styles.safe}><LaunchScreen onComplete={finishLaunch} ready={ready} /></SafeAreaView>;
  if (!ready) return <SafeAreaView style={[styles.safe, styles.splash]}><StatusBar barStyle="light-content" /><View style={styles.splashMark}><View style={styles.splashVertical} /><View style={styles.splashHorizontal} /></View><Text style={styles.splashTitle}>CLINICARE</Text><ActivityIndicator color="white" style={styles.splashLoader} /><Text style={styles.splashCopy}>Đang mở bản demo…</Text></SafeAreaView>;
  if (screen === 'welcome') return <SafeAreaView style={styles.safe}><StatusBar barStyle="dark-content" /><WelcomeScreen onLogin={() => { setAuthReturn('welcome'); setScreen('auth-login'); }} onRegister={() => { setAuthReturn('welcome'); setScreen('auth-register'); }} onExploreDemo={() => setScreen('consent')} /></SafeAreaView>;
  if (screen.startsWith('auth-')) return <SafeAreaView style={styles.safe}><StatusBar barStyle="dark-content" /><AuthScreen mode={screen.slice(5)} onBack={() => setScreen(authReturn)} onModeChange={mode => setScreen(`auth-${mode}`)} onExploreDemo={() => setScreen('consent')} /></SafeAreaView>;
  if (!consented || screen === 'consent-review') return <SafeAreaView style={styles.safe}><StatusBar barStyle="dark-content" /><ConsentScreen onContinue={acceptConsent} busy={consentSaving} initialChoices={consentRecord?.choices} onBack={screen === 'consent-review' ? () => setScreen(consentReturnScreen) : undefined} onWithdraw={profile || consentRecord ? withdrawConsentAndDelete : undefined} />{!!storageError && <Text style={styles.storageError}>{storageError}</Text>}</SafeAreaView>;
  if (!profile || screen === 'profile-setup') return <SafeAreaView style={styles.safe}><StatusBar barStyle="dark-content" /><ProfileSetupScreen key={`${profile?.mode || 'new'}-${profile?.version || 1}`} initialProfile={profile} onComplete={completeProfile} onBack={backFromProfileSetup} onWithdrawConsent={withdrawConsentAndDelete} />{!!storageError && <Text style={styles.storageError}>{storageError}</Text>}</SafeAreaView>;

  function openGrocery(items) { setGroceryReturn(screen); setGroceryItems(Array.isArray(items) ? items : null); setScreen('grocery'); }
  async function deleteProfileData() {
    await purgeBeforeLocalDelete(purgeRemoteDemoData, () => clearStoredProfile());
    setProfile(null);
    setPlan(null);
    setDiary([]);
    setDiaryTotals(emptyTotals);
    setGroceryItems(null);
    setBookingRequest(null);
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
    if (target === 'medical-record') setMedicalRecordReturn(screen);
    if (target === 'settings' || (target.startsWith('settings-') && !screen.startsWith('settings'))) setSettingsReturn(screen);
    if (target === 'personalization') setPersonalizationReturn(screen);
    if (target === 'profile-setup') setProfileSetupReturn(screen);
    if (target === 'appointments' || target === 'appointments-list' || target === 'payment-methods') setAppointmentReturn(screen);
    if (target === 'grocery') setGroceryReturn(screen);
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
  else if (screen === 'planner') content = <MealPlanScreen profile={profile} onOpenProfile={() => openProfileSetup('planner')} onOpenGrocery={openGrocery} onPlanGenerated={setPlan} />;
  else if (screen === 'grocery') content = <GroceryScreen sourceItems={groceryItems || []} onBack={() => setScreen(groceryReturn)} />;
  else if (screen === 'diary') content = <DiaryScreen onTodayDataLoaded={updateTodayDiary} onDiaryMutation={() => setDiaryHydrationVersion(value => value + 1)} />;
  else if (screen === 'dashboard') content = <DashboardScreen diary={diary} diaryTotals={diaryTotals} plan={plan} />;
  else if (screen === 'profile') content = <ProfileScreen profile={profile} consentRecord={consentRecord} onEdit={() => openProfileSetup('profile')} onDeleted={deleteProfileData} onWithdrawConsent={withdrawConsentAndDelete} onReviewConsent={() => reviewConsent('profile')} onNavigate={navigate} onExitDemo={() => setScreen('welcome')} />;
  else if (screen === 'chat') content = <ChatScreen onNavigate={navigate} />;
  else if (screen === 'doctor-chat') content = <ChatScreen contact={chatContact} onNavigate={navigate} />;
  else if (screen === 'notifications') content = <NotificationsScreen items={notifications} onItemsChange={setNotifications} onNavigate={navigate} />;
  else if (screen.startsWith('settings')) content = <SettingsScreen screen={screen} onNavigate={navigate} onBack={() => setScreen(settingsReturn)} onForgotPassword={() => { setAuthReturn('settings-password'); setScreen('auth-forgot'); }} />;
  else if (screen === 'appointments' || screen === 'appointments-list' || screen === 'payment-methods') content = <AppointmentScreen initialView={screen} request={bookingRequest} onRequestCreate={setBookingRequest} onRequestClear={() => setBookingRequest(null)} onOpenDoctorChat={doctor => { setChatContact(doctor); setScreen('doctor-chat'); }} onNavigate={navigate} onBack={() => setScreen(appointmentReturn)} />;
  else if (screen === 'medical-record') content = <MedicalRecordScreen profile={profile} onBack={() => setScreen(medicalRecordReturn)} onNavigate={navigate} />;
  else if (screen === 'personalization') content = <PersonalizationScreen profile={profile} onBack={() => setScreen(personalizationReturn)} onEditProfile={() => openProfileSetup('personalization')} onOpenMedicalRecord={() => { setMedicalRecordReturn('personalization'); setScreen('medical-record'); }} />;
  else content = <HomeScreen onNavigate={navigate} diary={diary} diaryTotals={diaryTotals} plan={plan} />;

  return <SafeAreaView style={styles.safe}><StatusBar barStyle="dark-content" />{content}
    {!!storageError && <Text style={styles.storageError}>{storageError}</Text>}
    <View accessibilityRole="tablist" style={styles.nav}>{bottomTabs.map(tab => {
      const selected = screen === tab.key
        || (tab.key === 'appointments' && ['appointments-list', 'payment-methods'].includes(screen))
        || (tab.key === 'chat' && screen === 'doctor-chat')
        || (tab.key === 'profile' && (screen.startsWith('settings') || ['medical-record', 'personalization', 'profile-setup'].includes(screen)));
      return <TouchableOpacity
        key={tab.key}
        accessibilityRole="tab"
        accessibilityLabel={tab.title}
        accessibilityState={{ selected }}
        style={[styles.navItem, selected && styles.navItemSelected]}
        onPress={() => navigate(tab.key)}
      >
        <Text style={styles.navIcon} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{tab.icon}</Text>
      </TouchableOpacity>;
    })}</View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.canvas }, splash: { backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }, splashMark: { width: 76, height: 76, alignItems: 'center', justifyContent: 'center' }, splashVertical: { position: 'absolute', width: 27, height: 76, borderRadius: 11, backgroundColor: 'white' }, splashHorizontal: { position: 'absolute', width: 76, height: 27, borderRadius: 11, backgroundColor: 'white' }, splashTitle: { color: 'white', fontSize: 19, letterSpacing: 4, fontWeight: '300', marginTop: 24 }, splashLoader: { marginTop: 76 }, splashCopy: { color: 'white', fontSize: 12, marginTop: 10 }, nav: { position: 'absolute', bottom: 14, left: 30, right: 30, minHeight: 54, borderRadius: 29, backgroundColor: colors.primary, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingHorizontal: 8, elevation: 8 }, navItem: { alignItems: 'center', justifyContent: 'center', width: 48, minWidth: 48, minHeight: 48, borderRadius: 24 }, navItemSelected: { backgroundColor: 'rgba(255,255,255,0.16)' }, navIcon: { color: 'white', fontSize: 25 }, placeholderCopy: { color: colors.muted, fontSize: 14 }, storageError: { color: colors.danger, backgroundColor: '#FFF0F0', padding: 10, marginHorizontal: 16, borderRadius: 9, fontSize: 14 } });
