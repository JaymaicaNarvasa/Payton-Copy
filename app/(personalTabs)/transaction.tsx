import { theme } from '@/constants/theme';
import { sponsorHomeStyles as sheetStyles, transactionStyles as styles } from '@/constants/ui.styles';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Image,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { GradientBackground } from '../../components/GradientBackground';
import { useAlert } from '../../components/PaytonAlert';
import {
  AMOUNT_REGEX,
  Banner,
  Field,
  MODAL_SWAP_DELAY,
  Msg,
  Sheet,
  SheetActions,
} from '../../components/Sheet';
import { Skeleton } from '../../components/Skeleton';
import { supabase } from '../../lib/supabase';

const HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 };
const HIT_SLOP_SM = { top: 8, bottom: 8, left: 8, right: 8 };

const COLORS = {
  white: theme.colors.white,
};

interface Transaction {
  id: string;
  amount: number;
  description: string;
  spent_at: string;
  photo_url?: string | null;
  income_id?: string | null;
  categories: {
    name: string;
    icon: keyof typeof Ionicons.glyphMap;
    color: string;
  };
}

interface Category {
  id: string;
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}

interface BudgetWallet {
  category_id: string;
  category_name: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  allocated_amount: number;
  spent_amount: number;
  remaining_amount: number;
}

