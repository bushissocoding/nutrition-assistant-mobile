import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../../services/api';
import { colors, radius } from '../../theme/tokens';

const DAY_MS = 24 * 60 * 60 * 1000;
const STATUS_LABELS = {
  awaiting_payment: 'Chờ thanh toán', confirmed: 'Đã xác nhận', completed: 'Đã hoàn tất',
  cancelled: 'Đã hủy', expired: 'Đã hết hạn',
};
const CANCELLATION_NOTICE_MS = 24 * DAY_MS;

function makeIntentKey() {
  return `appointment-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function getNextSevenDayRange() {
  const from = new Date();
  const to = new Date(from.getTime() + 7 * DAY_MS);
  return { from: from.toISOString(), to: to.toISOString() };
}

function localDateKey(value) {
  const date = new Date(value);
  const pad = number => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Thời gian không hợp lệ';
  return new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

function formatTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '--:--';
  return new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' }).format(date);
}

function makeDateChoices() {
  const today = new Date();
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + index, 12);
    return {
      key: localDateKey(date),
      day: date.getDate(),
      weekday: new Intl.DateTimeFormat('vi-VN', { weekday: 'short' }).format(date),
      month: new Intl.DateTimeFormat('vi-VN', { month: 'short' }).format(date),
    };
  });
}

function statusLabel(status) { return STATUS_LABELS[status] || 'Trạng thái chưa xác định'; }

function getVisibleAppointments(items, tab) {
  const now = Date.now();
  if (tab === 'Sắp tới') return items.filter(item => ['awaiting_payment', 'confirmed'].includes(item.status) && new Date(item.startsAt).getTime() >= now);
  if (tab === 'Đã hủy') return items.filter(item => ['cancelled', 'expired'].includes(item.status));
  return items.filter(item => item.status === 'completed' || new Date(item.startsAt).getTime() < now);
}

function ScreenHeader({ title, onBack, rightLabel, onRight }) {
  return <View style={styles.header}>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Quay lại" style={styles.backButton} onPress={onBack}><Text style={styles.backGlyph}>‹</Text></TouchableOpacity>
    <Text accessibilityRole="header" style={styles.title}>{title}</Text>
    {rightLabel ? <TouchableOpacity accessibilityRole="button" style={styles.headerAction} onPress={onRight}><Text style={styles.headerActionText}>{rightLabel}</Text></TouchableOpacity> : <View style={styles.headerSpacer} />}
  </View>;
}

function PrimaryButton({ title, onPress, disabled, loading, secondary = false, accessibilityLabel }) {
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={[styles.button, secondary && styles.secondaryButton, disabled && styles.buttonDisabled]} onPress={onPress} disabled={disabled || loading}>
    {loading ? <ActivityIndicator color={secondary ? colors.primary : 'white'} /> : <Text style={[styles.buttonText, secondary && styles.secondaryButtonText]}>{title}</Text>}
  </TouchableOpacity>;
}

function InlineMessage({ error, success }) {
  return <>
    {!!error && <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text>}
    {!!success && <Text accessibilityLiveRegion="polite" style={styles.successText}>{success}</Text>}
  </>;
}

export default function AppointmentScreen({ initialView = 'doctors', account, onOpenDoctorChat, onNavigate, onBack }) {
  const initialPage = initialView === 'appointments-list' ? 'appointments' : initialView === 'provider-workspace' ? 'provider' : 'providers';
  const [page, setPage] = useState(initialPage);
  const [providers, setProviders] = useState([]);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [providersError, setProvidersError] = useState('');
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [availability, setAvailability] = useState([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState('');
  const [selectedDate, setSelectedDate] = useState(localDateKey(new Date()));
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [patientName, setPatientName] = useState('');
  const [patientPhone, setPatientPhone] = useState(account?.phone || '');
  const [symptomNote, setSymptomNote] = useState('');
  const [sharingAccepted, setSharingAccepted] = useState(false);
  const [bookingError, setBookingError] = useState('');
  const [bookingBusy, setBookingBusy] = useState(false);
  const [bookingAppointment, setBookingAppointment] = useState(null);
  const bookingIntent = useRef(null);
  const [appointments, setAppointments] = useState([]);
  const [appointmentsLoading, setAppointmentsLoading] = useState(false);
  const [appointmentsError, setAppointmentsError] = useState('');
  const [appointmentTab, setAppointmentTab] = useState('Sắp tới');
  const [appointmentsPage, setAppointmentsPage] = useState({ total: 0, offset: 0, hasMore: false });
  const [actionError, setActionError] = useState('');
  const [actionBusyId, setActionBusyId] = useState('');
  const [provider, setProvider] = useState(null);
  const [providerLoading, setProviderLoading] = useState(false);
  const [providerError, setProviderError] = useState('');
  const [providerAppointments, setProviderAppointments] = useState([]);
  const [providerSlots, setProviderSlots] = useState([]);
  const [profileName, setProfileName] = useState('');
  const [profileSpecialty, setProfileSpecialty] = useState('');
  const [profileBio, setProfileBio] = useState('');
  const [profileExperience, setProfileExperience] = useState('0');
  const [profileFee, setProfileFee] = useState('0');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [licenseRegion, setLicenseRegion] = useState('Việt Nam');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState('');
  const [slotDateInput, setSlotDateInput] = useState(() => {
    const date = new Date(Date.now() + DAY_MS);
    return localDateKey(date);
  });
  const [slotTimeInput, setSlotTimeInput] = useState('09:00');
  const [slotBusy, setSlotBusy] = useState(false);
  const [slotError, setSlotError] = useState('');
  const [dataVersion, setDataVersion] = useState(0);
  const dates = useMemo(makeDateChoices, []);
  const visibleAppointments = useMemo(() => getVisibleAppointments(appointments, appointmentTab), [appointments, appointmentTab]);
  const daySlots = useMemo(() => availability.filter(slot => localDateKey(slot.startsAt) === selectedDate), [availability, selectedDate]);

  useEffect(() => {
    if (page !== 'providers') return undefined;
    let active = true;
    setProvidersLoading(true); setProvidersError('');
    api.getMyProviders({ query: appliedQuery, specialty, limit: 25, offset: 0 }).then(result => {
      if (active) setProviders(Array.isArray(result?.items) ? result.items : []);
    }).catch(error => { if (active) setProvidersError(error?.message || 'Không tải được danh sách bác sĩ.'); })
      .finally(() => { if (active) setProvidersLoading(false); });
    return () => { active = false; };
  }, [page, appliedQuery, specialty, dataVersion]);

  useEffect(() => {
    if (page !== 'schedule' || !selectedProvider) return undefined;
    let active = true;
    const range = getNextSevenDayRange();
    setAvailabilityLoading(true); setAvailabilityError(''); setAvailability([]); setSelectedSlot(null);
    api.getMyProviderAvailability(selectedProvider.id, range).then(result => {
      if (active) setAvailability(Array.isArray(result?.items) ? result.items : []);
    }).catch(error => { if (active) setAvailabilityError(error?.message || 'Không tải được lịch trống.'); })
      .finally(() => { if (active) setAvailabilityLoading(false); });
    return () => { active = false; };
  }, [page, selectedProvider, dataVersion]);

  useEffect(() => {
    if (page !== 'appointments') return undefined;
    let active = true;
    setAppointmentsLoading(true); setAppointmentsError('');
    api.getMyAppointments({ limit: 25, offset: 0 }).then(result => {
      if (!active) return;
      setAppointments(Array.isArray(result?.items) ? result.items : []);
      setAppointmentsPage({ total: Number.isSafeInteger(result?.total) ? result.total : 0, offset: Array.isArray(result?.items) ? result.items.length : 0, hasMore: result?.hasMore === true });
    }).catch(error => { if (active) setAppointmentsError(error?.message || 'Không tải được lịch hẹn.'); })
      .finally(() => { if (active) setAppointmentsLoading(false); });
    return () => { active = false; };
  }, [page, dataVersion]);

  useEffect(() => {
    if (page !== 'provider') return undefined;
    let active = true;
    setProviderLoading(true); setProviderError(''); setProfileSaved('');
    api.getMyProviderProfile().then(async result => {
      if (!active) return;
      const current = result?.provider || null;
      setProvider(current);
      if (current) {
        setProfileName(current.displayName || ''); setProfileSpecialty(current.specialty || ''); setProfileBio(current.bio || '');
        setProfileExperience(String(current.experienceYears ?? 0)); setProfileFee(String(current.feeVnd ?? 0));
        setLicenseNumber(current.credentials?.licenseNumber || ''); setLicenseRegion(current.credentials?.region || 'Việt Nam');
      }
      if (current?.verificationStatus === 'verified') {
        const range = getNextSevenDayRange();
        const [slotResult, appointmentResult] = await Promise.all([api.getMyProviderAvailabilitySlots(range), api.getMyProviderAppointments({ limit: 25, offset: 0 })]);
        if (!active) return;
        setProviderSlots(Array.isArray(slotResult?.items) ? slotResult.items : []);
        setProviderAppointments(Array.isArray(appointmentResult?.items) ? appointmentResult.items : []);
      } else { setProviderSlots([]); setProviderAppointments([]); }
    }).catch(error => { if (active) setProviderError(error?.message || 'Không tải được không gian nhà cung cấp.'); })
      .finally(() => { if (active) setProviderLoading(false); });
    return () => { active = false; };
  }, [page, dataVersion]);

  async function saveProviderApplication() {
    setProfileSaving(true); setProviderError(''); setProfileSaved('');
    try {
      const result = await api.saveMyProviderApplication({
        profile: { displayName: profileName, specialty: profileSpecialty, bio: profileBio, experienceYears: Number(profileExperience), feeVnd: Number(profileFee) },
        credentials: { licenseNumber, region: licenseRegion },
      });
      setProvider(result?.provider || null); setProfileSaved('Đã gửi hồ sơ để nhà vận hành xác minh.');
    } catch (error) { setProviderError(error?.message || 'Không lưu được hồ sơ nhà cung cấp.'); }
    finally { setProfileSaving(false); }
  }

  async function createBooking() {
    if (!selectedProvider || !selectedSlot) return;
    const payload = {
      providerId: selectedProvider.id,
      slotId: selectedSlot.id,
      patientName: patientName.trim().replace(/\s+/g, ' '),
      phone: patientPhone.trim(),
      symptomNote: symptomNote.trim().replace(/\s+/g, ' '),
      providerSharingAccepted: sharingAccepted,
    };
    const signature = JSON.stringify(payload);
    if (!bookingIntent.current || bookingIntent.current.signature !== signature) bookingIntent.current = { signature, key: makeIntentKey() };
    setBookingBusy(true); setBookingError('');
    try {
      const result = await api.createMyAppointment(payload, bookingIntent.current.key);
      if (!result?.appointment?.id) throw new Error('Máy chủ chưa xác nhận giữ chỗ. Hãy tải lịch hẹn để đối chiếu trước khi thử lại.');
      setBookingAppointment(result.appointment); setPage('booking-pending');
    } catch (error) { setBookingError(error?.message || 'Không tạo được yêu cầu đặt lịch.'); }
    finally { setBookingBusy(false); }
  }

  async function loadMoreAppointments() {
    if (appointmentsLoading || !appointmentsPage.hasMore) return;
    setAppointmentsLoading(true); setAppointmentsError('');
    try {
      const result = await api.getMyAppointments({ limit: 25, offset: appointmentsPage.offset });
      const next = Array.isArray(result?.items) ? result.items : [];
      setAppointments(current => [...current, ...next.filter(item => !current.some(existing => existing.id === item.id))]);
      setAppointmentsPage({ total: result.total, offset: appointmentsPage.offset + next.length, hasMore: result.hasMore === true });
    } catch (error) { setAppointmentsError(error?.message || 'Không tải thêm được lịch hẹn.'); }
    finally { setAppointmentsLoading(false); }
  }

  async function cancelAppointment(appointment, actor = 'patient') {
    setActionBusyId(appointment.id); setActionError('');
    const payload = { reason: 'schedule-change', note: '' };
    try {
      const result = actor === 'provider'
        ? await api.cancelMyProviderAppointment(appointment.id, payload)
        : await api.cancelMyAppointment(appointment.id, payload);
      const updated = result?.appointment;
      if (!updated?.id) throw new Error('Máy chủ chưa xác nhận thay đổi lịch hẹn.');
      if (actor === 'provider') setProviderAppointments(current => current.map(row => row.id === updated.id ? updated : row));
      else setAppointments(current => current.map(row => row.id === updated.id ? updated : row));
    } catch (error) { setActionError(error?.message || 'Không cập nhật được lịch hẹn.'); }
    finally { setActionBusyId(''); }
  }

  async function completeAppointment(appointment) {
    setActionBusyId(appointment.id); setActionError('');
    try {
      const result = await api.completeMyProviderAppointment(appointment.id);
      if (!result?.appointment?.id) throw new Error('Máy chủ chưa xác nhận hoàn tất lịch hẹn.');
      setProviderAppointments(current => current.map(row => row.id === appointment.id ? result.appointment : row));
    } catch (error) { setActionError(error?.message || 'Không hoàn tất được lịch hẹn.'); }
    finally { setActionBusyId(''); }
  }

  async function createProviderSlot() {
    setSlotBusy(true); setSlotError('');
    try {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(slotDateInput) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(slotTimeInput)) throw new Error('Nhập ngày YYYY-MM-DD và giờ HH:mm hợp lệ.');
      const start = new Date(`${slotDateInput}T${slotTimeInput}:00`);
      if (!Number.isFinite(start.getTime())) throw new Error('Ngày giờ không hợp lệ trên thiết bị.');
      const result = await api.createMyProviderAvailabilitySlot({ startsAt: start.toISOString(), endsAt: new Date(start.getTime() + 30 * 60 * 1000).toISOString() });
      if (!result?.slot?.id) throw new Error('Máy chủ chưa xác nhận khung giờ.');
      setProviderSlots(current => [...current.filter(slot => slot.id !== result.slot.id), result.slot].sort((left, right) => left.startsAt.localeCompare(right.startsAt)));
      setProfileSaved('Đã mở khung giờ 30 phút.');
    } catch (error) { setSlotError(error?.message || 'Không mở được khung giờ.'); }
    finally { setSlotBusy(false); }
  }

  function confirmCancelAppointment(appointment, actor = 'patient') {
    Alert.alert('Hủy lịch hẹn?', actor === 'patient' && appointment.status === 'confirmed'
      ? 'Bạn có thể tự hủy trước giờ hẹn ít nhất 24 giờ. Khoản hoàn tiền (nếu có) cần được xác nhận riêng.'
      : 'Lịch hẹn sẽ chuyển sang trạng thái đã hủy và khung giờ phù hợp có thể được mở lại.', [
      { text: 'Giữ lịch', style: 'cancel' },
      { text: 'Hủy lịch', style: 'destructive', onPress: () => cancelAppointment(appointment, actor) },
    ]);
  }

  function renderProviderList() {
    return <>
      <ScreenHeader title="Bác sĩ dinh dưỡng" onBack={onBack} rightLabel="Lịch hẹn" onRight={() => setPage('appointments')} />
      <View style={styles.searchRow}><TextInput accessibilityLabel="Tìm bác sĩ hoặc chuyên khoa" value={query} onChangeText={setQuery} onSubmitEditing={() => setAppliedQuery(query.trim())} placeholder="Tìm theo tên hoặc chuyên khoa…" style={[styles.input, styles.searchRowInput]} returnKeyType="search" maxLength={100} /><PrimaryButton title="Tìm" onPress={() => setAppliedQuery(query.trim())} /></View>
      <View style={styles.filterRow}>{[['', 'Tất cả'], ['Dinh dưỡng', 'Dinh dưỡng'], ['Dinh dưỡng lâm sàng', 'Lâm sàng']].map(([value, label]) => <TouchableOpacity key={value} accessibilityRole="button" accessibilityState={{ selected: specialty === value }} style={[styles.chip, specialty === value && styles.chipOn]} onPress={() => setSpecialty(value)}><Text style={[styles.chipText, specialty === value && styles.chipTextOn]}>{label}</Text></TouchableOpacity>)}</View>
      <Text style={styles.notice}>Chỉ hiển thị nhà cung cấp đã được nhà vận hành xác minh. Thông tin này không thay thế đánh giá y tế.</Text>
      {providersLoading ? <Loading label="Đang tải danh bạ nhà cung cấp…" /> : providersError ? <ErrorState error={providersError} onRetry={() => setDataVersion(value => value + 1)} /> : providers.length ? providers.map(item => <View key={item.id} style={styles.card}>
        <Text style={styles.providerName}>{item.displayName}</Text><Text style={styles.body}>{item.specialty} · {item.experienceYears} năm kinh nghiệm</Text>
        <Text style={styles.verified}>✓ Đã xác minh</Text>
        {!!item.bio && <Text style={styles.body}>{item.bio}</Text>}
        <Text style={styles.fee}>{Number(item.feeVnd).toLocaleString('vi-VN')} ₫ / lượt · do nhà cung cấp khai báo</Text>
        <View style={styles.buttonRow}><PrimaryButton title={`Xem chi tiết ${item.displayName}`} onPress={() => { setSelectedProvider(item); setPage('detail'); }} secondary /><PrimaryButton title={`Chọn lịch của ${item.displayName}`} onPress={() => { setSelectedProvider(item); setSelectedDate(localDateKey(new Date())); setPage('schedule'); }} /></View>
      </View>) : <EmptyState title="Chưa có nhà cung cấp đã xác minh." detail="Danh bạ sẽ có nội dung sau khi nhà vận hành kiểm tra và phê duyệt hồ sơ thật." />}
      <PrimaryButton title="Đăng ký cung cấp dịch vụ" secondary onPress={() => setPage('provider')} />
      <PrimaryButton title="Xem lịch hẹn của tôi" secondary onPress={() => setPage('appointments')} />
    </>;
  }

  function renderProviderDetail() {
    if (!selectedProvider) return <ErrorState error="Không tìm thấy nhà cung cấp đã chọn." onRetry={() => setPage('providers')} />;
    return <>
      <ScreenHeader title="Thông tin nhà cung cấp" onBack={() => setPage('providers')} rightLabel="Lịch hẹn" onRight={() => setPage('appointments')} />
      <View style={styles.hero}><Text style={styles.providerName}>{selectedProvider.displayName}</Text><Text style={styles.body}>{selectedProvider.specialty}</Text><Text style={styles.verified}>✓ Đã xác minh</Text></View>
      <View style={styles.card}><Text style={styles.sectionTitle}>Kinh nghiệm</Text><Text style={styles.body}>{selectedProvider.experienceYears} năm kinh nghiệm</Text><Text style={styles.sectionTitle}>Giới thiệu</Text><Text style={styles.body}>{selectedProvider.bio || 'Nhà cung cấp chưa thêm phần giới thiệu.'}</Text><Text style={styles.sectionTitle}>Chi phí</Text><Text style={styles.fee}>{Number(selectedProvider.feeVnd).toLocaleString('vi-VN')} ₫ / lượt · do nhà cung cấp khai báo</Text></View>
      <PrimaryButton title="Chọn lịch trống" onPress={() => { setSelectedDate(localDateKey(new Date())); setPage('schedule'); }} />
      <Text style={styles.notice}>Lịch chỉ được giữ sau khi máy chủ xác nhận và cần thanh toán trong thời hạn hiển thị.</Text>
    </>;
  }

  function renderSchedule() {
    if (!selectedProvider) return <ErrorState error="Không tìm thấy nhà cung cấp đã chọn." onRetry={() => setPage('providers')} />;
    return <>
      <ScreenHeader title="Lịch còn trống" onBack={() => setPage('detail')} />
      <Text style={styles.providerName}>{selectedProvider.displayName}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateRow}>{dates.map(date => <TouchableOpacity key={date.key} accessibilityRole="button" accessibilityLabel={`${date.weekday}, ngày ${date.day} ${date.month}`} accessibilityState={{ selected: selectedDate === date.key }} style={[styles.dateChip, selectedDate === date.key && styles.dateChipOn]} onPress={() => { setSelectedDate(date.key); setSelectedSlot(null); }}><Text style={[styles.dateLabel, selectedDate === date.key && styles.dateLabelOn]}>{date.weekday}</Text><Text style={[styles.dateNumber, selectedDate === date.key && styles.dateLabelOn]}>{date.day}</Text><Text style={[styles.dateLabel, selectedDate === date.key && styles.dateLabelOn]}>{date.month}</Text></TouchableOpacity>)}</ScrollView>
      {availabilityLoading ? <Loading label="Đang kiểm tra lịch trống…" /> : availabilityError ? <ErrorState error={availabilityError} onRetry={() => setDataVersion(value => value + 1)} /> : daySlots.length ? <>
        <Text style={styles.sectionTitle}>Chọn một khung giờ còn trống do nhà cung cấp công bố.</Text>
        <View style={styles.slotGrid}>{daySlots.map(slot => <TouchableOpacity key={slot.id} accessibilityRole="button" accessibilityState={{ selected: selectedSlot?.id === slot.id }} style={[styles.slotChip, selectedSlot?.id === slot.id && styles.slotChipOn]} onPress={() => setSelectedSlot(slot)}><Text style={[styles.slotText, selectedSlot?.id === slot.id && styles.slotTextOn]}>{formatTime(slot.startsAt)}</Text></TouchableOpacity>)}</View>
      </> : <EmptyState title="Không có khung giờ còn trống trong ngày này." detail="Thử ngày khác hoặc quay lại sau khi nhà cung cấp mở thêm lịch." />}
      <PrimaryButton title="Tiếp tục" onPress={() => setPage('booking-form')} disabled={!selectedSlot || availabilityLoading || !!availabilityError} />
    </>;
  }

  function renderBookingForm() {
    return <>
      <ScreenHeader title="Thông tin người khám" onBack={() => setPage('schedule')} />
      <View style={styles.card}><Text style={styles.providerName}>{selectedProvider?.displayName}</Text><Text style={styles.body}>{selectedProvider?.specialty}</Text><Text style={styles.body}>{selectedSlot ? `${formatDate(selectedSlot.startsAt)} · ${formatTime(selectedSlot.startsAt)}` : ''}</Text><Text style={styles.fee}>{Number(selectedProvider?.feeVnd || 0).toLocaleString('vi-VN')} ₫</Text></View>
      <Text style={styles.inputLabel}>Tên người khám</Text><TextInput accessibilityLabel="Tên người khám" value={patientName} onChangeText={setPatientName} maxLength={100} placeholder="Họ và tên" style={styles.input} />
      <Text style={styles.inputLabel}>Số điện thoại có mã quốc gia</Text><TextInput accessibilityLabel="Số điện thoại có mã quốc gia" value={patientPhone} onChangeText={setPatientPhone} maxLength={16} keyboardType="phone-pad" placeholder="+84901234567" style={styles.input} />
      <Text style={styles.inputLabel}>Triệu chứng sơ bộ (tùy chọn)</Text><TextInput accessibilityLabel="Triệu chứng sơ bộ (tùy chọn)" value={symptomNote} onChangeText={setSymptomNote} maxLength={1000} multiline placeholder="Chỉ ghi thông tin cần thiết cho lần đặt lịch này" style={[styles.input, styles.multiline]} />
      <TouchableOpacity accessibilityRole="checkbox" accessibilityLabel="Đồng ý chia sẻ thông tin đặt lịch với bác sĩ đã chọn" accessibilityState={{ checked: sharingAccepted }} style={styles.consentRow} onPress={() => setSharingAccepted(value => !value)}><Text style={styles.checkbox}>{sharingAccepted ? '☑' : '□'}</Text><Text style={styles.body}>Tôi đồng ý chia sẻ tên, số điện thoại và ghi chú đặt lịch này với nhà cung cấp đã chọn.</Text></TouchableOpacity>
      <Text style={styles.notice}>Chỉ các thông tin trên được gửi kèm lịch hẹn. Hồ sơ dinh dưỡng và hồ sơ y tế không được tự động chia sẻ.</Text>
      <InlineMessage error={bookingError} />
      <PrimaryButton title="Giữ chỗ và tiếp tục" onPress={createBooking} disabled={!patientName.trim() || !patientPhone.trim() || !sharingAccepted || !selectedSlot} loading={bookingBusy} />
      {!!bookingError && <PrimaryButton title="Thử lại đặt lịch" onPress={createBooking} disabled={!sharingAccepted} secondary />}
    </>;
  }

  function renderPendingBooking() {
    const appointment = bookingAppointment;
    if (!appointment) return <ErrorState error="Không có giữ chỗ để hiển thị." onRetry={() => setPage('appointments')} />;
    return <>
      <ScreenHeader title="Giữ chỗ lịch hẹn" onBack={() => setPage('appointments')} rightLabel="Lịch của tôi" onRight={() => setPage('appointments')} />
      <View style={styles.statusHero}><Text style={styles.statusTitle}>Giữ chỗ đang chờ thanh toán</Text><Text style={styles.body}>Máy chủ đã giữ chỗ. Lịch chỉ được xác nhận sau khi nhà cung cấp thanh toán báo thành công.</Text></View>
      <AppointmentCard appointment={appointment} />
      {!!appointment.holdExpiresAt && <Text style={styles.notice}>Hạn giữ chỗ: {formatDate(appointment.holdExpiresAt)} · {formatTime(appointment.holdExpiresAt)}.</Text>}
      <PrimaryButton title="Tiếp tục thanh toán an toàn" onPress={() => setPage('checkout')} />
      <PrimaryButton title="Hủy giữ chỗ" onPress={() => confirmCancelAppointment(appointment)} secondary />
      <InlineMessage error={actionError} />
    </>;
  }

  function renderAppointments() {
    return <>
      <ScreenHeader title="Lịch hẹn của tôi" onBack={() => setPage('providers')} rightLabel="Đặt lịch" onRight={() => setPage('providers')} />
      <View style={styles.filterRow}>{['Sắp tới', 'Đã khám', 'Đã hủy'].map(tab => <TouchableOpacity key={tab} accessibilityRole="button" accessibilityState={{ selected: appointmentTab === tab }} style={[styles.chip, appointmentTab === tab && styles.chipOn]} onPress={() => setAppointmentTab(tab)}><Text style={[styles.chipText, appointmentTab === tab && styles.chipTextOn]}>{tab}</Text></TouchableOpacity>)}</View>
      {appointmentsLoading && appointments.length === 0 ? <Loading label="Đang tải lịch hẹn…" /> : appointmentsError ? <ErrorState error={appointmentsError} onRetry={() => setDataVersion(value => value + 1)} /> : visibleAppointments.length ? visibleAppointments.map(appointment => <View key={appointment.id}>
        <AppointmentCard appointment={appointment} />
        <View style={styles.buttonRow}>
          {appointment.status === 'awaiting_payment' && <PrimaryButton title="Tiếp tục thanh toán" onPress={() => { setBookingAppointment(appointment); setPage('checkout'); }} />}
          {appointment.status === 'confirmed' && appointment.providerId && onOpenDoctorChat && <PrimaryButton title="Nhắn nhà cung cấp" secondary onPress={() => onOpenDoctorChat(appointment)} />}
          {['awaiting_payment', 'confirmed'].includes(appointment.status) && (appointment.status !== 'confirmed' || new Date(appointment.startsAt).getTime() - Date.now() >= CANCELLATION_NOTICE_MS) && <PrimaryButton title={appointment.status === 'awaiting_payment' ? 'Hủy giữ chỗ' : 'Hủy lịch'} secondary onPress={() => confirmCancelAppointment(appointment)} loading={actionBusyId === appointment.id} />}
        </View>
      </View>) : <EmptyState title={appointmentTab === 'Sắp tới' ? 'Chưa có lịch hẹn sắp tới.' : `Chưa có lịch ở mục “${appointmentTab}”.`} detail="Lịch hẹn được tải từ tài khoản của bạn." />}
      <InlineMessage error={actionError} />
      {appointmentsPage.hasMore && <PrimaryButton title="Tải thêm lịch hẹn" onPress={loadMoreAppointments} loading={appointmentsLoading} secondary />}
      <PrimaryButton title="Tìm nhà cung cấp đã xác minh" onPress={() => setPage('providers')} secondary />
    </>;
  }

  function renderProviderApplication(showHeader = true) {
    return <>
      {showHeader && <ScreenHeader title="Hồ sơ nhà cung cấp" onBack={() => setPage('providers')} />}
      <Text style={styles.notice}>Hồ sơ và giấy phép chỉ dùng để nhà vận hành kiểm tra. Bạn không thể tự xác minh tài khoản.</Text>
      <Text style={styles.inputLabel}>Tên hiển thị</Text><TextInput accessibilityLabel="Tên hiển thị nhà cung cấp" value={profileName} onChangeText={setProfileName} maxLength={100} style={styles.input} />
      <Text style={styles.inputLabel}>Chuyên khoa</Text><TextInput accessibilityLabel="Chuyên khoa nhà cung cấp" value={profileSpecialty} onChangeText={setProfileSpecialty} maxLength={100} style={styles.input} />
      <Text style={styles.inputLabel}>Giới thiệu</Text><TextInput accessibilityLabel="Giới thiệu nhà cung cấp" value={profileBio} onChangeText={setProfileBio} maxLength={2000} multiline style={[styles.input, styles.multiline]} />
      <Text style={styles.inputLabel}>Số năm kinh nghiệm</Text><TextInput accessibilityLabel="Số năm kinh nghiệm" value={profileExperience} onChangeText={setProfileExperience} keyboardType="number-pad" style={styles.input} />
      <Text style={styles.inputLabel}>Phí dịch vụ (VND)</Text><TextInput accessibilityLabel="Phí dịch vụ VND" value={profileFee} onChangeText={setProfileFee} keyboardType="number-pad" style={styles.input} />
      <Text style={styles.inputLabel}>Số giấy phép hành nghề</Text><TextInput accessibilityLabel="Số giấy phép hành nghề" value={licenseNumber} onChangeText={setLicenseNumber} maxLength={100} style={styles.input} />
      <Text style={styles.inputLabel}>Nơi cấp giấy phép</Text><TextInput accessibilityLabel="Nơi cấp giấy phép" value={licenseRegion} onChangeText={setLicenseRegion} maxLength={100} style={styles.input} />
      <InlineMessage error={providerError} success={profileSaved} />
      <PrimaryButton title="Gửi hồ sơ để xác minh" onPress={saveProviderApplication} loading={profileSaving} disabled={!profileName.trim() || !profileSpecialty.trim() || !licenseNumber.trim()} />
    </>;
  }

  function renderProviderWorkspace() {
    if (providerLoading) return <><ScreenHeader title="Không gian nhà cung cấp" onBack={() => setPage('providers')} /><Loading label="Đang tải hồ sơ nhà cung cấp…" /></>;
    if (providerError && !provider) return <><ScreenHeader title="Không gian nhà cung cấp" onBack={() => setPage('providers')} /><ErrorState error={providerError} onRetry={() => setDataVersion(value => value + 1)} /></>;
    if (!provider || provider.verificationStatus !== 'verified') return <>
      <ScreenHeader title="Không gian nhà cung cấp" onBack={() => setPage('providers')} />
      {provider?.verificationStatus === 'pending' ? <EmptyState title="Hồ sơ đang chờ xác minh" detail="Bạn chưa thể công bố lịch hoặc nhận bệnh nhân. Nhà vận hành sẽ kiểm tra hồ sơ và giấy phép." /> : provider?.verificationStatus === 'suspended' ? <EmptyState title="Hồ sơ chưa được phê duyệt" detail="Cập nhật hồ sơ và giấy phép để gửi lại yêu cầu xác minh." /> : <EmptyState title="Chưa có hồ sơ nhà cung cấp" detail="Đăng ký bằng thông tin thật. Chỉ tài khoản được nhà vận hành xác minh mới được công bố lịch." />}
      {provider?.verificationStatus !== 'pending' && <View style={styles.applicationPanel}>{renderProviderApplication(false)}</View>}
    </>;
    return <>
      <ScreenHeader title="Không gian nhà cung cấp" onBack={() => setPage('providers')} rightLabel="Hồ sơ" onRight={() => setPage('provider-edit')} />
      <View style={styles.hero}><Text style={styles.providerName}>{provider.displayName}</Text><Text style={styles.verified}>✓ Tài khoản đã xác minh</Text></View>
      <Text accessibilityRole="header" style={styles.sectionTitle}>Mở một khung giờ 30 phút</Text>
      <TextInput accessibilityLabel="Ngày bắt đầu lịch YYYY-MM-DD" value={slotDateInput} onChangeText={setSlotDateInput} placeholder="YYYY-MM-DD" style={styles.input} autoCapitalize="none" />
      <TextInput accessibilityLabel="Giờ bắt đầu lịch HH:mm" value={slotTimeInput} onChangeText={setSlotTimeInput} placeholder="HH:mm" style={styles.input} autoCapitalize="none" />
      <InlineMessage error={slotError} success={profileSaved} />
      <PrimaryButton title="Mở khung giờ 30 phút" onPress={createProviderSlot} loading={slotBusy} />
      <Text accessibilityRole="header" style={styles.sectionTitle}>Lịch trống 7 ngày tới</Text>
      {providerSlots.length ? providerSlots.map(slot => <View key={slot.id} style={styles.card}>
        <Text style={styles.providerName}>{formatDate(slot.startsAt)} · {formatTime(slot.startsAt)}</Text>
        <Text style={styles.body}>{slot.status === 'open' ? 'Còn trống' : slot.status === 'reserved' ? 'Đang giữ chỗ' : slot.status === 'booked' ? 'Đã đặt' : 'Đã khóa'}</Text>
        {slot.status === 'open' && <PrimaryButton title="Gỡ khung giờ" secondary onPress={async () => {
          try { await api.deleteMyProviderAvailabilitySlot(slot.id); setProviderSlots(current => current.filter(row => row.id !== slot.id)); }
          catch (error) { setSlotError(error?.message || 'Không gỡ được khung giờ.'); }
        }} />}
      </View>) : <Text style={styles.body}>Chưa có khung giờ trong khoảng hiển thị.</Text>}
      <Text accessibilityRole="header" style={styles.sectionTitle}>Lịch hẹn được xác nhận</Text>
      {providerAppointments.length ? providerAppointments.map(appointment => <View key={appointment.id}>
        <AppointmentCard appointment={appointment} showPatient />
        <View style={styles.buttonRow}>
          {appointment.status === 'confirmed' && <PrimaryButton title="Đánh dấu hoàn tất" disabled={new Date(appointment.startsAt).getTime() > Date.now()} loading={actionBusyId === appointment.id} onPress={() => completeAppointment(appointment)} />}
          {appointment.status === 'confirmed' && <PrimaryButton title="Hủy lịch" secondary loading={actionBusyId === appointment.id} onPress={() => confirmCancelAppointment(appointment, 'provider')} />}
        </View>
      </View>) : <EmptyState title="Chưa có lịch hẹn được xác nhận." detail="Lịch chỉ xuất hiện sau khi phía thanh toán xác nhận giao dịch." />}
      <InlineMessage error={actionError} />
    </>;
  }

  function renderCheckout() {
    return <><ScreenHeader title="Thanh toán lịch hẹn" onBack={() => setPage('booking-pending')} /><EmptyState title="Đang chuẩn bị thanh toán an toàn" detail="Thanh toán sẽ mở trang do nhà cung cấp xử lý. Không nhập hoặc lưu số thẻ trong ứng dụng." /><PrimaryButton title="Quay lại giữ chỗ" onPress={() => setPage('booking-pending')} secondary /></>;
  }

  let content;
  if (page === 'providers') content = renderProviderList();
  else if (page === 'detail') content = renderProviderDetail();
  else if (page === 'schedule') content = renderSchedule();
  else if (page === 'booking-form') content = renderBookingForm();
  else if (page === 'booking-pending') content = renderPendingBooking();
  else if (page === 'checkout') content = renderCheckout();
  else if (page === 'appointments') content = renderAppointments();
  else if (page === 'provider-edit') content = renderProviderApplication();
  else if (page === 'provider') content = renderProviderWorkspace();
  else content = renderProviderList();

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">{content}</ScrollView>;
}

function Loading({ label }) { return <View style={styles.state}><ActivityIndicator color={colors.primary} /><Text style={styles.body}>{label}</Text></View>; }
function ErrorState({ error, onRetry }) { return <View style={styles.state}><Text accessibilityRole="alert" style={styles.errorText}>{error}</Text><PrimaryButton title="Thử tải lại" onPress={onRetry} secondary /></View>; }
function EmptyState({ title, detail }) { return <View style={styles.state}><Text accessibilityRole="header" style={styles.emptyTitle}>{title}</Text><Text style={styles.body}>{detail}</Text></View>; }
function AppointmentCard({ appointment, showPatient = false }) {
  return <View style={styles.card}>
    <Text style={styles.providerName}>{appointment.provider?.name || 'Nhà cung cấp'}</Text>
    <Text style={styles.body}>{appointment.provider?.specialty || ''}</Text>
    <Text style={styles.body}>{formatDate(appointment.startsAt)} · {formatTime(appointment.startsAt)}</Text>
    <Text style={styles.status}>{statusLabel(appointment.status)}</Text>
    <Text style={styles.fee}>{Number(appointment.amount?.value || 0).toLocaleString('vi-VN')} {appointment.amount?.currency || 'VND'}</Text>
    {showPatient && <View style={styles.patientDetails}><Text style={styles.body}>Người khám: {appointment.patient?.name}</Text><Text style={styles.body}>Liên hệ: {appointment.patient?.phone}</Text><Text style={styles.body}>Ghi chú đặt lịch: {appointment.patient?.preliminarySymptoms || 'Không có ghi chú'}</Text></View>}
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFF' }, content: { paddingHorizontal: 15, paddingBottom: 110 }, applicationPanel: { marginTop: 8 },
  header: { minHeight: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, backButton: { width: 42, minHeight: 48, justifyContent: 'center' }, backGlyph: { color: colors.primary, fontSize: 32 }, title: { flex: 1, color: colors.primary, fontSize: 18, fontWeight: '900', textAlign: 'center' }, headerSpacer: { width: 72 }, headerAction: { minWidth: 72, minHeight: 48, justifyContent: 'center', alignItems: 'flex-end' }, headerActionText: { color: colors.primary, fontSize: 13, fontWeight: '800' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, input: { minHeight: 52, borderRadius: 12, paddingHorizontal: 12, backgroundColor: 'white', borderWidth: 1, borderColor: colors.border, color: colors.text, fontSize: 15, marginTop: 7 }, searchRowInput: { flex: 1 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }, chip: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 13, borderRadius: radius.pill, backgroundColor: '#E8EDF8' }, chipOn: { backgroundColor: colors.primary }, chipText: { color: colors.primaryDark, fontSize: 13, fontWeight: '700' }, chipTextOn: { color: 'white' },
  notice: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 12, marginBottom: 8 }, card: { backgroundColor: 'white', borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14, marginTop: 10 }, hero: { padding: 18, borderRadius: 16, backgroundColor: '#EAF0FF', marginTop: 8 }, providerName: { color: colors.text, fontSize: 16, fontWeight: '900', lineHeight: 21, marginTop: 4 }, body: { color: colors.muted, fontSize: 14, lineHeight: 19, marginTop: 5 }, verified: { color: colors.success, fontSize: 13, fontWeight: '800', marginTop: 7 }, fee: { color: colors.primaryDark, fontSize: 15, fontWeight: '900', marginTop: 9 }, sectionTitle: { color: colors.text, fontSize: 15, fontWeight: '900', marginTop: 15 }, buttonRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 8 },
  button: { minHeight: 48, justifyContent: 'center', alignItems: 'center', borderRadius: radius.pill, backgroundColor: colors.primary, paddingHorizontal: 15, marginTop: 10, flexGrow: 1 }, secondaryButton: { backgroundColor: '#EAF0FF' }, buttonDisabled: { opacity: 0.45 }, buttonText: { color: 'white', fontWeight: '800', fontSize: 14 }, secondaryButtonText: { color: colors.primaryDark },
  state: { minHeight: 130, justifyContent: 'center', alignItems: 'center', padding: 22, borderRadius: 16, backgroundColor: 'white', marginTop: 14 }, emptyTitle: { color: colors.text, textAlign: 'center', fontSize: 16, fontWeight: '900' }, errorText: { color: colors.danger, fontSize: 14, lineHeight: 18, textAlign: 'center', marginTop: 8 }, successText: { color: colors.success, fontSize: 14, lineHeight: 18, marginTop: 9 },
  dateRow: { gap: 8, paddingVertical: 12 }, dateChip: { width: 60, minHeight: 72, alignItems: 'center', justifyContent: 'center', backgroundColor: 'white', borderRadius: 13, borderWidth: 1, borderColor: colors.border }, dateChipOn: { backgroundColor: colors.primary, borderColor: colors.primary }, dateLabel: { color: colors.muted, fontSize: 11 }, dateNumber: { color: colors.text, fontSize: 18, fontWeight: '900', marginVertical: 2 }, dateLabelOn: { color: 'white' }, slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 8 }, slotChip: { minWidth: 78, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: 'white', borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10 }, slotChipOn: { borderColor: colors.primary, backgroundColor: colors.primary }, slotText: { color: colors.primaryDark, fontSize: 14, fontWeight: '800' }, slotTextOn: { color: 'white' },
  inputLabel: { color: colors.text, fontSize: 13, fontWeight: '800', marginTop: 11 }, multiline: { minHeight: 100, textAlignVertical: 'top', paddingTop: 12 }, consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 14, padding: 12, borderRadius: 12, backgroundColor: 'white' }, checkbox: { color: colors.primary, fontSize: 22, lineHeight: 24 },
  statusHero: { backgroundColor: '#FFF6E8', borderRadius: 15, padding: 15, marginTop: 10 }, statusTitle: { color: colors.warning, fontSize: 17, fontWeight: '900' }, status: { color: colors.primary, fontSize: 13, fontWeight: '900', marginTop: 8 }, patientDetails: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 10, paddingTop: 8 },
});
