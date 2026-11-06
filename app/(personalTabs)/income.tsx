import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// NOTE: adjust these paths to match your project (same layout as transaction.tsx).
import { GradientBackground } from '../../components/GradientBackground';
import { useAlert } from '../../components/PaytonAlert';
import {
  AMOUNT_REGEX,
  Banner,
  DateRangePickerSheet,
  Field,
  MODAL_SWAP_DELAY,
  Msg,
  Sheet,
  SheetActions,
  parseDateString,
  toDateString,
} from '../../components/Sheet';
import { Skeleton } from '../../components/Skeleton';
import { theme } from '../../constants/theme';
import { incomeStyles as styles, sponsorHomeStyles as sheetStyles } from '../../constants/ui.styles';
import { supabase } from '../../lib/supabase';

const { colors } = theme;

/* ---------- Types ---------- */
interface IncomeItem {
  id: string;
  user_id: string;
  source_name: string;
  amount: number;
  start_date: string;
  end_date: string;
  received_at: string;
  is_archived?: boolean;
}

interface CategoryItem {
  id: string;
  name: string;
  icon?: string | null;
  color?: string | null;
}

type PeriodKey = 'today' | 'week' | 'nextWeek' | 'month' | 'nextMonth' | 'custom';
type IncomeErrors = { source?: string; amount?: string; period?: string; budget?: string };
type ConfirmState = { visible: boolean; kind: 'archive' | 'delete'; item: IncomeItem | null };

const PERIODS: { key: Exclude<PeriodKey, 'custom'>; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'nextWeek', label: 'Next Week' },
  { key: 'month', label: 'This Month' },
  { key: 'nextMonth', label: 'Next Month' },
];

/* ---------- Helpers ---------- */
const toCents = (value: string) => {
  const t = (value || '').trim();
  return AMOUNT_REGEX.test(t) ? Math.round(parseFloat(t) * 100) : 0;
};

