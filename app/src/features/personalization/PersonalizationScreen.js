import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { colors, radius } from '../../theme/tokens';
import { calculateAdultBmi, normalizeProfile } from '../profile/profile-model.cjs';
import { api } from '../../services/api';
import { MAX_RECORD_SOURCE_BYTES, validateHealthRecordCandidates } from '../../services/health-record-ocr.cjs';
import { recognizeLabImage } from '../../services/health-record-ocr';

const dietaryStyles = [{ value: 'simple', label: 'Đơn giản' }, { value: 'balanced', label: 'Cân bằng' }, { value: 'varied', label: 'Đa dạng' }];
const foodPreferences = [
  { value: 'vegetarian', label: 'Ăn chay' }, { value: 'low_sugar', label: 'Ít đường' },
  { value: 'low_salt', label: 'Ít muối' }, { value: 'mild', label: 'Không cay' },
  { value: 'Vietnamese', label: 'Món Việt' }, { value: 'easy_cook', label: 'Món dễ nấu' },
];
const defaultPreferences = { dietaryVariety: 'balanced', foodPreferences: ['Vietnamese'], allergyReminder: true, trackConfirmedTargets: false };
function copyPreferences(value) { return { dietaryVariety: value.dietaryVariety, foodPreferences: [...value.foodPreferences], allergyReminder: value.allergyReminder, trackConfirmedTargets: value.trackConfirmedTargets }; }
function preferenceSignature(value) { return JSON.stringify(copyPreferences(value)); }
function localDate() { const value = new Date(); return value.getFullYear() + '-' + String(value.getMonth() + 1).padStart(2, '0') + '-' + String(value.getDate()).padStart(2, '0'); }
function newRequestKey() { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => { const value = Math.floor(Math.random() * 16); return (char === 'x' ? value : (value & 0x3) | 0x8).toString(16); }); }

