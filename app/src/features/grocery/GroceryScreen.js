import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../../services/api';
import { colors, radius } from '../../theme/tokens';

const supportedUnits = new Set(['g', 'kg', 'ml', 'l', 'piece', 'bunch', 'pack']);

function createIntentKey() {
  return `grocery-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function readListResponse(result) {
  if (!result || !Object.prototype.hasOwnProperty.call(result, 'list')) {
    throw new Error('Máy chủ trả về danh sách không đúng định dạng. Hãy tải lại.');
  }
  if (result.list === null) return null;
  if (!result.list || typeof result.list.id !== 'string' || !Array.isArray(result.list.items)
    || !result.list.items.every(item => item && typeof item.id === 'string' && typeof item.name === 'string'
      && Number.isFinite(item.amount) && typeof item.unit === 'string' && typeof item.purchased === 'boolean')) {
    throw new Error('Máy chủ trả về danh sách không đúng định dạng. Hãy tải lại.');
  }
  return result.list;
}

function readItemResponse(result, expectedId) {
  const item = result?.item;
  if (!item || typeof item.id !== 'string' || item.id !== expectedId || typeof item.name !== 'string'
    || !Number.isFinite(item.amount) || typeof item.unit !== 'string' || typeof item.purchased !== 'boolean') {
    throw new Error('Máy chủ trả về mục chưa lưu đúng định dạng. Hãy thử lại.');
  }
  return item;
}

function createPayloadFromPlan(sourceItems) {
  return {
    items: sourceItems.map(item => ({ foodId: item.foodId, amount: item.grams, unit: 'g' })),
  };
}

export default function GroceryScreen({ sourceItems = [] }) {
  const [list, setList] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [loadVersion, setLoadVersion] = useState(0);
  const [creating, setCreating] = useState(false);
  const [pendingItemId, setPendingItemId] = useState('');
  const [drafts, setDrafts] = useState({});
  const [mutationError, setMutationError] = useState('');
  const [retryAction, setRetryAction] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const createIntent = useRef(null);
  const itemCount = list?.items?.length || 0;
  const purchasedCount = list?.items?.filter(item => item.purchased).length || 0;
  const purchaseProgress = itemCount ? purchasedCount / itemCount * 100 : 0;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError('');
    api.getCurrentShoppingList().then(result => {
      if (active) setList(readListResponse(result));
    }).catch(error => {
      if (active) setLoadError(error?.message || 'Không tải được danh sách đi chợ.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [loadVersion]);

  function clearMutationFeedback() {
    setMutationError('');
    setSuccessMessage('');
    setRetryAction(null);
  }

  async function submitCreate() {
    if (!createIntent.current) createIntent.current = { payload: createPayloadFromPlan(sourceItems), key: createIntentKey() };
    const intent = createIntent.current;
    setCreating(true);
    clearMutationFeedback();
    try {
      const result = await api.createShoppingList(intent.payload, intent.key);
      setList(readListResponse(result));
      setDrafts({});
      createIntent.current = null;
      setSuccessMessage('Đã lưu danh sách đi chợ.');
    } catch (error) {
      setMutationError(error?.message || 'Không lưu được danh sách. Hãy thử lại.');
      setRetryAction(() => submitCreate);
    } finally {
      setCreating(false);
    }
  }

  function createFromPlan() {
    if (loading || loadError || !sourceItems.length || creating || pendingItemId) return;
    if (!list) {
      submitCreate();
      return;
    }
    Alert.alert(
      'Thay danh sách đi chợ?',
      'Danh sách mới sẽ thay số lượng đã chỉnh và trạng thái đã mua hiện tại.',
      [
        { text: 'Hủy', style: 'cancel' },
        { text: 'Thay danh sách', style: 'destructive', onPress: submitCreate },
      ],
    );
  }

  async function saveItemPatch(itemId, patch) {
    setPendingItemId(itemId);
    clearMutationFeedback();
    try {
      const result = await api.updateShoppingListItem(itemId, patch);
      const updatedItem = readItemResponse(result, itemId);
      setList(current => current && ({
        ...current,
        updatedAt: updatedItem.updatedAt || current.updatedAt,
        items: current.items.map(item => item.id === itemId ? updatedItem : item),
      }));
      setDrafts(current => ({ ...current, [itemId]: { amount: String(updatedItem.amount), unit: updatedItem.unit } }));
      setSuccessMessage('Đã lưu thay đổi.');
    } catch (error) {
      setMutationError(error?.message || 'Không lưu được thay đổi. Hãy thử lại.');
      setRetryAction(() => () => saveItemPatch(itemId, patch));
    } finally {
      setPendingItemId('');
    }
  }

  async function saveDraft(item) {
    const draft = drafts[item.id] || { amount: String(item.amount), unit: item.unit };
    const amount = Number(draft.amount);
    const unit = draft.unit.trim();
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000 || !supportedUnits.has(unit)) {
      setMutationError('Nhập số lượng từ 0 đến 1.000.000 và đơn vị được hỗ trợ.');
      setRetryAction(null);
      return;
    }
    await saveItemPatch(item.id, { amount, unit });
  }

  async function deleteItem(itemId, reconcileFirst = false) {
    setPendingItemId(itemId);
    clearMutationFeedback();
    try {
      let latestList = null;
      if (reconcileFirst) {
        latestList = readListResponse(await api.getCurrentShoppingList());
        if (!latestList?.items?.some(item => item.id === itemId)) {
          setList(latestList);
          setSuccessMessage('Mục đã được xóa khỏi danh sách.');
          return;
        }
      }
      await api.deleteShoppingListItem(itemId);
      setList(current => {
        const source = latestList || current;
        return source && ({ ...source, items: source.items.filter(item => item.id !== itemId) });
      });
      setSuccessMessage('Đã xóa nguyên liệu.');
    } catch (error) {
      setMutationError(error?.message || 'Không xóa được nguyên liệu. Hãy thử lại.');
      setRetryAction(() => () => deleteItem(itemId, true));
    } finally {
      setPendingItemId('');
    }
  }

  function confirmDelete(item) {
    Alert.alert('Xóa nguyên liệu?', `Xóa ${item.name} khỏi danh sách đi chợ?`, [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Xóa', style: 'destructive', onPress: () => deleteItem(item.id) },
    ]);
  }

  function updateDraft(item, field, value) {
    clearMutationFeedback();
    setDrafts(current => ({
      ...current,
      [item.id]: { amount: String(item.amount), unit: item.unit, ...(current[item.id] || {}), [field]: value },
    }));
  }

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <Text accessibilityRole="header" style={styles.title}>Đi chợ</Text>
    <Text style={styles.subtitle}>Danh sách được lưu trong API demo và có thể mở lại.</Text>
    <Text style={styles.disclaimer}>Ước tính từ thực đơn mẫu; không phải tư vấn y tế. Chỉnh danh sách không thay đổi khẩu phần hoặc dinh dưỡng của thực đơn.</Text>

    {loading ? <View style={styles.state}><ActivityIndicator color={colors.primary} /><Text style={styles.stateText}>Đang tải danh sách đi chợ…</Text></View>
      : loadError ? <View style={styles.state}><Text style={styles.error}>{loadError}</Text><TouchableOpacity style={styles.secondary} onPress={() => setLoadVersion(value => value + 1)}><Text style={styles.secondaryText}>Thử tải lại</Text></TouchableOpacity></View>
        : <>
          <View style={styles.summary}>
            <View style={styles.summaryHeader}>
              <View><Text style={styles.heading}>Tiến độ đi chợ</Text><Text style={styles.small}>{purchasedCount} / {itemCount} món đã mua</Text></View>
              <View style={styles.countBadge}><Text style={styles.countText}>{itemCount - purchasedCount} còn lại</Text></View>
            </View>
            <View accessibilityRole="progressbar" accessibilityLabel="Tiến độ đi chợ" accessibilityValue={{ min: 0, max: 100, now: Math.round(purchaseProgress) }} style={styles.progressTrack}><View style={[styles.progressFill, { width: `${purchaseProgress}%` }]} /></View>
          </View>

          {!!sourceItems.length && <TouchableOpacity style={styles.primary} disabled={creating || !!pendingItemId} onPress={createFromPlan}>
            {creating ? <ActivityIndicator color="white" /> : <Text style={styles.primaryText}>Tạo danh sách từ thực đơn</Text>}
          </TouchableOpacity>}

          <View style={styles.sectionHeader}><Text accessibilityRole="header" style={styles.section}>Danh sách hiện tại</Text>{!!list?.items?.length && <Text style={styles.sectionCount}>{itemCount} món</Text>}</View>
          {!list ? <View style={styles.empty}><View style={styles.emptyIcon}><Text style={styles.emptyGlyph}>＋</Text></View><Text style={styles.heading}>Chưa có danh sách đi chợ đã lưu.</Text>{!!sourceItems.length && <Text style={styles.small}>Tạo danh sách từ thực đơn hiện tại để lưu các nguyên liệu cần mua.</Text>}</View>
            : list.items.length === 0 ? <View style={styles.empty}><Text style={styles.heading}>Danh sách hiện tại chưa có nguyên liệu.</Text></View>
              : <View style={styles.card}>{list.items.map(item => {
                const draft = drafts[item.id] || { amount: String(item.amount), unit: item.unit };
                const isPending = pendingItemId === item.id;
                return <View key={item.id} style={styles.row}>
                  <TouchableOpacity
                    accessibilityRole="checkbox"
                    accessibilityLabel={`${item.purchased ? 'Đánh dấu chưa mua' : 'Đánh dấu đã mua'} ${item.name}`}
                    accessibilityState={{ checked: item.purchased, disabled: isPending || creating }}
                    style={[styles.check, item.purchased && styles.checked]}
                    disabled={isPending || creating}
                    onPress={() => saveItemPatch(item.id, { purchased: !item.purchased })}
                  ><Text style={styles.checkText}>{item.purchased ? '✓' : ''}</Text></TouchableOpacity>
                  <View style={styles.itemContent}>
                    <Text style={[styles.name, item.purchased && styles.strike]}>{item.name}</Text>
                    <Text style={styles.savedAmount}>{item.amount} {item.unit}</Text>
                    <View style={styles.editRow}>
                      <TextInput
                        accessibilityLabel={`Số lượng ${item.name}`}
                        placeholder={`Số lượng ${item.name}`}
                        value={draft.amount}
                        onChangeText={value => updateDraft(item, 'amount', value)}
                        keyboardType="decimal-pad"
                        style={styles.inputAmount}
                        editable={!isPending && !creating}
                      />
                      <TextInput
                        accessibilityLabel={`Đơn vị ${item.name}`}
                        placeholder={`Đơn vị ${item.name}`}
                        value={draft.unit}
                        onChangeText={value => updateDraft(item, 'unit', value)}
                        autoCapitalize="none"
                        style={styles.inputUnit}
                        editable={!isPending && !creating}
                      />
                    </View>
                    <View style={styles.actions}>
                      <TouchableOpacity accessibilityRole="button" style={styles.smallButton} disabled={isPending || creating} onPress={() => saveDraft(item)}>
                        {isPending ? <ActivityIndicator color={colors.primary} /> : <Text accessibilityLabel={`Lưu thay đổi ${item.name}`} style={styles.actionText}>Lưu thay đổi {item.name}</Text>}
                      </TouchableOpacity>
                      <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Xóa ${item.name}`} style={styles.smallButton} disabled={isPending || creating} onPress={() => confirmDelete(item)}>
                        <Text style={styles.deleteText}>Xóa {item.name}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>;
              })}</View>}
        </>}

    {!!mutationError && <Text accessibilityRole="alert" style={styles.error}>{mutationError}</Text>}
    {!!mutationError && !!retryAction && <TouchableOpacity style={styles.secondary} disabled={creating || !!pendingItemId} onPress={() => retryAction()}><Text style={styles.secondaryText}>Thử thao tác lại</Text></TouchableOpacity>}
    {!!successMessage && <Text accessibilityLiveRegion="polite" style={styles.success}>{successMessage}</Text>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { padding: 16, paddingBottom: 124 },
  title: { color: colors.text, fontWeight: '800', fontSize: 24 },
  subtitle: { color: colors.muted, fontSize: 13, marginTop: 4 },
  disclaimer: { color: colors.warning, fontSize: 12, lineHeight: 17, backgroundColor: '#FFF7E6', padding: 11, borderRadius: radius.sm, marginTop: 10 },
  summary: { backgroundColor: colors.surface, padding: 15, borderRadius: radius.md, marginTop: 14, borderWidth: 1, borderColor: colors.border },
  summaryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heading: { color: colors.text, fontSize: 16, fontWeight: '800' },
  small: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 5 },
  countBadge: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: colors.softBlue },
  countText: { color: colors.primaryDark, fontSize: 12, fontWeight: '800' },
  progressTrack: { height: 7, borderRadius: 8, backgroundColor: '#E5EBF6', overflow: 'hidden', marginTop: 12 },
  progressFill: { height: '100%', borderRadius: 8, backgroundColor: colors.primary },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, marginBottom: 8 },
  section: { fontWeight: '800', color: colors.text, fontSize: 16 },
  sectionCount: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderBottomWidth: 1, borderBottomColor: '#F0F2F6', paddingVertical: 14 },
  check: { width: 48, height: 48, borderRadius: 11, backgroundColor: colors.softBlue, justifyContent: 'center', alignItems: 'center', marginTop: 2 },
  checked: { backgroundColor: colors.primary },
  checkText: { color: 'white', fontWeight: '800' },
  itemContent: { flex: 1, minWidth: 0 },
  name: { color: colors.text, fontWeight: '800', fontSize: 14 },
  strike: { textDecorationLine: 'line-through', color: colors.muted },
  savedAmount: { color: colors.primary, fontSize: 12, fontWeight: '700', marginTop: 3 },
  editRow: { flexDirection: 'row', gap: 7, marginTop: 8 },
  inputAmount: { flex: 1, minWidth: 70, minHeight: 48, backgroundColor: '#F5F7FB', borderRadius: 9, paddingHorizontal: 9, color: colors.text, fontSize: 13 },
  inputUnit: { width: 78, minHeight: 48, backgroundColor: '#F5F7FB', borderRadius: 9, paddingHorizontal: 9, color: colors.text, fontSize: 13 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 7 },
  smallButton: { minHeight: 48, justifyContent: 'center', paddingVertical: 6, paddingHorizontal: 9, backgroundColor: '#F2F5FB', borderRadius: 9 },
  actionText: { color: colors.primary, fontWeight: '800', fontSize: 12 },
  deleteText: { color: colors.danger, fontWeight: '700', fontSize: 12 },
  state: { padding: 22, alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginTop: 14 },
  stateText: { color: colors.muted, marginTop: 8, fontSize: 13 },
  empty: { alignItems: 'center', padding: 22, backgroundColor: '#F8FAFE', borderRadius: radius.md },
  emptyIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.softBlue, alignItems: 'center', justifyContent: 'center', marginBottom: 9 },
  emptyGlyph: { color: colors.primary, fontSize: 22 },
  primary: { minHeight: 48, borderRadius: radius.pill, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', marginTop: 12, paddingHorizontal: 16 },
  primaryText: { color: 'white', fontWeight: '800', fontSize: 14 },
  secondary: { minHeight: 48, backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  secondaryText: { color: 'white', fontWeight: '800', fontSize: 13 },
  error: { color: colors.danger, marginTop: 10, fontSize: 13, lineHeight: 18 },
  success: { color: colors.success, marginTop: 10, fontSize: 13, fontWeight: '700' },
});
