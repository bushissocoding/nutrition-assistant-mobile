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
    <Text style={styles.title}>Danh sách đi chợ</Text>
    <Text style={styles.subtitle}>Danh sách được lưu trong API demo và có thể mở lại.</Text>
    <Text style={styles.disclaimer}>Ước tính từ thực đơn mẫu; không phải tư vấn y tế. Chỉnh danh sách không thay đổi khẩu phần hoặc dinh dưỡng của thực đơn.</Text>

    {loading ? <View style={styles.state}><ActivityIndicator color={colors.primary} /><Text style={styles.stateText}>Đang tải danh sách đi chợ…</Text></View>
      : loadError ? <View style={styles.state}><Text style={styles.error}>{loadError}</Text><TouchableOpacity style={styles.secondary} onPress={() => setLoadVersion(value => value + 1)}><Text style={styles.secondaryText}>Thử tải lại</Text></TouchableOpacity></View>
        : <>
          <View style={styles.summary}>
            <Text style={styles.heading}>Tóm tắt danh sách</Text>
            <Text style={styles.small}>{list?.items?.length || 0} nguyên liệu đã lưu</Text>
          </View>

          {!!sourceItems.length && <TouchableOpacity style={styles.primary} disabled={creating || !!pendingItemId} onPress={createFromPlan}>
            {creating ? <ActivityIndicator color="white" /> : <Text style={styles.primaryText}>Tạo danh sách từ thực đơn</Text>}
          </TouchableOpacity>}

          <Text style={styles.section}>Danh sách hiện tại</Text>
          {!list ? <View style={styles.empty}><Text style={styles.heading}>Chưa có danh sách đi chợ đã lưu.</Text>{!!sourceItems.length && <Text style={styles.small}>Tạo danh sách từ thực đơn hiện tại để lưu các nguyên liệu cần mua.</Text>}</View>
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
                    <Text style={styles.small}>Số lượng và đơn vị có thể chỉnh sửa; hỗ trợ g, kg, ml, l, piece, bunch, pack.</Text>
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
                      <TouchableOpacity style={styles.smallButton} disabled={isPending || creating} onPress={() => saveDraft(item)}>
                        {isPending ? <ActivityIndicator color={colors.primary} /> : <Text accessibilityLabel={`Lưu thay đổi ${item.name}`} style={styles.actionText}>Lưu thay đổi {item.name}</Text>}
                      </TouchableOpacity>
                      <TouchableOpacity accessibilityLabel={`Xóa ${item.name}`} style={styles.smallButton} disabled={isPending || creating} onPress={() => confirmDelete(item)}>
                        <Text style={styles.deleteText}>Xóa {item.name}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <Text style={styles.amount}>{item.amount} {item.unit}</Text>
                </View>;
              })}</View>}
        </>}

    {!!mutationError && <Text style={styles.error}>{mutationError}</Text>}
    {!!mutationError && !!retryAction && <TouchableOpacity style={styles.secondary} disabled={creating || !!pendingItemId} onPress={() => retryAction()}><Text style={styles.secondaryText}>Thử thao tác lại</Text></TouchableOpacity>}
    {!!successMessage && <Text accessibilityRole="status" style={styles.success}>{successMessage}</Text>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F9FD' }, content: { padding: 18, paddingBottom: 100 },
  title: { color: colors.text, fontWeight: '800', fontSize: 22 }, subtitle: { color: colors.muted, fontSize: 12, marginTop: 4 },
  disclaimer: { color: colors.warning, fontSize: 12, lineHeight: 18, backgroundColor: '#FFF5DE', padding: 12, borderRadius: radius.sm, marginTop: 12 },
  summary: { backgroundColor: 'white', padding: 16, borderRadius: radius.md, marginTop: 18, elevation: 1 }, heading: { color: colors.text, fontSize: 15, fontWeight: '800' },
  small: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 5 }, section: { fontWeight: '800', color: colors.text, marginTop: 22, marginBottom: 8 },
  card: { backgroundColor: 'white', borderRadius: radius.md, paddingHorizontal: 12 }, row: { minHeight: 90, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: '#F0F2F6', paddingVertical: 12 },
  check: { width: 30, height: 30, borderRadius: 10, backgroundColor: colors.softBlue, justifyContent: 'center', alignItems: 'center' }, checked: { backgroundColor: colors.primary }, checkText: { color: 'white', fontWeight: '800' },
  itemContent: { flex: 1 }, name: { color: colors.text, fontWeight: '700', fontSize: 13 }, strike: { textDecorationLine: 'line-through', color: colors.muted }, amount: { color: colors.primary, fontSize: 12, fontWeight: '800' },
  editRow: { flexDirection: 'row', gap: 8, marginTop: 8 }, inputAmount: { flex: 1, minHeight: 40, backgroundColor: '#F5F7FB', borderRadius: 8, paddingHorizontal: 9, color: colors.text }, inputUnit: { width: 92, minHeight: 40, backgroundColor: '#F5F7FB', borderRadius: 8, paddingHorizontal: 9, color: colors.text },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 7 }, smallButton: { paddingVertical: 6, paddingHorizontal: 8, backgroundColor: '#F5F7FB', borderRadius: 8 }, actionText: { color: colors.primary, fontWeight: '700', fontSize: 11 }, deleteText: { color: colors.danger, fontWeight: '700', fontSize: 11 },
  state: { padding: 22, alignItems: 'center', backgroundColor: 'white', borderRadius: radius.md, marginTop: 18 }, stateText: { color: colors.muted, marginTop: 8 }, empty: { padding: 18, backgroundColor: 'white', borderRadius: radius.md },
  primary: { minHeight: 48, borderRadius: radius.pill, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', marginTop: 14, paddingHorizontal: 16 }, primaryText: { color: 'white', fontWeight: '800' },
  secondary: { backgroundColor: colors.primary, borderRadius: radius.pill, padding: 13, alignItems: 'center', marginTop: 10 }, secondaryText: { color: 'white', fontWeight: '800' },
  error: { color: colors.danger, marginTop: 10, fontSize: 12 }, success: { color: colors.primaryDark, marginTop: 10, fontSize: 12, fontWeight: '700' },
});