export default function PersonalizationScreen({ profile, onBack, onOpenMedicalRecord, onEditProfile, healthRecordConsent = false, onEnableHealthRecordStorage }) {
  const [screen, setScreen] = useState('preferences');
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [savedPreferences, setSavedPreferences] = useState(defaultPreferences);
  const [preferencesLoading, setPreferencesLoading] = useState(true);
  const [preferencesSaving, setPreferencesSaving] = useState(false);
  const [preferencesError, setPreferencesError] = useState('');
  const [preferencesNotice, setPreferencesNotice] = useState('');
  const [photo, setPhoto] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrError, setOcrError] = useState('');
  const [recordTitle, setRecordTitle] = useState('Kết quả xét nghiệm');
  const [recordDate, setRecordDate] = useState(localDate());
  const [recordNote, setRecordNote] = useState('');
  const [recordSaving, setRecordSaving] = useState(false);
  const [recordError, setRecordError] = useState('');
  const [recordSaved, setRecordSaved] = useState(false);
  const [savedRecordId, setSavedRecordId] = useState(null);
  const [pendingUpload, setPendingUpload] = useState(null);
  const [consentBusy, setConsentBusy] = useState(false);
  const requestKey = useRef(newRequestKey());
  const normalized = normalizeProfile(profile);
  const bmi = calculateAdultBmi(normalized);
  const preferencesDirty = preferenceSignature(preferences) !== preferenceSignature(savedPreferences);

  async function loadPreferences() {
    setPreferencesLoading(true); setPreferencesError(''); setPreferencesNotice('');
    try {
      const result = await api.getMyPersonalization();
      const loaded = result?.preferences;
      if (!loaded || !Array.isArray(loaded.foodPreferences)) throw new Error('API chưa trả về lựa chọn cá nhân hóa hợp lệ.');
      const next = copyPreferences(loaded);
      setPreferences(next); setSavedPreferences(next);
    } catch (error) { setPreferencesError(error?.message || 'Không tải được lựa chọn cá nhân hóa.'); }
    finally { setPreferencesLoading(false); }
  }

  useEffect(() => { loadPreferences(); }, []);

  function toggle(key) {
    setPreferencesNotice('');
    setPreferences(current => ({ ...current, [key]: !current[key] }));
  }
  function togglePreference(value) {
    setPreferencesNotice('');
    setPreferences(current => ({ ...current, foodPreferences: current.foodPreferences.includes(value) ? current.foodPreferences.filter(item => item !== value) : [...current.foodPreferences, value] }));
  }
  async function savePreferences() {
    if (preferencesSaving || preferencesLoading || !preferencesDirty) return;
    setPreferencesSaving(true); setPreferencesError(''); setPreferencesNotice('');
    try {
      const result = await api.saveMyPersonalization(copyPreferences(preferences));
      const saved = result?.preferences || preferences;
      const next = copyPreferences(saved);
      setPreferences(next); setSavedPreferences(next); setPreferencesNotice('Lựa chọn cá nhân hóa đã được lưu vào tài khoản.');
    } catch (error) { setPreferencesError(error?.message || 'Không lưu được lựa chọn. Các thay đổi vẫn còn để bạn thử lại.'); }
    finally { setPreferencesSaving(false); }
  }
  function updateCandidate(id, key, value) { setCandidates(current => current.map(item => item.id === id ? { ...item, [key]: value } : item)); }

  async function processImage(uri) {
    setOcrBusy(true); setOcrError('');
    try {
      const result = await recognizeLabImage(uri);
      setCandidates(result.candidates.map((item, index) => ({ ...item, id: 'candidate-' + (index + 1) })));
    } catch (error) { setOcrError(error?.message || 'Không nhận diện được ảnh trên thiết bị. Ảnh vẫn còn để thử lại.'); }
    finally { setOcrBusy(false); }
  }

  async function chooseImage(useCamera) {
    if (!healthRecordConsent) { setOcrError('Hãy bật quyền lưu hồ sơ y tế trước khi chọn ảnh.'); return; }
    setOcrError('');
    try {
      let result;
      if (useCamera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) { setOcrError('Bạn chưa cấp quyền camera. Có thể cho phép trong Cài đặt thiết bị hoặc chọn ảnh.'); return; }
        result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85, allowsEditing: false, exif: false });
      } else {
        result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: false, quality: 0.85, exif: false, preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode?.Compatible });
      }
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.uri) { setOcrError('Không nhận được ảnh. Hãy thử chụp hoặc chọn lại.'); return; }
      if (asset.fileSize && asset.fileSize > MAX_RECORD_SOURCE_BYTES) { setOcrError('Ảnh vượt quá giới hạn 8 MB. Chụp lại gần hơn hoặc chọn ảnh nhỏ hơn.'); return; }
      setPhoto(asset); setCandidates([]); setRecordSaved(false); setSavedRecordId(null); setPendingUpload(null); setRecordError('');
      requestKey.current = newRequestKey();
      setRecordTitle(asset.fileName?.replace(/\.[^.]+$/, '').slice(0, 120) || 'Kết quả xét nghiệm');
      setRecordDate(localDate()); setRecordNote('');
      setScreen('result');
      await processImage(asset.uri);
    } catch (error) { setOcrError(error?.message || 'Không thể mở ảnh trên thiết bị. Hãy thử lại.'); }
  }

  async function enableRecordStorage() {
    if (!onEnableHealthRecordStorage || consentBusy) return;
    setConsentBusy(true); setOcrError('');
    try { await onEnableHealthRecordStorage(); }
    catch (error) { setOcrError(error?.message || 'Không lưu được lựa chọn dữ liệu. Hãy thử lại.'); }
    finally { setConsentBusy(false); }
  }

  function addManualCandidate() {
    if (candidates.length >= 50) return;
    setCandidates(current => [...current, { id: 'manual-' + Date.now() + '-' + current.length, name: '', value: '', unit: '', referenceRange: '', confirmed: false }]);
  }

  async function readLocalImage() {
    const response = await fetch(photo.uri);
    const blob = await response.blob();
    const mimeType = photo.mimeType || blob.type;
    if (!blob.size || blob.size > MAX_RECORD_SOURCE_BYTES) throw new Error('Ảnh phải có kích thước tối đa 8 MB. Hãy chọn ảnh nhỏ hơn.');
    if (!['image/jpeg', 'image/png'].includes(mimeType)) throw new Error('Chỉ hỗ trợ ảnh JPEG hoặc PNG. Hãy chọn ảnh tương thích.');
    return { blob, mimeType };
  }

  async function saveReviewedRecord() {
    if (recordSaving || !healthRecordConsent || !photo || !validateHealthRecordCandidates(candidates)) return;
    setRecordSaving(true); setRecordError('');
    try {
      const source = pendingUpload || await readLocalImage();
      const input = {
        title: recordTitle.trim(), sourceDate: recordDate.trim() || null, note: recordNote,
        results: candidates.map(({ name, value, unit, referenceRange }) => ({ name: name.trim(), value: value.trim(), unit: unit.trim(), referenceRange: referenceRange.trim(), confirmed: true })),
      };
      const result = await api.saveMyHealthRecord(input, savedRecordId, requestKey.current);
      const recordId = result?.record?.id;
      if (!recordId) throw new Error('Máy chủ chưa xác nhận hồ sơ đã lưu. Hãy thử lại.');
      setSavedRecordId(recordId); setPendingUpload(source);
      try {
        await api.uploadMyHealthRecordSource(recordId, source.blob, source.mimeType);
        setPendingUpload(null); setRecordSaved(true); setRecordError(''); requestKey.current = newRequestKey();
      } catch (error) {
        setRecordSaved(true);
        setRecordError((error?.message || 'Không tải được ảnh nguồn.') + ' Các giá trị đã lưu; có thể tải ảnh lên lại.');
      }
    } catch (error) { setRecordError(error?.message || 'Không lưu được hồ sơ. Dữ liệu đang sửa vẫn còn trên thiết bị.'); }
    finally { setRecordSaving(false); }
  }

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <View style={styles.header}><TouchableOpacity accessibilityRole="button" accessibilityLabel="Quay lại" style={styles.back} onPress={() => screen === 'preferences' ? onBack?.() : setScreen('preferences')}><Text style={styles.backText}>‹</Text></TouchableOpacity><Text accessibilityRole="header" style={styles.title}>{screen === 'preferences' ? 'Hồ sơ sức khỏe' : screen === 'scan' ? 'Quét xét nghiệm' : 'Rà soát kết quả'}</Text><View style={styles.headerSpace} /></View>
    {screen === 'preferences' && <>
      <View style={styles.healthCard}>
        <View style={styles.profileHeading}><View style={styles.profileAvatar}><Text style={styles.profileAvatarText}>♡</Text></View><View style={{ flex: 1 }}><Text style={styles.profileName}>{normalized.username || 'Hồ sơ sức khỏe'}</Text><Text style={styles.profileMeta}>Thông tin do bạn cung cấp</Text></View><TouchableOpacity accessibilityRole="button" style={styles.editIcon} onPress={onEditProfile}><Text style={styles.link}>Sửa</Text></TouchableOpacity></View>
        <Text style={styles.sectionTitle}>Chỉ số nhân trắc</Text>
        <View style={styles.measureRow}><Measure label="Chiều cao" value={normalized.heightCm || '—'} unit="cm" /><Measure label="Cân nặng" value={normalized.weightKg || '—'} unit="kg" /></View>
        <View style={styles.bmiCard}><Text style={styles.bmiLabel}>Chỉ số BMI tham khảo</Text><Text style={styles.bmiValue}>{bmi ?? 'Chưa đủ dữ liệu'}</Text><Text style={styles.copy}>Chỉ số này không phải đánh giá hoặc chẩn đoán sức khỏe.</Text></View>
        <Text style={styles.sectionTitle}>Tình trạng sức khỏe đã nhập</Text><Text style={styles.conditionText}>{normalized.conditionType || 'Chưa khai báo'}</Text>
        <TouchableOpacity accessibilityRole="button" style={styles.editProfileButton} onPress={onEditProfile}><Text style={styles.editProfileText}>Chỉnh sửa hồ sơ sức khỏe</Text></TouchableOpacity>
      </View>
      <Text style={styles.sectionTitle}>Cá nhân hóa thực đơn</Text>
      <Text style={styles.copy}>Các lựa chọn này điều chỉnh cách bạn muốn xem gợi ý. Dị ứng và giới hạn cứng trong hồ sơ luôn được áp dụng.</Text>
      {preferencesLoading && <View style={styles.loadingRow}><ActivityIndicator color={colors.primary} /><Text style={styles.copy}>Đang tải lựa chọn tài khoản…</Text></View>}
      {!!preferencesError && <View accessibilityRole="alert" style={styles.notice}><Text style={styles.copy}>{preferencesError}</Text><TouchableOpacity accessibilityRole="button" disabled={preferencesLoading || preferencesSaving} onPress={loadPreferences}><Text style={styles.link}>Tải lại lựa chọn</Text></TouchableOpacity></View>}
      <View pointerEvents={preferencesLoading || preferencesSaving ? 'none' : 'auto'} style={preferencesLoading || preferencesSaving ? styles.disabled : null}>
        <View style={styles.resultCard}><Text style={styles.resultTitle}>Dị ứng và giới hạn sức khỏe</Text><Text style={styles.copy}>Luôn được áp dụng từ hồ sơ tài khoản khi API hỗ trợ đủ dữ liệu. Cài đặt nhắc nhở bên dưới không tắt hoặc thay đổi các giới hạn này. Dị ứng hiện có: {profile?.allergies?.length ? profile.allergies.join(', ') : 'chưa khai báo'}.</Text></View>
        <Toggle label="Theo dõi mục tiêu đã xác nhận" hint="Hiện đối chiếu nhật ký với khoảng do bạn nhập; chỉ dành cho hồ sơ bệnh nhân đã xác nhận." value={preferences.trackConfirmedTargets} onPress={() => toggle('trackConfirmedTargets')} />
        <Text style={styles.sectionTitle}>Mức độ phong phú thực đơn</Text><View style={styles.chipRow}>{dietaryStyles.map(item => <Chip key={item.value} label={item.label} selected={preferences.dietaryVariety === item.value} onPress={() => { setPreferencesNotice(''); setPreferences(current => ({ ...current, dietaryVariety: item.value })); }} />)}</View>
        <Text style={styles.sectionTitle}>Ưu tiên món ăn</Text><View style={styles.preferenceGrid}>{foodPreferences.map(item => <Chip key={item.value} label={item.label} selected={preferences.foodPreferences.includes(item.value)} onPress={() => togglePreference(item.value)} />)}</View>
        <Toggle label="Nhắc kiểm tra thành phần gây dị ứng" hint="Kiểm tra nhãn, thành phần và nguy cơ nhiễm chéo trước khi dùng." value={preferences.allergyReminder} onPress={() => toggle('allergyReminder')} />
      </View>
      {!!preferencesNotice && <Text accessibilityLiveRegion="polite" style={styles.copy}>{preferencesNotice}</Text>}
      <TouchableOpacity accessibilityRole="button" style={[styles.primary, (!preferencesDirty || preferencesSaving || preferencesLoading) && styles.disabled]} disabled={!preferencesDirty || preferencesSaving || preferencesLoading} onPress={savePreferences}>{preferencesSaving ? <ActivityIndicator color="white" /> : <Text style={styles.primaryText}>Lưu lựa chọn</Text>}</TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" style={styles.scanCard} onPress={() => { setOcrError(''); setScreen('scan'); }}><View style={styles.scanIcon}><Text style={styles.scanGlyph}>▧</Text></View><View style={{ flex: 1 }}><Text style={styles.infoTitle}>Thêm kết quả xét nghiệm</Text><Text style={styles.copy}>Chụp/chọn ảnh, nhận diện trên thiết bị và xác nhận trước khi lưu.</Text></View><Text style={styles.link}>›</Text></TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" style={styles.secondary} onPress={onOpenMedicalRecord}><Text style={styles.link}>Xem hồ sơ y tế đã lưu ›</Text></TouchableOpacity>
    </>}
    {screen === 'scan' && <>
      <View style={styles.resultCard}><Text style={styles.resultTitle}>Ảnh và hồ sơ sức khỏe là dữ liệu nhạy cảm</Text><Text style={styles.copy}>OCR chạy trên thiết bị. Ảnh và các giá trị nhận diện chưa được tải lên. Chỉ khi bạn xác nhận lưu, ứng dụng mới gửi các giá trị đã xem lại và ảnh nguồn tới tài khoản riêng tư của bạn.</Text></View>
      {!healthRecordConsent ? <TouchableOpacity accessibilityRole="button" style={styles.primary} onPress={enableRecordStorage} disabled={consentBusy}>{consentBusy ? <ActivityIndicator color="white" /> : <Text style={styles.primaryText}>Đồng ý lưu hồ sơ xét nghiệm</Text>}</TouchableOpacity> : <>
        <View style={styles.scanStage}><View style={styles.scanFrame}><View style={styles.cornerTL} /><View style={styles.cornerTR} /><View style={styles.paper}><Text style={styles.paperTitle}>KẾT QUẢ XÉT NGHIỆM</Text><View style={styles.paperLine} /><View style={styles.paperLine} /><View style={styles.paperLineShort} /><View style={styles.paperLine} /><Text style={styles.paperBlank}>Ảnh chỉ ở trên thiết bị trong lúc nhận diện</Text></View><View style={styles.cornerBL} /><View style={styles.cornerBR} /></View></View>
        <View style={styles.scanControls}><TouchableOpacity accessibilityRole="button" accessibilityLabel="Chọn ảnh kết quả xét nghiệm" style={styles.scanSmall} onPress={() => chooseImage(false)}><Text style={styles.scanGlyph}>▱</Text><Text style={styles.scanControlLabel}>Chọn ảnh</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel="Chụp ảnh kết quả xét nghiệm" style={styles.capture} onPress={() => chooseImage(true)}><Text style={styles.captureText}>⌾</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" style={styles.scanSmall} onPress={onOpenMedicalRecord}><Text style={styles.scanGlyph}>▤</Text><Text style={styles.scanControlLabel}>Hồ sơ</Text></TouchableOpacity></View>
      </>}
      {!!ocrError && <View accessibilityRole="alert" style={styles.notice}><Text style={styles.copy}>{ocrError}</Text></View>}
      <Text style={styles.scanHelp}>Ứng dụng không diễn giải kết quả y tế. Hãy đối chiếu từng giá trị với ảnh gốc.</Text>
    </>}
    {screen === 'result' && <>
      <View style={styles.resultCard}><Text style={styles.resultTitle}>{recordSaved ? 'Hồ sơ đã được lưu vào tài khoản' : 'Rà soát nội dung trước khi lưu'}</Text><Text style={styles.copy}>Chỉ xác nhận từng giá trị sau khi đã đối chiếu với ảnh gốc. Các giá trị không được diễn giải y tế.</Text></View>
      {photo?.uri && <Image accessibilityLabel="Ảnh xét nghiệm đang được rà soát trên thiết bị" source={{ uri: photo.uri }} style={styles.sourcePreview} resizeMode="contain" />}
      {ocrBusy && <View style={styles.loadingRow}><ActivityIndicator color={colors.primary} /><Text style={styles.copy}>Đang nhận diện chữ trên thiết bị…</Text></View>}
      {!!ocrError && <View accessibilityRole="alert" style={styles.notice}><Text style={styles.copy}>{ocrError}</Text>{photo?.uri && <TouchableOpacity accessibilityRole="button" onPress={() => processImage(photo.uri)}><Text style={styles.link}>Thử nhận diện lại</Text></TouchableOpacity>}</View>}
      {!ocrBusy && candidates.length === 0 && <View style={styles.notice}><Text style={styles.copy}>Chưa trích xuất được dòng kết quả. Bạn có thể nhập từng dòng thủ công từ ảnh.</Text></View>}
      <Text style={styles.inputLabel}>Tên hồ sơ</Text><TextInput accessibilityLabel="Tên hồ sơ xét nghiệm" value={recordTitle} onChangeText={setRecordTitle} maxLength={120} style={styles.input} />
      <Text style={styles.inputLabel}>Ngày xét nghiệm (YYYY-MM-DD, tùy chọn)</Text><TextInput accessibilityLabel="Ngày xét nghiệm" value={recordDate} onChangeText={setRecordDate} placeholder="YYYY-MM-DD" autoCapitalize="none" style={styles.input} />
      <Text style={styles.inputLabel}>Ghi chú</Text><TextInput accessibilityLabel="Ghi chú xét nghiệm" value={recordNote} onChangeText={setRecordNote} maxLength={1000} multiline style={[styles.input, styles.multiline]} />
      <Text style={styles.sectionTitle}>Giá trị đã nhận diện · xác nhận từng dòng</Text>
      {candidates.map((item, index) => <View key={item.id} style={styles.candidateCard}>
        <TextInput accessibilityLabel={'Tên chỉ số ' + (index + 1)} value={item.name} onChangeText={value => updateCandidate(item.id, 'name', value)} placeholder="Tên chỉ số" maxLength={100} style={styles.input} />
        <View style={styles.candidateFields}><TextInput accessibilityLabel={'Giá trị chỉ số ' + (index + 1)} value={item.value} onChangeText={value => updateCandidate(item.id, 'value', value)} placeholder="Giá trị" maxLength={100} style={[styles.input, styles.candidateInput]} /><TextInput accessibilityLabel={'Đơn vị chỉ số ' + (index + 1)} value={item.unit} onChangeText={value => updateCandidate(item.id, 'unit', value)} placeholder="Đơn vị" maxLength={40} style={[styles.input, styles.candidateInput]} /></View>
        <TextInput accessibilityLabel={'Khoảng tham chiếu chỉ số ' + (index + 1)} value={item.referenceRange} onChangeText={value => updateCandidate(item.id, 'referenceRange', value)} placeholder="Khoảng tham chiếu (nếu có)" maxLength={80} style={styles.input} />
        <TouchableOpacity accessibilityRole="checkbox" accessibilityLabel={'Xác nhận chỉ số ' + (index + 1)} accessibilityState={{ checked: item.confirmed }} style={styles.confirmRow} onPress={() => updateCandidate(item.id, 'confirmed', !item.confirmed)}><Text style={[styles.confirmBox, item.confirmed && styles.confirmedBox]}>{item.confirmed ? '✓' : ''}</Text><Text style={styles.copy}>Đã đối chiếu với ảnh gốc</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={'Xóa chỉ số ' + (index + 1)} onPress={() => setCandidates(current => current.filter(row => row.id !== item.id))}><Text style={styles.link}>Xóa dòng</Text></TouchableOpacity>
      </View>)}
      <TouchableOpacity accessibilityRole="button" style={styles.secondary} onPress={addManualCandidate}><Text style={styles.link}>Thêm dòng thủ công</Text></TouchableOpacity>
      {recordSaved && <View style={styles.resultCard}><Text style={styles.resultTitle}>Các giá trị đã được lưu</Text>{pendingUpload && <><Text style={styles.copy}>Ảnh nguồn chưa tải lên. Các giá trị đã lưu; hãy thử tải ảnh lên lại.</Text><TouchableOpacity accessibilityRole="button" onPress={saveReviewedRecord}><Text style={styles.link}>Tải ảnh nguồn lên lại</Text></TouchableOpacity></>}</View>}
      {!!recordError && <View accessibilityRole="alert" style={styles.notice}><Text style={styles.copy}>{recordError}</Text></View>}
      {!recordSaved && <TouchableOpacity accessibilityRole="button" style={[styles.primary, (recordSaving || !photo || !healthRecordConsent || !validateHealthRecordCandidates(candidates)) && styles.disabled]} disabled={recordSaving || !photo || !healthRecordConsent || !validateHealthRecordCandidates(candidates)} onPress={saveReviewedRecord}>{recordSaving ? <ActivityIndicator color="white" /> : <Text style={styles.primaryText}>Xác nhận và lưu hồ sơ</Text>}</TouchableOpacity>}
      {recordSaved && !pendingUpload && <TouchableOpacity accessibilityRole="button" style={styles.primary} onPress={onOpenMedicalRecord}><Text style={styles.primaryText}>Mở hồ sơ đã lưu</Text></TouchableOpacity>}
      <TouchableOpacity accessibilityRole="button" style={styles.secondary} onPress={() => setScreen('scan')}><Text style={styles.link}>Quay lại quét</Text></TouchableOpacity>
    </>}
  </ScrollView>;
}

