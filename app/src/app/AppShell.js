import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, Share, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
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
import { authService, isAuthConfigured } from '../services/auth-client';
import { api } from '../services/api';
import { colors } from '../theme/tokens';
import { bottomTabs } from '../navigation/routes';
import { hasUrgentRedFlags, validateProfile } from '../features/profile/profile-model.cjs';
import { createNotificationStateStorage } from '../services/notification-state-storage.cjs';

const emptyTotals = { energyKcal: 0, proteinG: 0, carbohydrateG: 0, fatG: 0, fiberG: 0, sodiumMg: 0 };
const notificationStateStorage = createNotificationStateStorage({ storage: SecureStore, initialItems: initialNotificationItems });

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
  const [authBusy, setAuthBusy] = useState(false);
  const [account, setAccount] = useState(null);
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
  const [notificationStorageError, setNotificationStorageError] = useState('');
  const [notificationStateReady, setNotificationStateReady] = useState(false);
  const [notificationSaveVersion, setNotificationSaveVersion] = useState(0);
  const [bookingRequest, setBookingRequest] = useState(null);
  const [medicalRecordReturn, setMedicalRecordReturn] = useState('profile');
  const [settingsReturn, setSettingsReturn] = useState('profile');
  const [personalizationReturn, setPersonalizationReturn] = useState('profile');
  const [appointmentReturn, setAppointmentReturn] = useState('home');
  const [chatContact, setChatContact] = useState(null);
  const [notifications, setNotifications] = useState(initialNotificationItems);
  const notificationWriteQueue = useRef(Promise.resolve());
  const authEpoch = useRef(0);
  const authAccountId = useRef(null);
  const finishLaunch = useCallback(() => setLaunchComplete(true), []);

  const clearAccountState = useCallback(() => {
    authEpoch.current += 1;
    authAccountId.current = null;
    setAccount(null); setConsentRecord(null); setConsented(false); setProfile(null); setPlan(null);
    setDiary([]); setDiaryTotals(emptyTotals); setDiaryHydrationError(''); setDiaryLoading(false);
    setGroceryItems(null); setBookingRequest(null); setChatContact(null); setNotifications(initialNotificationItems);
    setScreen('welcome');
  }, []);

  const hydrateAccount = useCallback(async user => {
    if (!user?.id) return;
    const epoch = ++authEpoch.current;
    authAccountId.current = user.id;
    setAccount(user);
    setStorageError('');
    setProfile(null); setPlan(null); setDiary([]); setDiaryTotals(emptyTotals); setGroceryItems(null); setBookingRequest(null);
    try {
      const currentUser = await api.getCurrentUser();
      if (currentUser?.user?.id !== user.id || epoch !== authEpoch.current) return;
      const consentResult = await api.getMyConsent();
      if (epoch !== authEpoch.current) return;
      const record = consentResult?.consent || null;
      setConsentRecord(record);
      const requiredChoices = ['profile_processing', 'nutrition_processing', 'data_lifecycle'];
      const hasConsent = record?.version === consentResult.currentVersion && requiredChoices.every(key => record.choices?.[key] === true);
      setConsented(hasConsent);
      if (!hasConsent) { setScreen('consent'); return; }
      const profileResult = await api.getMyProfile();
      if (epoch !== authEpoch.current) return;
      setProfile(profileResult?.profile || null);
      setScreen(profileResult?.profile ? 'home' : 'profile-setup');
    } catch (error) {
      if (epoch !== authEpoch.current) return;
      setStorageError(error?.message || 'Không thể tải dữ liệu tài khoản. Hãy thử lại.');
      setScreen('account-error');
    }
  }, []);

  useEffect(() => {
    let active = true;
    notificationStateStorage.load().catch(() => ({
      items: initialNotificationItems,
      warning: 'Không đọc được trạng thái thông báo đã lưu. Trạng thái mẫu đang dùng trong phiên này.',
    })).then(savedNotifications => {
      if (!active) return;
      setNotifications(savedNotifications.items);
      setNotificationStorageError(savedNotifications.warning);
      setNotificationStateReady(true);
    });
    (async () => {
      try {
        if (isAuthConfigured) {
          const restored = await authService.restoreSession();
          if (active && restored?.user) await hydrateAccount(restored.user);
        }
      } catch (error) {
        if (active) setStorageError(error?.message || 'Không thể khôi phục phiên đăng nhập.');
      } finally { if (active) setReady(true); }
    })();
    return () => { active = false; };
  }, [hydrateAccount]);

  useEffect(() => {
    if (!isAuthConfigured) return undefined;
    const unsubscribe = authService.subscribe(({ event, session, user }) => {
      if (event === 'PASSWORD_RECOVERY') { setScreen('auth-reset-password'); return; }
      if (event === 'SIGNED_OUT') { clearAccountState(); return; }
      if (event === 'SIGNED_IN' && user && authAccountId.current !== user.id) {
        clearAccountState();
        setTimeout(() => { if (authAccountId.current !== user.id) hydrateAccount(user); }, 0);
      }
    });
    const link = Linking.addEventListener('url', ({ url }) => {
      authService.completeCallback(url).catch(error => setStorageError(error?.message || 'Liên kết xác thực không hợp lệ hoặc đã hết hạn.'));
    });
    Linking.getInitialURL().then(url => {
      if (url) authService.completeCallback(url).catch(error => setStorageError(error?.message || 'Liên kết xác thực không hợp lệ hoặc đã hết hạn.'));
    }).catch(() => setStorageError('Không thể mở liên kết xác thực.'));
    return () => { unsubscribe?.(); link.remove(); };
  }, [clearAccountState, hydrateAccount]);

  useEffect(() => {
    if (!notificationStateReady) return;
    const itemsToSave = notifications;
    notificationWriteQueue.current = notificationWriteQueue.current.catch(() => undefined)
      .then(() => notificationStateStorage.save(itemsToSave))
      .then(() => setNotificationStorageError(''))
      .catch(() => setNotificationStorageError('Không lưu được trạng thái đã đọc trên thiết bị. Bạn có thể thử lưu lại.'));
  }, [notificationStateReady, notifications, notificationSaveVersion]);

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
      const result = await api.saveMyConsent(choices);
      const record = result?.consent;
      setConsentRecord(record);
      const accepted = record?.version === result.currentVersion
        && ['profile_processing', 'nutrition_processing', 'data_lifecycle'].every(key => record.choices?.[key] === true);
      setConsented(accepted);
      if (!accepted) { setProfile(null); setScreen('consent'); }
      else setScreen(screen === 'consent-review' ? consentReturnScreen : profile ? 'home' : 'profile-setup');
      setStorageError('');
    } catch (error) { setStorageError(error?.message || 'Không thể lưu lựa chọn trên máy chủ. Hãy thử lại.'); }
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
      const payload = {
        ...nextProfile,
        username: nextProfile.username || account?.username,
        age: Number(nextProfile.age),
        heightCm: Number(nextProfile.heightCm),
        weightKg: Number(nextProfile.weightKg),
      };
      const result = await api.saveMyProfile(payload);
      setProfile(result.profile);
      setPlan(null);
      setScreen(profile ? profileSetupReturn : 'home');
      setStorageError('');
    } catch (error) { setStorageError(error?.message || 'Không thể lưu hồ sơ tài khoản. Chưa tiếp tục với dữ liệu chưa được máy chủ xác nhận.'); }
  }

  async function withdrawConsentAndDelete() {
    Alert.alert('Thu hồi quyền xử lý dữ liệu?', 'Ứng dụng sẽ dừng mở các tính năng xử lý hồ sơ và dinh dưỡng. Dữ liệu không tự bị xóa; hãy dùng chức năng xóa tài khoản nếu muốn yêu cầu xóa dữ liệu.', [
      { text: 'Giữ nguyên', style: 'cancel' },
      { text: 'Thu hồi quyền xử lý', style: 'destructive', onPress: async () => {
        try {
          const choices = { ...(consentRecord?.choices || {}), profile_processing: false, nutrition_processing: false, data_lifecycle: false };
          const result = await api.saveMyConsent(choices);
          setConsentRecord(result.consent); setConsented(false); setProfile(null); setPlan(null); setDiary([]); setDiaryTotals(emptyTotals); setScreen('consent'); setStorageError('');
        } catch (error) { setStorageError(error?.message || 'Không thể xác nhận thay đổi. Lựa chọn hiện tại vẫn được giữ.'); }
      } },
    ]);
  }

  async function handleAuthSubmit(input) {
    setAuthBusy(true);
    try {
      const result = input.mode === 'register'
        ? await authService.register(input)
        : await authService.login(input);
      if (result?.session && result.user) await hydrateAccount(result.user);
      return result;
    } finally { setAuthBusy(false); }
  }

  async function handleRecoveryRequest({ method, recipient }) {
    setAuthBusy(true);
    try {
      return method === 'sms'
        ? await authService.requestSmsRecovery(recipient)
        : await authService.requestEmailRecovery(recipient);
    } finally { setAuthBusy(false); }
  }

  async function handleRecoveryVerify(input) {
    setAuthBusy(true);
    try { return await authService.verifySmsRecovery(input); }
    finally { setAuthBusy(false); }
  }

  async function handlePasswordUpdate(input) {
    setAuthBusy(true);
    try { return await authService.updateRecoveredPassword(input); }
    finally { setAuthBusy(false); }
  }

  async function handleAccountPasswordUpdate(input) {
    setAuthBusy(true);
    try { return await authService.updatePassword(input); }
    finally { setAuthBusy(false); }
  }

  async function handlePhoneLink(phone) {
    setAuthBusy(true);
    try { return await authService.requestPhoneLink(phone); }
    finally { setAuthBusy(false); }
  }

  async function handlePhoneVerify(input) {
    setAuthBusy(true);
    try {
      const result = await authService.verifyPhoneLink(input);
      setAccount(current => current ? { ...current, phone: result.phone } : current);
      return result;
    } finally { setAuthBusy(false); }
  }

  async function handleAccountExport() {
    setAuthBusy(true);
    try {
      const data = await api.getMyAccountExport();
      await Share.share({ title: 'Bản xuất dữ liệu tài khoản', message: JSON.stringify(data, null, 2) });
    } catch (error) { setStorageError(error?.message || 'Không thể xuất dữ liệu tài khoản lúc này.'); }
    finally { setAuthBusy(false); }
  }

  async function handleAccountDelete() {
    setAuthBusy(true);
    try {
      await api.deleteMyAccount();
    } catch (error) {
      setStorageError(error?.message || 'Chưa thể hoàn tất xóa tài khoản. Dữ liệu vẫn được giữ lại để thử lại.');
      setAuthBusy(false);
      return;
    }
    try { await authService.logout(); } catch { /* The server deletion already revoked account access. */ }
    clearAccountState();
    setAuthBusy(false);
    Alert.alert('Đã xóa tài khoản', 'Tài khoản đã được xóa khỏi dịch vụ xác thực và bạn đã đăng xuất khỏi thiết bị.');
  }

  async function handleLogout() {
    setAuthBusy(true);
    try { await authService.logout(); clearAccountState(); }
    catch (error) { setStorageError(error?.message || 'Không thể đăng xuất an toàn. Hãy thử lại.'); }
    finally { setAuthBusy(false); }
  }

  if (!launchComplete) return <SafeAreaView style={styles.safe}><LaunchScreen onComplete={finishLaunch} ready={ready} /></SafeAreaView>;
  if (!ready) return <SafeAreaView style={[styles.safe, styles.splash]}><StatusBar barStyle="light-content" /><View style={styles.splashMark}><View style={styles.splashVertical} /><View style={styles.splashHorizontal} /></View><Text style={styles.splashTitle}>CLINICARE</Text><ActivityIndicator color="white" style={styles.splashLoader} /><Text style={styles.splashCopy}>Đang khôi phục phiên tài khoản…</Text></SafeAreaView>;
  if (screen === 'welcome') return <SafeAreaView style={styles.safe}><StatusBar barStyle="dark-content" /><WelcomeScreen serviceConfigured={isAuthConfigured} onLogin={() => { setAuthReturn('welcome'); setScreen('auth-login'); }} onRegister={() => { setAuthReturn('welcome'); setScreen('auth-register'); }} />{!!storageError && <Text style={styles.storageError}>{storageError}</Text>}</SafeAreaView>;
  if (screen.startsWith('auth-')) return <SafeAreaView style={styles.safe}><StatusBar barStyle="dark-content" /><AuthScreen mode={screen.slice(5)} busy={authBusy} onBack={() => setScreen(authReturn)} onModeChange={mode => setScreen(`auth-${mode}`)} onSubmit={handleAuthSubmit} onRecoveryRequest={handleRecoveryRequest} onRecoveryVerify={handleRecoveryVerify} onUpdatePassword={handlePasswordUpdate} /></SafeAreaView>;
  if (screen === 'account-error') return <SafeAreaView style={styles.safe}><StatusBar barStyle="dark-content" /><View style={styles.accountError}><Text accessibilityRole="header" style={styles.splashTitle}>Chưa tải được tài khoản</Text><Text style={styles.accountErrorText}>{storageError}</Text><TouchableOpacity accessibilityRole="button" style={styles.retryButton} onPress={() => account && hydrateAccount(account)}><Text style={styles.retryText}>Thử lại</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" style={styles.retryButton} onPress={handleLogout}><Text style={styles.retryText}>Đăng xuất</Text></TouchableOpacity></View></SafeAreaView>;
  if (!consented || screen === 'consent-review') return <SafeAreaView style={styles.safe}><StatusBar barStyle="dark-content" /><ConsentScreen onContinue={acceptConsent} busy={consentSaving} initialChoices={consentRecord?.choices} onBack={screen === 'consent-review' ? () => setScreen(consentReturnScreen) : undefined} onWithdraw={profile || consentRecord ? withdrawConsentAndDelete : undefined} />{!!storageError && <Text style={styles.storageError}>{storageError}</Text>}</SafeAreaView>;
  if (!profile || screen === 'profile-setup') return <SafeAreaView style={styles.safe}><StatusBar barStyle="dark-content" /><ProfileSetupScreen key={`${profile?.mode || 'new'}-${profile?.version || 1}`} initialProfile={profile || { username: account?.username || '' }} onComplete={completeProfile} onBack={backFromProfileSetup} onWithdrawConsent={withdrawConsentAndDelete} />{!!storageError && <Text style={styles.storageError}>{storageError}</Text>}</SafeAreaView>;

  function openGrocery(items) { setGroceryReturn(screen); setGroceryItems(Array.isArray(items) ? items : null); setScreen('grocery'); }
  async function deleteProfileData() {
    await api.deleteMyProfile();
    setProfile(null); setPlan(null); setGroceryItems(null); setScreen('profile-setup');
    Alert.alert('Đã xóa hồ sơ sức khỏe', 'Hồ sơ sức khỏe tài khoản đã được máy chủ xóa. Biên nhận đồng ý và các dữ liệu tính năng khác vẫn được giữ lại.');
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
  else if (screen === 'dashboard') content = <DashboardScreen diary={diary} diaryTotals={diaryTotals} diaryError={diaryHydrationError} diaryLoading={diaryLoading} onRetryDiary={() => setDiaryHydrationVersion(value => value + 1)} plan={plan} />;
  else if (screen === 'profile') content = <ProfileScreen profile={profile} account={account} consentRecord={consentRecord} onEdit={() => openProfileSetup('profile')} onDeleted={deleteProfileData} onWithdrawConsent={withdrawConsentAndDelete} onReviewConsent={() => reviewConsent('profile')} onNavigate={navigate} onExitDemo={handleLogout} />;
  else if (screen === 'chat') content = <ChatScreen onNavigate={navigate} />;
  else if (screen === 'doctor-chat') content = <ChatScreen contact={chatContact} onNavigate={navigate} />;
  else if (screen === 'notifications') content = <NotificationsScreen items={notifications} onItemsChange={setNotifications} onNavigate={navigate} persistenceError={notificationStorageError} onRetryPersistence={() => setNotificationSaveVersion(value => value + 1)} />;
  else if (screen.startsWith('settings')) content = <SettingsScreen screen={screen} account={account} phone={account?.phone} busy={authBusy} onNavigate={navigate} onBack={() => setScreen(settingsReturn)} onForgotPassword={() => { setAuthReturn('settings-password'); setScreen('auth-forgot'); }} onUpdatePassword={handleAccountPasswordUpdate} onRequestPhoneLink={handlePhoneLink} onVerifyPhoneLink={handlePhoneVerify} onExportAccount={handleAccountExport} onDeleteAccount={handleAccountDelete} />;
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

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.canvas }, splash: { backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }, splashMark: { width: 76, height: 76, alignItems: 'center', justifyContent: 'center' }, splashVertical: { position: 'absolute', width: 27, height: 76, borderRadius: 11, backgroundColor: 'white' }, splashHorizontal: { position: 'absolute', width: 76, height: 27, borderRadius: 11, backgroundColor: 'white' }, splashTitle: { color: 'white', fontSize: 19, letterSpacing: 4, fontWeight: '300', marginTop: 24 }, splashLoader: { marginTop: 76 }, splashCopy: { color: 'white', fontSize: 12, marginTop: 10 }, accountError: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.surface }, accountErrorText: { color: colors.muted, fontSize: 14, lineHeight: 21, textAlign: 'center', marginVertical: 18 }, retryButton: { minHeight: 50, minWidth: 180, alignItems: 'center', justifyContent: 'center', marginTop: 8, backgroundColor: colors.primary, borderRadius: 24 }, retryText: { color: 'white', fontWeight: '800' }, nav: { position: 'absolute', bottom: 14, left: 30, right: 30, minHeight: 54, borderRadius: 29, backgroundColor: colors.primary, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingHorizontal: 8, elevation: 8 }, navItem: { alignItems: 'center', justifyContent: 'center', width: 48, minWidth: 48, minHeight: 48, borderRadius: 24 }, navItemSelected: { backgroundColor: 'rgba(255,255,255,0.16)' }, navIcon: { color: 'white', fontSize: 25 }, placeholderCopy: { color: colors.muted, fontSize: 14 }, storageError: { color: colors.danger, backgroundColor: '#FFF0F0', padding: 10, marginHorizontal: 16, borderRadius: 9, fontSize: 14 } });