function TransactionsScreenContent() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef<ScrollView>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgetWallets, setBudgetWallets] = useState<BudgetWallet[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showScrollTop, setShowScrollTop] = useState(false);

    // Global Inline Success Alert State (for screen-level notices like deletion)
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const { showAlert } = useAlert();
  /** Sheets and the alert are both Modals: close the sheet first, then show the alert once it is gone. */
  const notify = (config: Parameters<typeof showAlert>[0]) => {
    setTimeout(() => showAlert(config), MODAL_SWAP_DELAY);
  };

  // Add/Edit Expense sheet
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [amountInput, setAmountInput] = useState('');
  const [descriptionInput, setDescriptionInput] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [incomeIdInput, setIncomeIdInput] = useState<string | null>(null);

  // Field-level errors show right under each input; submit/server messages go to a banner inside the sheet.
  type ExpenseErrors = { amount?: string; description?: string; category?: string };
  const [expenseErrors, setExpenseErrors] = useState<ExpenseErrors>({});
  const [modalBanner, setModalBanner] = useState<Msg>(null);

  // Delete confirmation sheet
  const [isDeleteModalVisible, setIsDeleteModalVisible] = useState(false);
  const [transactionToDelete, setTransactionToDelete] = useState<Transaction | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteBanner, setDeleteBanner] = useState<Msg>(null);

  // Full-screen Image Viewer State
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);

  const handleBackPress = () => {
    router.push('/home'); 
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    setShowScrollTop(offsetY > 150);
  };

  const scrollToTop = () => {
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
  };

  const handleCloseModal = () => {
    setAmountInput('');
    setDescriptionInput('');
    setSelectedCategory(null);
    setEditingTransaction(null);
    setIncomeIdInput(null);
    setExpenseErrors({});
    setModalBanner(null);
    setIsAddModalVisible(false);
  };

  const closeAddModal = () => {
    if (isSubmitting) return;
    handleCloseModal();
  };

  const clearExpenseError = (key: keyof ExpenseErrors) =>
    setExpenseErrors((p) => (p[key] ? { ...p, [key]: undefined } : p));

  const handleOpenEditModal = (expense: Transaction) => {
    setEditingTransaction(expense);
    setAmountInput(expense.amount.toString());
    setDescriptionInput(expense.description);
    setIncomeIdInput(expense.income_id || null);
    setExpenseErrors({});
    setModalBanner(null);
    
    const matchedCat = categories.find(cat => cat.name === expense.categories.name);
    setSelectedCategory(matchedCat || null);
    setIsAddModalVisible(true);
  };

  const fetchCategories = async () => {
    try {
      const { data: catData, error: catErr } = await supabase
        .from('categories')
        .select('id, name, icon, color');

      if (catErr) throw catErr;
      
      const formattedCategories = (catData || []).map((cat: any) => ({
        ...cat,
        color: cat.color || theme.colors.brand,
      }));

      setCategories(formattedCategories);
    } catch (err: any) {
      console.error('Error fetching categories:', err.message);
    }
  };

  const fetchTransactions = useCallback(async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);
      await fetchCategories();

      const { data, error } = await supabase
        .from('expenses')
        .select(`
          id,
          amount,
          description,
          spent_at,
          photo_url,
          income_id,
          category_id,
          categories (
            name,
            icon,
            color
          ),
          income!inner (
            id,
            is_archived
          )
        `)
        .eq('income.is_archived', false)
        .order('spent_at', { ascending: false });

      if (error) throw error;

      const formattedData = (data || []).map((expense: any) => {
        const rawCategory = Array.isArray(expense.categories) 
          ? expense.categories[0] 
          : expense.categories;

        return {
          id: expense.id,
          amount: Number(expense.amount),
          description: expense.description,
          spent_at: expense.spent_at,
          photo_url: expense.photo_url || null,
          income_id: expense.income_id || null,
          category_id: expense.category_id || null,
          categories: {
            name: rawCategory?.name || 'Uncategorized',
            icon: rawCategory?.icon || 'receipt-outline',
            color: rawCategory?.color || '#64748B'
          }
        };
      });

      setTransactions(formattedData as Transaction[]);

      // Fetch Budgets & Compute Budget Wallets per Category
      const { data: incomeData } = await supabase
        .from('income')
        .select('id')
        .eq('is_archived', false);

      const activeIncomeIds = (incomeData || []).map((inc: any) => inc.id);

      if (activeIncomeIds.length > 0) {
        const { data: budgetData, error: budgetErr } = await supabase
          .from('budgets')
          .select(`
            category_id,
            allocated_amount,
            income_id,
            categories (
              name,
              icon,
              color
            )
          `)
          .in('income_id', activeIncomeIds);

        if (!budgetErr && budgetData) {
          // Aggregate budgets per category across active incomes
          const walletMap: { [key: string]: BudgetWallet } = {};

          budgetData.forEach((b: any) => {
            const catId = b.category_id;
            const rawCat = Array.isArray(b.categories) ? b.categories[0] : b.categories;
            const allocated = Number(b.allocated_amount || 0);

            if (!walletMap[catId]) {
              walletMap[catId] = {
                category_id: catId,
                category_name: rawCat?.name || 'Category',
                icon: rawCat?.icon || 'receipt-outline',
                color: rawCat?.color || '#1F4F59',
                allocated_amount: 0,
                spent_amount: 0,
                remaining_amount: 0,
              };
            }
            walletMap[catId].allocated_amount += allocated;
          });

          // Calculate total spent per category from active expenses
          formattedData.forEach((tx: any) => {
            if (tx.category_id && walletMap[tx.category_id]) {
              walletMap[tx.category_id].spent_amount += tx.amount;
            }
          });

          // Compute remaining amounts
          const wallets = Object.values(walletMap).map(w => ({
            ...w,
            remaining_amount: w.allocated_amount - w.spent_amount
          }));

          setBudgetWallets(wallets);
        } else {
          setBudgetWallets([]);
        }
      } else {
        setBudgetWallets([]);
      }

    } catch (error: any) {
      console.error('Fetch Transactions Error:', error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  

  useFocusEffect(
    useCallback(() => {
      fetchTransactions();
    }, [fetchTransactions])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchTransactions(true);
  }, [fetchTransactions]);

  const handleSaveExpense = async () => {
    setModalBanner(null);

    const errors: ExpenseErrors = {};
    const amountTrimmed = amountInput.trim();
    const numericAmount = parseFloat(amountTrimmed);

    if (!amountTrimmed) {
      errors.amount = 'Enter the expense amount.';
    } else if (!AMOUNT_REGEX.test(amountTrimmed)) {
      errors.amount = 'Enter a valid amount, up to 2 decimal places.';
    } else if (numericAmount <= 0) {
      errors.amount = 'Amount must be greater than zero.';
    }
    if (!descriptionInput.trim()) errors.description = 'Enter a description for this expense.';
    if (!selectedCategory) errors.category = 'Select a category.';

    setExpenseErrors(errors);
    if (Object.keys(errors).length > 0 || !selectedCategory) return;

    try {
      setIsSubmitting(true);

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        setModalBanner({ type: 'error', text: 'You must be logged in to manage expenses.' });
        return;
      }

      let targetIncomeId = incomeIdInput;
      let activeIncomes: any[] = [];
      
      if (targetIncomeId) {
        const { data: specificIncome } = await supabase
          .from('income')
          .select('*')
          .eq('id', targetIncomeId)
          .single();
        if (specificIncome) activeIncomes = [specificIncome];
      }

      if (activeIncomes.length === 0) {
        const { data: allIncomes, error: incomeErr } = await supabase
          .from('income')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_archived', false)
          .order('received_at', { ascending: false }); // Sort to get the latest income first

        if (incomeErr) throw incomeErr;
        activeIncomes = allIncomes || [];
      }

      if (activeIncomes.length === 0) {
        setModalBanner({ type: 'error', text: 'Cannot save expense: no active income found.' });
        return;
      }

      // Calculate total available amount across all valid income
      const totalIncomeBudget = activeIncomes.reduce((sum, item) => sum + Number(item.amount), 0);

      // Get all expenses linked to these income
      const incomeIds = activeIncomes.map(a => a.id);
      const { data: allExpenses, error: expErr } = await supabase
        .from('expenses')
        .select('id, amount')
        .in('income_id', incomeIds);

      if (expErr) throw expErr;

      // Filter out current editing transaction if updating
      const filteredExpenses = (allExpenses || []).filter(item => {
        if (editingTransaction && item.id === editingTransaction.id) {
          return false;
        }
        return true;
      });

      const totalSpent = filteredExpenses.reduce((sum, item) => sum + Number(item.amount), 0);
      const remainingBalance = totalIncomeBudget - totalSpent;

      if (numericAmount > remainingBalance) {
        setExpenseErrors({
          amount: `Exceeds your remaining balance (₱${remainingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}).`,
        });
        return;
      }

      // Default target income ID for new inserts (grabs the latest one since it's sorted)
      if (!targetIncomeId && activeIncomes.length > 0) {
        targetIncomeId = activeIncomes[0].id;
      }

      if (editingTransaction) {
        const { error } = await supabase
          .from('expenses')
          .update({
            amount: numericAmount,
            description: descriptionInput.trim(),
            category_id: selectedCategory.id,
            income_id: targetIncomeId || null,
          })
          .eq('id', editingTransaction.id);

        if (error) throw error;

        await supabase.from('logs').insert({
          user_id: user.id,
          details: `updated expense "${descriptionInput.trim()}" (${numericAmount}).`,
        });
      } else {
        const { error } = await supabase.from('expenses').insert({
          amount: numericAmount,
          description: descriptionInput.trim(),
          category_id: selectedCategory.id,
          user_id: user.id,
          income_id: targetIncomeId || null,
          spent_at: new Date().toISOString(),
        });

        if (error) throw error;

        await supabase.from('logs').insert({
          user_id: user.id,
          details: `added expense "${descriptionInput.trim()}" (${numericAmount}).`,
        });
      }

      const wasEditing = !!editingTransaction;
      const savedDescription = descriptionInput.trim();
      handleCloseModal();
      fetchTransactions(true);
      notify({
        type: 'success',
        title: wasEditing ? 'Expense updated' : 'Expense saved',
        message: `"${savedDescription}" was ${wasEditing ? 'updated' : 'added to your transactions'}.`,
      });
    } catch (err: any) {
      console.error('Error saving expense:', err.message);
      setModalBanner({ type: 'error', text: 'Failed to save expense: ' + err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDeleteExpense = (expense: Transaction) => {
    setDeleteBanner(null);
    setTransactionToDelete(expense);
    setIsDeleteModalVisible(true);
  };

  const closeDeleteModal = () => {
    if (isDeleting) return;
    setIsDeleteModalVisible(false);
    setDeleteBanner(null);
  };

  const handleDeleteExpense = async () => {
    if (!transactionToDelete) return;

    try {
      setIsDeleting(true);
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', transactionToDelete.id);

      if (error) throw error;

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('logs').insert({
          user_id: user.id,
          details: `deleted expense "${transactionToDelete.description || transactionToDelete.id}" (${transactionToDelete.amount}).`,
        });
      }

      const deletedDescription = transactionToDelete.description || 'transaction';
      setIsDeleteModalVisible(false);
      setDeleteBanner(null);
      setTransactionToDelete(null);
      fetchTransactions(true);
      notify({
        type: 'success',
        title: 'Transaction deleted',
        message: `"${deletedDescription}" was removed.`,
      });
    } catch (err: any) {
      console.error('Error deleting expense:', err.message);
      setDeleteBanner({ type: 'error', text: 'Failed to delete transaction. Please try again.' });
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredTransactions = useMemo(() => {
    let filtered = transactions;
    const query = searchQuery.toLowerCase().trim();
    if (query) {
      filtered = filtered.filter(tx => {
        const matchesDescription = tx.description?.toLowerCase().includes(query);
        const matchesCategory = tx.categories?.name?.toLowerCase().includes(query);
        return matchesDescription || matchesCategory;
      });
    }
    return filtered;
  }, [searchQuery, transactions]);

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const timeString = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    if (date.toDateString() === today.toDateString()) {
      return `Today at ${timeString}`;
    } else if (date.toDateString() === yesterday.toDateString()) {
      return `Yesterday at ${timeString}`;
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
  };

  if (loading && transactions.length === 0) {
    const onDark = theme.colors.alpha.white[30];
    return (
      <View style={[styles.container, { paddingBottom: insets.bottom }]}>
        <StatusBar style="light" />

        {/* Header */}
        <View
          style={[
            styles.topBackgroundHeader,
            { paddingTop: Platform.OS === 'android' ? insets.top + 12 : insets.top + 8 },
          ]}
        >
          <View style={styles.headerGradientFill}>
            <GradientBackground />
          </View>
          <View style={styles.header}>
            <Skeleton width={40} height={40} radius={theme.radius.xl} color={onDark} />
            <View style={styles.headerContent}>
              <Skeleton width={130} height={20} radius={10} color={onDark} />
            </View>
            <Skeleton width={38} height={38} radius={theme.radius.soft} color={onDark} />
          </View>
        </View>

        {/* Body */}
        <View style={styles.scrollContent}>
          <View style={{ paddingHorizontal: theme.space[20], paddingTop: theme.space[16] }}>
            <Skeleton width="100%" height={44} radius={theme.radius.lg} />
            <View style={{ gap: theme.space[8], marginTop: theme.space[16] }}>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <View
                  key={i}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: theme.space[12],
                    paddingHorizontal: theme.space[14],
                    backgroundColor: theme.colors.background,
                    borderRadius: theme.radius.soft,
                    borderWidth: 1,
                    borderColor: theme.colors.surfaceAlt,
                  }}
                >
                  <Skeleton width={40} height={40} radius={theme.radius.tight} />
                  <View style={{ flex: 1, marginLeft: theme.space[12], gap: theme.space[8] }}>
                    <Skeleton width="55%" height={13} radius={7} />
                    <Skeleton width="35%" height={10} radius={5} />
                  </View>
                  <Skeleton width={70} height={14} radius={7} />
                </View>
              ))}
            </View>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <StatusBar style="light" />

      {/* HEADER */}
      <View
        style={[
          styles.topBackgroundHeader,
          { paddingTop: Platform.OS === 'android' ? insets.top + 12 : insets.top + 8 },
        ]}
      >
        <View style={styles.headerGradientFill} pointerEvents="none">
          <GradientBackground id="transactions-header-gradient" />
        </View>

        <View style={styles.header}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleBackPress}
            style={styles.headerActionButton}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={22} color={theme.colors.white} />
          </TouchableOpacity>
          
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle} numberOfLines={1}>Transactions</Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              setEditingTransaction(null);
              setIsAddModalVisible(true);
            }}
            style={styles.headerActionButton}
            accessibilityRole="button"
            accessibilityLabel="Add expense"
          >
            <Ionicons name="add" size={22} color={theme.colors.white} />
          </TouchableOpacity>
        </View>
      </View>

      {/* TRANSACTION LIST WITH PULL-TO-REFRESH */}
            <ScrollView 
              ref={scrollViewRef}
              style={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              onScroll={handleScroll}
              scrollEventThrottle={16}
              contentContainerStyle={styles.listContent}
              refreshControl={
                <RefreshControl 
                  refreshing={refreshing} 
                  onRefresh={onRefresh} 
                  tintColor={theme.colors.olive} 
                  colors={[theme.colors.olive]} 
                />
              }
            >
              <View style={styles.topSection}>
                {/* INLINE SUCCESS ALERT BANNER */}
                {successMessage && (
                  <View style={styles.screenInlineSuccessContainer}>
                    <Ionicons name="checkmark-circle" size={18} color={theme.colors.green} style={styles.bannerIcon} />
                    <Text style={styles.screenInlineSuccessText}>{successMessage}</Text>
                    <TouchableOpacity onPress={() => setSuccessMessage(null)} hitSlop={HIT_SLOP}>
                      <Ionicons name="close" size={16} color={theme.colors.green} />
                    </TouchableOpacity>
                  </View>
                )}
      
                {/* HORIZONTAL BUDGET WALLETS CONTAINER */}
                {budgetWallets.length > 0 && (
                  <View style={styles.sectionBlock}>
                    <Text style={styles.sectionTitle}>Budget Wallets</Text>
                    <ScrollView 
                      horizontal 
                      showsHorizontalScrollIndicator={false} 
                      contentContainerStyle={styles.walletStrip}
                    >
                      {/* Sort wallets so the lowest remaining budget appears first */}
                      {[...budgetWallets]
                        .sort((a, b) => a.remaining_amount - b.remaining_amount)
                        .map((wallet) => {
                          const walletColor = wallet.color || theme.colors.brand;
                          const isNegative = wallet.remaining_amount < 0;
                          return (
                            <View key={wallet.category_id} style={styles.walletCard}>
                              <View style={styles.walletHeaderRow}>
                                <View style={[styles.walletIconCircle, { backgroundColor: `${walletColor}15` }]}>
                                  <Ionicons name={wallet.icon || 'receipt-outline'} size={14} color={walletColor} />
                                </View>
                                <Text style={styles.walletName} numberOfLines={1}>
                                  {wallet.category_name}
                                </Text>
                              </View>
      
                              <View>
                                <Text style={styles.walletRemainingLabel}>Remaining</Text>
                                <Text
                                  style={[
                                    styles.walletRemainingAmount,
                                    isNegative ? styles.walletAmountNegative : styles.walletAmountPositive,
                                  ]}
                                  numberOfLines={1}
                                >
                                  {isNegative ? '-' : ''}₱{Math.abs(wallet.remaining_amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </Text>
                              </View>
                            </View>
                          );
                        })}
                    </ScrollView>
                  </View>
                )}
      
                <View style={styles.searchContainer}>
                  <View style={styles.searchWrapper}>
                    <Ionicons name="search-outline" size={18} color={theme.colors.textSubtle} style={styles.searchIcon} />
                    <TextInput
                      style={styles.searchInput}
                      placeholder="Search transactions or categories..."
                      placeholderTextColor={theme.colors.textSubtle}
                      value={searchQuery}
                      onChangeText={setSearchQuery}
                    />
                  </View>
                </View>
              </View>
      
              {filteredTransactions.length === 0 ? (
                <View style={styles.emptyTransactions}>
                  <View style={styles.emptyIconContainer}>
                    <Ionicons name="receipt-outline" size={28} color={theme.colors.textSubtle} />
                  </View>
                  <Text style={styles.emptyText}>No Transactions Found</Text>
                </View>
              ) : (
                <View style={styles.txList}>
                  {filteredTransactions.map((expense) => {
                    const catColor = expense.categories?.color || theme.colors.textMuted;
                    return (
                      <TouchableOpacity
                        key={expense.id}
                        activeOpacity={0.7}
                        onPress={() => handleOpenEditModal(expense)}
                        style={styles.txRow}
                      >
                        <View style={[styles.txIconBox, { backgroundColor: `${catColor}15` }]}>
                          <Ionicons name={expense.categories?.icon || 'receipt-outline'} size={20} color={catColor} />
                        </View>
                        
                        <View style={styles.txBody}>
                          <View style={styles.txTitleRow}>
                            <Text style={styles.txTitle} numberOfLines={1}>
                              {expense.description}
                            </Text>
                            {expense.photo_url ? (
                              <TouchableOpacity 
                                onPress={() => setSelectedImageUri(expense.photo_url!)}
                                hitSlop={HIT_SLOP_SM}
                              >
                                <Ionicons name="image-outline" size={14} color={theme.colors.brand} />
                              </TouchableOpacity>
                            ) : null}
                          </View>
                          <Text style={styles.txDate}>
                            {formatDate(expense.spent_at)}
                          </Text>
                        </View>
      
                        <View style={styles.txRight}>
                          <Text style={styles.txAmount}>
                            -₱{(expense.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </Text>
                          <TouchableOpacity 
                            onPress={() => confirmDeleteExpense(expense)}
                            style={styles.deleteIconButton}
                            hitSlop={HIT_SLOP}
                          >
                            <Ionicons name="trash-outline" size={16} color={theme.colors.textSubtle} />
                          </TouchableOpacity>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </ScrollView>

      {/* ADD / EDIT EXPENSE */}
      <Sheet
        visible={isAddModalVisible}
        title={editingTransaction ? 'Edit Expense' : 'Add Expense'}
        subtitle={editingTransaction ? 'Update the expense details.' : 'Record what you spent.'}
        onClose={closeAddModal}
        footer={
          <SheetActions
            onCancel={closeAddModal}
            onSubmit={handleSaveExpense}
            submitLabel={editingTransaction ? 'Update Expense' : 'Save Expense'}
            loading={isSubmitting}
          />
        }
      >
        <Banner message={modalBanner} />

        <Field label="Amount (PHP)" error={expenseErrors.amount}>
          <View style={sheetStyles.amountWrapper}>
            <Text style={sheetStyles.currencyPrefix}>₱</Text>
            <TextInput
              style={[sheetStyles.input, sheetStyles.amountInput, !!expenseErrors.amount && sheetStyles.inputError]}
              placeholder="0.00"
              placeholderTextColor={theme.colors.textMuted}
              keyboardType="decimal-pad"
              value={amountInput}
              onChangeText={(t) => {
                setAmountInput(t);
                clearExpenseError('amount');
              }}
            />
          </View>
        </Field>

        <Field label="Description" error={expenseErrors.description}>
          <TextInput
            style={[sheetStyles.input, !!expenseErrors.description && sheetStyles.inputError]}
            placeholder="e.g., Grocery shopping, Coffee..."
            placeholderTextColor={theme.colors.textMuted}
            value={descriptionInput}
            onChangeText={(t) => {
              setDescriptionInput(t);
              clearExpenseError('description');
            }}
          />
        </Field>

        <Field label="Category" error={expenseErrors.category}>
          <View style={sheetStyles.chipWrap}>
            {categories.map((cat) => {
              const isSelected = selectedCategory?.id === cat.id;
              return (
                <TouchableOpacity
                  key={cat.id}
                  activeOpacity={0.8}
                  onPress={() => {
                    setSelectedCategory(cat);
                    clearExpenseError('category');
                  }}
                  style={[sheetStyles.categoryChip, isSelected && sheetStyles.categoryChipActive]}
                >
                  <Ionicons
                    name={cat.icon || 'receipt-outline'}
                    size={15}
                    color={isSelected ? theme.colors.white : cat.color}
                  />
                  <Text style={[sheetStyles.categoryChipText, isSelected && sheetStyles.categoryChipTextActive]}>
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Field>
      </Sheet>

      {/* DELETE TRANSACTION */}
      <Sheet
        visible={isDeleteModalVisible}
        title="Delete Transaction"
        subtitle="This action cannot be undone."
        onClose={closeDeleteModal}
        footer={
          <SheetActions
            onCancel={closeDeleteModal}
            onSubmit={handleDeleteExpense}
            submitLabel="Delete"
            loading={isDeleting}
            danger
          />
        }
      >
        <Banner message={deleteBanner} />
        <Text style={sheetStyles.confirmText}>
          Are you sure you want to delete{' '}
          <Text style={sheetStyles.confirmTextStrong}>"{transactionToDelete?.description}"</Text>?
        </Text>
      </Sheet>

      {/* FULL-SCREEN IMAGE VIEWER MODAL */}
      <Modal
        visible={!!selectedImageUri}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSelectedImageUri(null)}
      >
        <View style={styles.imageModalOverlay}>
          <TouchableOpacity 
            style={styles.closeImageButton} 
            onPress={() => setSelectedImageUri(null)}
          >
            <Ionicons name="close" size={28} color={theme.colors.white} />
          </TouchableOpacity>
          {selectedImageUri ? (
            <Image 
              source={{ uri: selectedImageUri }} 
              style={styles.fullScreenImage} 
              resizeMode="contain" 
            />
          ) : null}
        </View>
      </Modal>

      {showScrollTop && (
        <TouchableOpacity style={styles.scrollTopFAB} activeOpacity={0.8} onPress={scrollToTop}>
          <Ionicons name="arrow-up" size={20} color={theme.colors.white} />
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function TransactionsScreenWrapper() {
  return (
    <SafeAreaProvider>
      <TransactionsScreenContent />
    </SafeAreaProvider>
  );
}