const formatPeso = (n: number) =>
  `₱${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDate = (dateStr: string) => {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  return parseDateString(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const formatRange = (start: string, end: string) => {
  if (!start) return 'Select a period';
  if (start === end) return formatDate(start);
  return `${formatDate(start)} → ${formatDate(end)}`;
};

const localDate = (year: number, monthIndex: number, day: number) =>
  toDateString(new Date(year, monthIndex, day));

const getPeriodDates = (period: Exclude<PeriodKey, 'custom'>) => {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth();
  const day = d.getDate();
  const dow = d.getDay();

  switch (period) {
    case 'today':
      return { start: localDate(y, m, day), end: localDate(y, m, day) };
    case 'week':
      return { start: localDate(y, m, day - dow), end: localDate(y, m, day + (6 - dow)) };
    case 'nextWeek':
      return { start: localDate(y, m, day + (7 - dow)), end: localDate(y, m, day + (13 - dow)) };
    case 'month':
      return { start: localDate(y, m, 1), end: localDate(y, m + 1, 0) };
    case 'nextMonth':
      return { start: localDate(y, m + 1, 1), end: localDate(y, m + 2, 0) };
  }
};

/* ---------- Loading skeleton ---------- */
function IncomeSkeleton({ topInset }: { topInset: number }) {
  const onGradient = theme.colors.alpha.white[30];
  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <View style={[styles.topBackgroundHeader, { paddingTop: topInset + theme.space[8] }]}>
        <View style={styles.headerGradientFill} pointerEvents="none">
          <GradientBackground />
        </View>
        <View style={styles.headerRow}>
          <Skeleton width={36} height={36} radius={theme.radius.md} color={onGradient} />
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Skeleton width={160} height={20} radius={8} color={onGradient} />
          </View>
          <Skeleton width={36} height={36} radius={theme.radius.md} color={onGradient} />
        </View>
      </View>

      <View style={styles.sheet}>
        <View style={styles.scrollContent}>
          <View style={styles.sectionHeaderRow}>
            <Skeleton width={150} height={20} radius={8} />
            <Skeleton width={70} height={28} radius={theme.radius.pill} />
          </View>

          {[0, 1, 2, 3, 4].map((i) => (
            <View key={i} style={styles.incomeCard}>
              <View style={styles.cardHeaderRow}>
                <View style={styles.cardHeaderLeft}>
                  <Skeleton width={44} height={44} radius={theme.radius.md} />
                  <View style={{ flex: 1, gap: 8 }}>
                    <Skeleton width="60%" height={14} radius={6} />
                  </View>
                </View>
                <Skeleton width={90} height={18} radius={6} />
              </View>
              <View style={styles.cardDivider} />
              <View style={styles.cardFooterRow}>
                <Skeleton width={150} height={12} radius={6} />
                <View style={styles.actionButtonsRow}>
                  <Skeleton width={32} height={32} radius={theme.radius.sm} />
                  <Skeleton width={32} height={32} radius={theme.radius.sm} />
                </View>
              </View>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

/* ---------- Screen ---------- */
export default function IncomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showAlert } = useAlert();

  /** Sheets and the alert are both Modals: close the sheet first, then show the alert once it is gone. */
  const notify = (config: Parameters<typeof showAlert>[0]) => {
    setTimeout(() => showAlert(config), MODAL_SWAP_DELAY);
  };

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [incomes, setIncomes] = useState<IncomeItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loadError, setLoadError] = useState<Msg>(null);

  // Add-income sheet
  const [addVisible, setAddVisible] = useState(false);
  const [sourceName, setSourceName] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodKey>('today');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [errors, setErrors] = useState<IncomeErrors>({});
  const [addBanner, setAddBanner] = useState<Msg>(null);
  const [submitting, setSubmitting] = useState(false);
  const [rangeVisible, setRangeVisible] = useState(false);

  // Optional budget allocation
  const [budgetEnabled, setBudgetEnabled] = useState(false);
  const [budgetVisible, setBudgetVisible] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState<Record<string, string>>({});
  const [budgetSaved, setBudgetSaved] = useState<Record<string, string>>({});
  const [budgetRowErrors, setBudgetRowErrors] = useState<Record<string, string | undefined>>({});
  const [budgetListError, setBudgetListError] = useState<string | undefined>();

  // Archive / delete confirmation
  const [confirm, setConfirm] = useState<ConfirmState>({ visible: false, kind: 'archive', item: null });
  const [confirmBanner, setConfirmBanner] = useState<Msg>(null);
  const [confirming, setConfirming] = useState(false);

  const amountCents = toCents(amount);
  const budgetSavedCents = Object.values(budgetSaved).reduce((s, v) => s + toCents(v), 0);
  const budgetDraftCents = Object.values(budgetDraft).reduce((s, v) => s + toCents(v), 0);
  const budgetRemainingCents = amountCents - budgetDraftCents;
  const budgetMismatch = budgetEnabled && budgetSavedCents > 0 && budgetSavedCents !== amountCents;

  /* ---------- Data ---------- */
  const fetchData = async () => {
    try {
      setLoadError(null);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: incomeData, error: incomeError } = await supabase
        .from('income')
        .select('*')
        .eq('user_id', user.id)
        .order('received_at', { ascending: false });
      if (incomeError) throw incomeError;
      setIncomes(incomeData || []);

      const { data: categoryData, error: categoryError } = await supabase
        .from('categories')
        .select('*')
        .or(`user_id.eq.${user.id},user_id.is.null`);
      if (categoryError) throw categoryError;
      setCategories(categoryData || []);
    } catch (error: any) {
      setLoadError({ type: 'error', text: error?.message || 'Failed to load income.' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchData();
    }, []),
  );

  /* ---------- Add income ---------- */
  const clearError = (key: keyof IncomeErrors) => setErrors((p) => ({ ...p, [key]: undefined }));

  const resetBudget = () => {
    setBudgetEnabled(false);
    setBudgetVisible(false);
    setBudgetDraft({});
    setBudgetSaved({});
    setBudgetRowErrors({});
    setBudgetListError(undefined);
  };

  const resetForm = () => {
    setSourceName('');
    setAmount('');
    setErrors({});
    setAddBanner(null);
    resetBudget();
    setSelectedPeriod('today');
    const dates = getPeriodDates('today');
    setStartDate(dates.start);
    setEndDate(dates.end);
  };

  const openAddModal = () => {
    resetForm();
    setAddVisible(true);
  };

  const closeAddModal = () => {
    if (submitting) return;
    setAddVisible(false);
    setRangeVisible(false);
    setBudgetVisible(false);
  };

  const selectPeriod = (key: Exclude<PeriodKey, 'custom'>) => {
    setSelectedPeriod(key);
    const dates = getPeriodDates(key);
    setStartDate(dates.start);
    setEndDate(dates.end);
    clearError('period');
  };

  const handleSaveIncome = async () => {
    setAddBanner(null);

    const next: IncomeErrors = {};
    const trimmedSource = sourceName.trim();
    const trimmedAmount = amount.trim();

    if (!trimmedSource) next.source = 'Enter where this income comes from.';

    if (!trimmedAmount) next.amount = 'Enter the income amount.';
    else if (!AMOUNT_REGEX.test(trimmedAmount)) next.amount = 'Enter a valid amount, up to 2 decimal places.';
    else if (amountCents <= 0) next.amount = 'Amount must be greater than ₱0.00.';

    if (!startDate || !endDate) next.period = 'Select a coverage period.';
    else if (startDate > endDate) next.period = 'Start date cannot be later than the end date.';

    if (budgetEnabled) {
      if (budgetSavedCents === 0) next.budget = 'Set up the budget or turn this option off.';
      else if (budgetSavedCents !== amountCents) {
        next.budget = 'The budget total must equal the income amount. Tap Edit to update it.';
      }
    }

    setErrors(next);
    if (Object.values(next).some(Boolean)) return;

    try {
      setSubmitting(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setAddBanner({ type: 'error', text: 'Your session has expired. Please sign in again.' });
        return;
      }

      const { data: incomeRow, error: insertError } = await supabase
        .from('income')
        .insert([
          {
            user_id: user.id,
            source_name: trimmedSource,
            amount: amountCents / 100,
            start_date: startDate,
            end_date: endDate,
            received_at: new Date().toISOString(),
            is_archived: false,
          },
        ])
        .select()
        .single();
      if (insertError) throw insertError;

      let budgetFailure: string | null = null;
      if (budgetEnabled) {
        const rows = Object.entries(budgetSaved)
          .filter(([, v]) => toCents(v) > 0)
          .map(([categoryId, v]) => ({
            user_id: user.id,
            category_id: categoryId,
            income_id: incomeRow.id,
            allocated_amount: toCents(v) / 100,
          }));
        if (rows.length > 0) {
          const { error: budgetError } = await supabase.from('budgets').insert(rows);
          if (budgetError) budgetFailure = budgetError.message;
        }
      }

      const savedSource = trimmedSource;
      const savedAmount = amountCents / 100;
      const withBudget = budgetEnabled && !budgetFailure;

      resetForm();
      setAddVisible(false);
      fetchData();

      if (budgetFailure) {
        notify({
          type: 'error',
          title: 'Income saved, budget failed',
          message: `${formatPeso(savedAmount)} from "${savedSource}" was added, but the budget could not be saved: ${budgetFailure}`,
        });
      } else {
        notify({
          type: 'success',
          title: 'Income added',
          message: `${formatPeso(savedAmount)} from "${savedSource}" was recorded${withBudget ? ' with a category budget.' : '.'}`,
        });
      }
    } catch (error: any) {
      setAddBanner({ type: 'error', text: error?.message || 'Failed to save income. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  /* ---------- Budget allocation ---------- */
  const openBudgetSheet = () => {
    setBudgetDraft(budgetSaved);
    setBudgetRowErrors({});
    setBudgetListError(undefined);
    setBudgetVisible(true);
  };

  const handleBudgetToggle = (value: boolean) => {
    clearError('budget');
    if (!value) {
      setBudgetEnabled(false);
      setBudgetSaved({});
      setBudgetDraft({});
      return;
    }
    if (amountCents <= 0) {
      setErrors((p) => ({ ...p, amount: 'Enter a valid income amount before setting a budget.' }));
      return;
    }
    setBudgetEnabled(true);
    openBudgetSheet();
  };

  const closeBudgetSheet = () => {
    // Closing without a saved budget turns the toggle back off
    if (budgetSavedCents === 0) setBudgetEnabled(false);
    setBudgetVisible(false);
  };

  const setDraftAmount = (categoryId: string, text: string) => {
    setBudgetDraft((p) => ({ ...p, [categoryId]: text }));
    setBudgetRowErrors((p) => ({ ...p, [categoryId]: undefined }));
    setBudgetListError(undefined);
  };

  const splitBudgetEvenly = () => {
    if (categories.length === 0 || amountCents <= 0) return;
    const n = categories.length;
    const base = Math.floor(amountCents / n);
    let extra = amountCents - base * n;

    const next: Record<string, string> = {};
    categories.forEach((c) => {
      const cents = base + (extra > 0 ? 1 : 0);
      if (extra > 0) extra -= 1;
      next[c.id] = (cents / 100).toFixed(2);
    });
    setBudgetDraft(next);
    setBudgetRowErrors({});
    setBudgetListError(undefined);
  };

  const clearBudgetDraft = () => {
    setBudgetDraft({});
    setBudgetRowErrors({});
    setBudgetListError(undefined);
  };

  const handleBudgetConfirm = () => {
    const rowErrors: Record<string, string | undefined> = {};
    categories.forEach((c) => {
      const v = (budgetDraft[c.id] || '').trim();
      if (v && !AMOUNT_REGEX.test(v)) rowErrors[c.id] = 'Enter a valid amount, up to 2 decimal places.';
    });
    setBudgetRowErrors(rowErrors);
    if (Object.values(rowErrors).some(Boolean)) return;

    if (budgetDraftCents === 0) {
      setBudgetListError('Allocate the amount to at least one category.');
      return;
    }
    if (budgetRemainingCents > 0) {
      setBudgetListError(`${formatPeso(budgetRemainingCents / 100)} is still left to allocate.`);
      return;
    }
    if (budgetRemainingCents < 0) {
      setBudgetListError(`Over-allocated by ${formatPeso(Math.abs(budgetRemainingCents) / 100)}. Reduce some amounts.`);
      return;
    }

    const cleaned: Record<string, string> = {};
    categories.forEach((c) => {
      const cents = toCents(budgetDraft[c.id] || '');
      if (cents > 0) cleaned[c.id] = (cents / 100).toFixed(2);
    });
    setBudgetSaved(cleaned);
    setBudgetVisible(false);
    clearError('budget');
  };

  /* ---------- Archive / delete ---------- */
  const openConfirm = (kind: 'archive' | 'delete', item: IncomeItem) => {
    setConfirmBanner(null);
    setConfirm({ visible: true, kind, item });
  };

  const closeConfirm = () => {
    if (confirming) return;
    setConfirm((p) => ({ ...p, visible: false }));
  };

  const handleConfirm = async () => {
    const { kind, item } = confirm;
    if (!item) return;
    setConfirmBanner(null);

    try {
      setConfirming(true);
      const { error } =
        kind === 'archive'
          ? await supabase.from('income').update({ is_archived: true }).eq('id', item.id)
          : await supabase.from('income').delete().eq('id', item.id);
      if (error) throw error;

      setConfirm((p) => ({ ...p, visible: false }));
      fetchData();
      notify({
        type: 'success',
        title: kind === 'archive' ? 'Income archived' : 'Income deleted',
        message:
          kind === 'archive'
            ? `"${item.source_name}" was moved to your archive.`
            : `"${item.source_name}" was permanently deleted.`,
      });
    } catch (error: any) {
      setConfirmBanner({
        type: 'error',
        text: error?.message || `Failed to ${kind} this income record. Please try again.`,
      });
    } finally {
      setConfirming(false);
    }
  };

  /* ---------- Render ---------- */
  const activeIncomes = incomes.filter((i) => !i.is_archived);

  if (loading && !refreshing) {
    return <IncomeSkeleton topInset={insets.top} />;
  }

  const isDelete = confirm.kind === 'delete';
  const remainingColor =
    budgetRemainingCents === 0 ? colors.success : budgetRemainingCents < 0 ? colors.danger : colors.gradientEnd;

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={[styles.topBackgroundHeader, { paddingTop: insets.top + theme.space[8] }]}>
        <View style={styles.headerGradientFill} pointerEvents="none">
          <GradientBackground />
        </View>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.headerActionButton} onPress={() => router.back()} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={20} color={colors.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Income Management</Text>
          <TouchableOpacity style={styles.headerActionButton} onPress={openAddModal} activeOpacity={0.7}>
            <Ionicons name="add" size={22} color={colors.white} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Content sheet slides over the header */}
      <View style={styles.sheet}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchData();
              }}
              tintColor={colors.brand}
            />
          }
        >
          <Banner message={loadError} />

          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>All Income Streams</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{activeIncomes.length} Total</Text>
            </View>
          </View>

          {activeIncomes.length === 0 ? (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconBox}>
                <Ionicons name="receipt-outline" size={28} color={colors.brand} />
              </View>
              <Text style={styles.emptyTitle}>No Income Found</Text>
              <Text style={styles.emptyText}>Tap the '+' icon above to add a new income stream.</Text>
            </View>
          ) : (
            activeIncomes.map((item) => (
              <IncomeCard
                key={item.id}
                item={item}
                onArchive={() => openConfirm('archive', item)}
                onDelete={() => openConfirm('delete', item)}
              />
            ))
          )}
        </ScrollView>
      </View>

      {/* ADD INCOME */}
      <Sheet
        visible={addVisible}
        title="Add Income"
        subtitle="Record a new income stream and, optionally, split it across categories."
        onClose={closeAddModal}
        footer={
          <SheetActions
            onCancel={closeAddModal}
            onSubmit={handleSaveIncome}
            submitLabel="Save Income"
            loading={submitting}
          />
        }
      >
        <Banner message={addBanner} />

        <Field label="Source Name" error={errors.source}>
          <TextInput
            style={[sheetStyles.input, !!errors.source && sheetStyles.inputError]}
            value={sourceName}
            onChangeText={(t) => {
              setSourceName(t);
              if (errors.source) clearError('source');
            }}
            placeholder="e.g. Salary, Freelance, Allowance"
            placeholderTextColor={colors.textMuted}
          />
        </Field>

        <Field label="Amount (PHP)" error={errors.amount}>
          <View style={sheetStyles.amountWrapper}>
            <Text style={sheetStyles.currencyPrefix}>₱</Text>
            <TextInput
              style={[sheetStyles.input, sheetStyles.amountInput, !!errors.amount && sheetStyles.inputError]}
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={(t) => {
                setAmount(t);
                if (errors.amount) clearError('amount');
                if (errors.budget) clearError('budget');
              }}
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
            />
          </View>
        </Field>

        <Field label="Coverage Period" error={errors.period}>
          <View style={sheetStyles.periodSelectorContainer}>
            {PERIODS.map((item) => {
              const isActive = selectedPeriod === item.key;
              return (
                <TouchableOpacity
                  key={item.key}
                  style={[sheetStyles.periodPill, isActive && sheetStyles.periodPillActive]}
                  activeOpacity={0.8}
                  onPress={() => selectPeriod(item.key)}
                >
                  <Text style={[sheetStyles.periodPillText, isActive && sheetStyles.periodPillTextActive]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={[sheetStyles.periodPill, selectedPeriod === 'custom' && sheetStyles.periodPillActive]}
              activeOpacity={0.8}
              onPress={() => setRangeVisible(true)}
            >
              <Text
                style={[sheetStyles.periodPillText, selectedPeriod === 'custom' && sheetStyles.periodPillTextActive]}
              >
                Custom
              </Text>
            </TouchableOpacity>
          </View>

          <View style={sheetStyles.dateRangeIndicator}>
            <Ionicons name="calendar-outline" size={14} color={colors.textGray} />
            <Text style={sheetStyles.dateRangeIndicatorText}>{formatRange(startDate, endDate)}</Text>
          </View>
        </Field>

        {/* Optional budget allocation */}
        <View style={sheetStyles.field}>
          <View style={[sheetStyles.budgetCard, !!errors.budget && sheetStyles.budgetCardError]}>
            <View style={sheetStyles.budgetRow}>
              <View style={sheetStyles.budgetIcon}>
                <Ionicons name="pie-chart-outline" size={18} color={colors.dueGreen} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={sheetStyles.budgetTitleRow}>
                  <Text style={sheetStyles.budgetTitle}>Budget allocation</Text>
                  <View style={sheetStyles.optionalTag}>
                    <Text style={sheetStyles.optionalTagText}>Optional</Text>
                  </View>
                </View>
                <Text style={sheetStyles.budgetSubtitle}>Split this income across spending categories.</Text>
              </View>
              <Switch
                value={budgetEnabled}
                onValueChange={handleBudgetToggle}
                disabled={submitting}
                trackColor={{ false: colors.borderStrong, true: colors.dueGreen }}
                thumbColor={colors.white}
                ios_backgroundColor={colors.borderStrong}
              />
            </View>

            {budgetEnabled && budgetSavedCents > 0 && (
              <View style={sheetStyles.budgetSummary}>
                <Ionicons
                  name={budgetMismatch ? 'alert-circle' : 'checkmark-circle'}
                  size={16}
                  color={budgetMismatch ? colors.danger : colors.success}
                />
                <Text
                  style={[sheetStyles.budgetSummaryText, { color: budgetMismatch ? colors.danger : colors.success }]}
                >
                  {budgetMismatch
                    ? `Budget total ${formatPeso(budgetSavedCents / 100)} doesn’t match the amount.`
                    : `${Object.keys(budgetSaved).length} ${
                        Object.keys(budgetSaved).length === 1 ? 'category' : 'categories'
                      } · ${formatPeso(budgetSavedCents / 100)} allocated`}
                </Text>
                <TouchableOpacity style={sheetStyles.budgetEditBtn} activeOpacity={0.7} onPress={openBudgetSheet}>
                  <Text style={sheetStyles.budgetEditText}>Edit</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {errors.budget ? (
            <View style={sheetStyles.fieldErrorRow}>
              <Ionicons name="alert-circle" size={13} color={colors.danger} />
              <Text style={sheetStyles.fieldErrorText}>{errors.budget}</Text>
            </View>
          ) : null}
        </View>
      </Sheet>

      {/* CUSTOM DATE RANGE (any date can be selected) */}
      <DateRangePickerSheet
        visible={rangeVisible}
        start={selectedPeriod === 'custom' ? startDate : ''}
        end={selectedPeriod === 'custom' ? endDate : ''}
        onClose={() => setRangeVisible(false)}
        onConfirm={(s, e) => {
          setStartDate(s);
          setEndDate(e);
          setSelectedPeriod('custom');
          clearError('period');
          setRangeVisible(false);
        }}
      />

      {/* BUDGET ALLOCATION */}
      <Sheet
        visible={budgetVisible}
        title="Budget Allocation"
        subtitle="Distribute the income across categories until nothing is left."
        onClose={closeBudgetSheet}
        footer={<SheetActions onCancel={closeBudgetSheet} onSubmit={handleBudgetConfirm} submitLabel="Save Budget" />}
      >
        <View style={sheetStyles.budgetHero}>
          <View style={sheetStyles.budgetHeroTop}>
            <View>
              <Text style={sheetStyles.budgetHeroLabel}>Left to allocate</Text>
              <Text style={[sheetStyles.budgetHeroAmount, { color: remainingColor }]}>
                {budgetRemainingCents < 0 ? '-' : ''}
                {formatPeso(Math.abs(budgetRemainingCents) / 100)}
              </Text>
            </View>
            <View style={sheetStyles.budgetHeroBadge}>
              <Text style={[sheetStyles.budgetHeroBadgeText, { color: remainingColor }]}>
                {budgetRemainingCents === 0
                  ? 'Fully allocated'
                  : budgetRemainingCents < 0
                    ? 'Over budget'
                    : `of ${formatPeso(amountCents / 100)}`}
              </Text>
            </View>
          </View>
          <View style={sheetStyles.budgetTrack}>
            <View
              style={[
                sheetStyles.budgetFill,
                {
                  width: `${amountCents > 0 ? Math.min(100, (budgetDraftCents / amountCents) * 100) : 0}%`,
                  backgroundColor: budgetRemainingCents < 0 ? colors.danger : colors.dueGreen,
                },
              ]}
            />
          </View>
        </View>

        <View style={sheetStyles.budgetToolsRow}>
          <Text style={sheetStyles.budgetToolsLabel}>Categories</Text>
          <View style={sheetStyles.budgetToolsActions}>
            <TouchableOpacity style={sheetStyles.toolBtn} activeOpacity={0.7} onPress={splitBudgetEvenly}>
              <Text style={sheetStyles.toolBtnText}>Split evenly</Text>
            </TouchableOpacity>
            <TouchableOpacity style={sheetStyles.toolBtn} activeOpacity={0.7} onPress={clearBudgetDraft}>
              <Text style={sheetStyles.toolBtnText}>Clear</Text>
            </TouchableOpacity>
          </View>
        </View>

        {categories.length === 0 ? (
          <View style={sheetStyles.emptyState}>
            <View style={sheetStyles.emptyIcon}>
              <Ionicons name="pricetags-outline" size={22} color={colors.textMuted} />
            </View>
            <Text style={sheetStyles.emptyTitle}>No categories available</Text>
            <Text style={sheetStyles.emptySubtitle}>Add a category first, then come back to set a budget.</Text>
          </View>
        ) : (
          categories.map((c) => {
            const rowError = budgetRowErrors[c.id];
            return (
              <View key={c.id} style={{ marginBottom: 10 }}>
                <View style={sheetStyles.budgetItem}>
                  <View style={sheetStyles.budgetItemIcon}>
                    <Ionicons name={(c.icon as any) || 'pricetag-outline'} size={18} color={colors.dueGreen} />
                  </View>
                  <Text style={sheetStyles.budgetItemName} numberOfLines={1}>{c.name}</Text>
                  <View style={sheetStyles.budgetInputWrap}>
                    <Text style={sheetStyles.budgetPrefix}>₱</Text>
                    <TextInput
                      style={[sheetStyles.budgetInput, !!rowError && sheetStyles.inputError]}
                      placeholder="0.00"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="decimal-pad"
                      value={budgetDraft[c.id] || ''}
                      onChangeText={(t) => setDraftAmount(c.id, t)}
                    />
                  </View>
                </View>
                {rowError ? (
                  <View style={sheetStyles.fieldErrorRow}>
                    <Ionicons name="alert-circle" size={13} color={colors.danger} />
                    <Text style={sheetStyles.fieldErrorText}>{rowError}</Text>
                  </View>
                ) : null}
              </View>
            );
          })
        )}

        {budgetListError ? (
          <View style={sheetStyles.fieldErrorRow}>
            <Ionicons name="alert-circle" size={13} color={colors.danger} />
            <Text style={sheetStyles.fieldErrorText}>{budgetListError}</Text>
          </View>
        ) : null}
      </Sheet>

      {/* ARCHIVE / DELETE */}
      <Sheet
        visible={confirm.visible}
        title={isDelete ? 'Delete Income' : 'Archive Income'}
        subtitle={isDelete ? 'This action cannot be undone.' : 'You can keep it out of the way without losing it.'}
        onClose={closeConfirm}
        footer={
          <SheetActions
            onCancel={closeConfirm}
            onSubmit={handleConfirm}
            submitLabel={isDelete ? 'Delete' : 'Archive'}
            danger={isDelete}
            loading={confirming}
          />
        }
      >
        <Banner message={confirmBanner} />
        <Text style={sheetStyles.confirmText}>
          {isDelete ? 'Permanently delete ' : 'Archive '}
          <Text style={sheetStyles.confirmTextStrong}>{confirm.item?.source_name}</Text>
          {confirm.item ? ` (${formatPeso(Number(confirm.item.amount))})` : ''}?
        </Text>
      </Sheet>
    </View>
  );
}

/* ---------- Income card ---------- */
function IncomeCard({ item, onArchive, onDelete }: { item: IncomeItem; onArchive: () => void; onDelete: () => void }) {
  return (
    <View style={styles.incomeCard}>
      <View style={styles.cardHeaderRow}>
        <View style={styles.cardHeaderLeft}>
          <View style={styles.statusBadge}>
            <Ionicons name="wallet" size={20} color={colors.success} />
          </View>
          <View style={styles.titleWrapper}>
            <Text style={styles.sourceText} numberOfLines={1}>{item.source_name}</Text>
          </View>
        </View>

        <View style={styles.amountContainer}>
          <Text style={styles.amountText}>{formatPeso(Number(item.amount))}</Text>
        </View>
      </View>

      <View style={styles.cardDivider} />

      <View style={styles.cardFooterRow}>
        <View style={styles.dateContainer}>
          <Ionicons name="calendar-outline" size={13} color={colors.textMuted} />
          <Text style={styles.dateText}>{formatRange(item.start_date, item.end_date)}</Text>
        </View>

        <View style={styles.actionButtonsRow}>
          <TouchableOpacity onPress={onArchive} style={[styles.actionButton, styles.archiveButtonBorder]} activeOpacity={0.7}>
            <Ionicons name="archive-outline" size={15} color={colors.brand} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onDelete} style={[styles.actionButton, styles.deleteButtonBorder]} activeOpacity={0.7}>
            <Ionicons name="trash-outline" size={15} color={colors.danger} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