function Measure({ label, value, unit }) { return <View style={styles.measure}><Text style={styles.measureLabel}>{label}</Text><Text style={styles.measureValue}>{value}<Text style={styles.measureUnit}> {unit}</Text></Text></View>; }
function Toggle({ label, hint, value, onPress }) { return <TouchableOpacity accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: value }} style={styles.toggleRow} onPress={onPress}><View style={{ flex: 1 }}><Text style={styles.infoTitle}>{label}</Text><Text style={styles.copy}>{hint}</Text></View><View style={[styles.toggleTrack, value && styles.toggleOn]}><View style={[styles.toggleThumb, value && styles.thumbOn]} /></View></TouchableOpacity>; }
function Chip({ label, selected, onPress }) { return <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected }} style={[styles.chip, selected && styles.chipOn]} onPress={onPress}><Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text></TouchableOpacity>; }

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F5F7FF' }, content: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 112 }, header: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, back: { width: 48, height: 48, justifyContent: 'center' }, backText: { color: colors.primary, fontSize: 34 }, title: { color: colors.primary, fontSize: 20, fontWeight: '800' }, headerSpace: { width: 48 },
  healthCard: { padding: 15, marginTop: 7, borderRadius: 18, backgroundColor: 'white' }, profileHeading: { flexDirection: 'row', alignItems: 'center', gap: 11 }, profileAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#DDE8FF', alignItems: 'center', justifyContent: 'center' }, profileAvatarText: { color: colors.primary, fontSize: 23 }, profileName: { color: colors.text, fontSize: 17, fontWeight: '800' }, profileMeta: { color: colors.muted, fontSize: 12, marginTop: 4 }, editIcon: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }, measureRow: { flexDirection: 'row', gap: 9 }, measure: { flex: 1, minHeight: 82, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF3FF', borderRadius: 13 }, measureLabel: { color: colors.muted, fontSize: 13, fontWeight: '700' }, measureValue: { color: colors.primary, fontSize: 23, fontWeight: '900', marginTop: 5 }, measureUnit: { color: colors.muted, fontSize: 12, fontWeight: '500' }, bmiCard: { padding: 13, marginTop: 11, backgroundColor: '#EEF3FF', borderRadius: 13 }, bmiLabel: { color: colors.text, fontSize: 13, fontWeight: '700' }, bmiValue: { color: colors.primary, fontSize: 21, fontWeight: '900', marginTop: 4 }, conditionText: { color: colors.text, fontSize: 15, fontWeight: '700' }, editProfileButton: { minHeight: 54, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, borderRadius: radius.pill, marginTop: 14 }, editProfileText: { color: 'white', fontSize: 15, fontWeight: '800' },
  infoTitle: { color: colors.text, fontSize: 15, lineHeight: 21, fontWeight: '800' }, copy: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 5 }, toggleRow: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderColor: colors.border }, toggleTrack: { width: 50, height: 30, padding: 4, borderRadius: 16, backgroundColor: '#D7DFEE', justifyContent: 'center' }, toggleOn: { backgroundColor: colors.primary }, toggleThumb: { width: 22, height: 22, borderRadius: 12, backgroundColor: 'white' }, thumbOn: { alignSelf: 'flex-end' },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '800', marginTop: 17, marginBottom: 8 }, chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, preferenceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { minHeight: 50, paddingHorizontal: 14, borderRadius: 17, justifyContent: 'center', backgroundColor: '#E8EDFA' }, chipOn: { backgroundColor: colors.primary }, chipText: { color: colors.primaryDark, fontSize: 14, fontWeight: '700' }, chipTextOn: { color: 'white' },
  scanCard: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, marginTop: 15, backgroundColor: 'white', borderRadius: 13 }, scanIcon: { width: 43, height: 43, borderRadius: 12, backgroundColor: '#E9F4FF', alignItems: 'center', justifyContent: 'center' }, scanGlyph: { color: '#2FAACD', fontSize: 23 }, link: { color: colors.primary, fontSize: 14, fontWeight: '800', marginTop: 7 }, primary: { minHeight: 56, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, marginTop: 14, paddingHorizontal: 12 }, primaryText: { color: 'white', fontSize: 15, fontWeight: '800' }, secondary: { minHeight: 50, alignItems: 'center', justifyContent: 'center' }, disabled: { opacity: 0.45 },
  resultCard: { padding: 15, marginTop: 10, backgroundColor: '#E7F2FF', borderRadius: 14 }, resultTitle: { color: colors.primaryDark, fontSize: 14, fontWeight: '800' }, inputLabel: { color: colors.text, fontSize: 13, fontWeight: '700', marginTop: 13, marginBottom: 5 }, input: { minHeight: 47, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 11, color: colors.text, backgroundColor: 'white' }, multiline: { minHeight: 72, paddingTop: 10, textAlignVertical: 'top' }, scanStage: { height: 260, backgroundColor: '#E5EBF5', borderRadius: 16, marginTop: 12, alignItems: 'center', justifyContent: 'center' }, scanFrame: { width: '82%', height: '79%', alignItems: 'center', justifyContent: 'center' }, paper: { width: '83%', height: '91%', backgroundColor: 'white', borderRadius: 5, padding: 17, elevation: 3, justifyContent: 'center' }, paperTitle: { color: '#8C97A9', fontSize: 11, textAlign: 'center', fontWeight: '800', marginBottom: 18 }, paperLine: { height: 4, borderRadius: 2, backgroundColor: '#E1E6EE', marginVertical: 7 }, paperLineShort: { width: '68%', height: 4, borderRadius: 2, backgroundColor: '#E1E6EE', marginVertical: 7 }, paperBlank: { color: '#AAB4C3', fontSize: 11, textAlign: 'center', marginTop: 17 }, cornerTL: { position: 'absolute', zIndex: 1, left: 0, top: 0, width: 35, height: 35, borderLeftWidth: 4, borderTopWidth: 4, borderColor: colors.primary }, cornerTR: { position: 'absolute', zIndex: 1, right: 0, top: 0, width: 35, height: 35, borderRightWidth: 4, borderTopWidth: 4, borderColor: colors.primary }, cornerBL: { position: 'absolute', zIndex: 1, left: 0, bottom: 0, width: 35, height: 35, borderLeftWidth: 4, borderBottomWidth: 4, borderColor: colors.primary }, cornerBR: { position: 'absolute', zIndex: 1, right: 0, bottom: 0, width: 35, height: 35, borderRightWidth: 4, borderBottomWidth: 4, borderColor: colors.primary },
  scanControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginTop: 12 }, scanSmall: { minHeight: 54, alignItems: 'center', minWidth: 72 }, scanControlLabel: { color: colors.muted, fontSize: 12, marginTop: 3 }, capture: { width: 64, height: 64, borderRadius: 32, borderWidth: 4, borderColor: colors.primary, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center' }, captureText: { color: colors.primary, fontSize: 32 }, scanHelp: { color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 12 }, notice: { padding: 12, backgroundColor: '#FFF7E6', borderRadius: 10, marginTop: 10 }, sourcePreview: { width: '100%', height: 210, marginTop: 10, backgroundColor: '#EDF1FA' }, loadingRow: { minHeight: 48, flexDirection: 'row', gap: 9, alignItems: 'center' }, candidateCard: { padding: 11, marginTop: 9, borderRadius: 12, backgroundColor: 'white', gap: 8 }, candidateFields: { flexDirection: 'row', gap: 8 }, candidateInput: { flex: 1 }, confirmRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }, confirmBox: { width: 24, height: 24, borderRadius: 5, borderWidth: 1, borderColor: colors.primary, color: 'white', textAlign: 'center', textAlignVertical: 'center' }, confirmedBox: { backgroundColor: colors.primary },
});
