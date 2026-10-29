import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
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
import { PaytonAlertDialog } from '../../components/PaytonAlert';
import { theme } from '../../constants/theme';
import { transactionStyles as styles } from '../../constants/ui.styles';
import { supabase } from '../../lib/supabase';

const HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 };
const HIT_SLOP_SM = { top: 8, bottom: 8, left: 8, right: 8 };

interface Transaction {
  id: string;
  amount: number;
  description: string;
  spent_at: string;
  photo_url?: string | null;
  income_id?: string | null;
  category_id?: string | null;
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

  // Add/Edit Expense Modal States
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [amountInput, setAmountInput] = useState('');
  const [descriptionInput, setDescriptionInput] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [incomeIdInput, setIncomeIdInput] = useState<string | null>(null);

  // Inline Modal Feedback States
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalSuccess, setModalSuccess] = useState<string | null>(null);

  // Delete confirmation (rendered with the shared PaytonAlertDialog, local state)
  const [isDeleteModalVisible, setIsDeleteModalVisible] = useState(false);
  const [transactionToDelete, setTransactionToDelete] = useState<Transaction | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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
    setModalError(null);
    setModalSuccess(null);
    setIsAddModalVisible(false);
  };

  const handleOpenEditModal = (expense: Transaction) => {
    setEditingTransaction(expense);
    setAmountInput(expense.amount.toString());
    setDescriptionInput(expense.description);
    setIncomeIdInput(expense.income_id || null);
    setModalError(null);
    setModalSuccess(null);
    
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
            color: rawCategory?.color || theme.colors.textMuted
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
                color: rawCat?.color || theme.colors.brand,
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
    setModalError(null);
    setModalSuccess(null);

    const numericAmount = parseFloat(amountInput);
    if (!amountInput || isNaN(numericAmount) || numericAmount <= 0) {
      setModalError('Please enter a valid amount.');
      return;
    }
    if (!descriptionInput.trim()) {
      setModalError('Please enter a description.');
      return;
    }
    if (!selectedCategory) {
      setModalError('Please select a category.');
      return;
    }

    try {
      setIsSubmitting(true);

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        setModalError('You must be logged in to manage expenses.');
        setIsSubmitting(false);
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
          .order('received_at', { ascending: false });

        if (incomeErr) throw incomeErr;
        activeIncomes = allIncomes || [];
      }

      if (activeIncomes.length === 0) {
        setModalError('Cannot save expense: No active incomes found.');
        setIsSubmitting(false);
        return;
      }

      const totalIncomeBudget = activeIncomes.reduce((sum, item) => sum + Number(item.amount), 0);
      const incomeIds = activeIncomes.map(a => a.id);
      const { data: allExpenses, error: expErr } = await supabase
        .from('expenses')
        .select('id, amount')
        .in('income_id', incomeIds);

      if (expErr) throw expErr;

      const filteredExpenses = (allExpenses || []).filter(item => {
        if (editingTransaction && item.id === editingTransaction.id) {
          return false;
        }
        return true;
      });

      const totalSpent = filteredExpenses.reduce((sum, item) => sum + Number(item.amount), 0);
      const remainingBalance = totalIncomeBudget - totalSpent;

      if (numericAmount > remainingBalance) {
        setModalError(`Expense exceeds total remaining income balance (₱${remainingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}).`);
        setIsSubmitting(false);
        return;
      }

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

      setModalSuccess(editingTransaction ? 'Expense updated successfully!' : 'Expense saved successfully!');
      setTimeout(() => {
        handleCloseModal();
        fetchTransactions();
      }, 700);

    } catch (err: any) {
      console.error('Error saving expense:', err.message);
      setModalError('Failed to save expense: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDeleteExpense = (expense: Transaction) => {
    setTransactionToDelete(expense);
    setIsDeleteModalVisible(true);
  };

  // Closing is blocked while a delete is in flight.
  const closeDeleteDialog = () => {
    if (!isDeleting) setIsDeleteModalVisible(false);
  };

  const handleDeleteExpense = async () => {
    // PaytonAlertDialog buttons cannot be disabled, so the in-flight guard lives here.
    if (!transactionToDelete || isDeleting) return;

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

      setIsDeleteModalVisible(false);
      setTransactionToDelete(null);
      
      setSuccessMessage('Transaction deleted successfully!');
      setTimeout(() => setSuccessMessage(null), 3500);

      fetchTransactions();
    } catch (err: any) {
      console.error('Error deleting expense:', err.message);
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
    return (
      <View style={[styles.container, styles.centeredContent]}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color={theme.colors.brand} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
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

      {/* ADD / EDIT EXPENSE MODAL */}
      <Modal
        visible={isAddModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={handleCloseModal}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingTransaction ? 'Edit Expense' : 'Add Expense'}
              </Text>
              <TouchableOpacity onPress={handleCloseModal} style={styles.modalCloseButton}>
                <Ionicons name="close" size={20} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </View>

            {modalError && (
              <View style={styles.inlineErrorContainer}>
                <Ionicons name="alert-circle-outline" size={18} color={theme.colors.danger} style={styles.bannerIcon} />
                <Text style={styles.inlineErrorText}>{modalError}</Text>
              </View>
            )}

            {modalSuccess && (
              <View style={styles.inlineSuccessContainer}>
                <Ionicons name="checkmark-circle-outline" size={18} color={theme.colors.green} style={styles.bannerIcon} />
                <Text style={styles.inlineSuccessText}>{modalSuccess}</Text>
              </View>
            )}

            <View style={styles.calcInputContainer}>
              <TextInput
                style={styles.calcInput}
                placeholder="₱0.00"
                placeholderTextColor={theme.colors.borderStrong}
                keyboardType="numeric"
                value={amountInput}
                onChangeText={setAmountInput}
                autoFocus={true}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Description</Text>
              <TextInput
                style={styles.textInputStyle}
                placeholder="e.g., Grocery shopping, Coffee..."
                placeholderTextColor={theme.colors.textSubtle}
                value={descriptionInput}
                onChangeText={setDescriptionInput}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Category</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.categoryScrollContent}
              >
                {categories.map((cat) => {
                  const isSelected = selectedCategory?.id === cat.id;
                  return (
                    <TouchableOpacity
                      key={cat.id}
                      onPress={() => setSelectedCategory(cat)}
                      style={[styles.categoryChip, isSelected ? styles.categoryChipSelected : styles.categoryChipIdle]}
                    >
                      <Ionicons name={cat.icon || 'receipt-outline'} size={16} color={isSelected ? theme.colors.white : cat.color} />
                      <Text style={[styles.categoryChipText, isSelected ? styles.categoryChipTextSelected : styles.categoryChipTextIdle]}>
                        {cat.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            <TouchableOpacity 
              style={[styles.submitButton, isSubmitting && styles.submitButtonBusy]}
              onPress={handleSaveExpense}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color={theme.colors.white} />
              ) : (
                <Text style={styles.submitButtonText}>
                  {editingTransaction ? 'Update Expense' : 'Save Expense'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* DELETE CONFIRMATION — shared PaytonAlertDialog (local state, no PaytonAlertProvider needed) */}
      <PaytonAlertDialog
        visible={isDeleteModalVisible}
        type="error"
        title="Delete Transaction"
        message={`Are you sure you want to delete "${transactionToDelete?.description ?? ''}"?\nThis action cannot be undone.`}
        buttons={[
          { text: 'Cancel', style: 'cancel', onPress: closeDeleteDialog },
          { text: isDeleting ? 'Deleting...' : 'Delete', style: 'destructive', onPress: handleDeleteExpense },
        ]}
        onDismiss={closeDeleteDialog}
      />

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
        <TouchableOpacity
          style={[styles.scrollTopFAB, styles.scrollTopFabRaised]}
          activeOpacity={0.8}
          onPress={scrollToTop}
        >
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