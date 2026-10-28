import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';

const COLORS = {
  white: '#FFFFFF',
};

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

  // Custom Modern Delete Confirmation States
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
        color: cat.color || '#1F4F59',
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
        <ActivityIndicator size="large" color="#1F4F59" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <StatusBar style="light" />

      {/* HEADER */}
      <View style={[
        styles.topBackgroundHeader, 
        { paddingTop: Platform.OS === 'android' ? insets.top + 12 : insets.top + 8 }
      ]}>
        <View style={styles.header}>
          <TouchableOpacity 
            activeOpacity={0.7}
            onPress={handleBackPress}
            style={styles.backButton}
          >
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
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
            style={styles.quickFormTrigger}
          >
            <Ionicons name="add" size={22} color={COLORS.white} />
          </TouchableOpacity>
        </View>
      </View>

      {/* TRANSACTION LIST WITH PULL-TO-REFRESH */}
      <ScrollView 
        ref={scrollViewRef}
        style={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: 80, paddingTop: 16 }}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh} 
            tintColor="#1F4F59" 
            colors={['#1F4F59']} 
          />
        }
      >
        <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
          {/* MODERN INLINE SUCCESS ALERT BANNER */}
          {successMessage && (
            <View style={styles.screenInlineSuccessContainer}>
              <Ionicons name="checkmark-circle" size={18} color="#16A34A" style={{ marginRight: 8 }} />
              <Text style={styles.screenInlineSuccessText}>{successMessage}</Text>
              <TouchableOpacity onPress={() => setSuccessMessage(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={16} color="#16A34A" />
              </TouchableOpacity>
            </View>
          )}

          {/* HORIZONTAL BUDGET WALLETS CONTAINER */}
{budgetWallets.length > 0 && (
  <View style={{ marginBottom: 16 }}>
    <Text style={{ fontSize: 13, fontWeight: '700', color: '#64748B', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
      Budget Wallets
    </Text>
    <ScrollView 
      horizontal 
      showsHorizontalScrollIndicator={false} 
      contentContainerStyle={{ gap: 10 }}
    >
      {/* Sort wallets so the lowest remaining budget appears first */}
      {[...budgetWallets]
        .sort((a, b) => a.remaining_amount - b.remaining_amount)
        .map((wallet) => {
          const walletColor = wallet.color || '#1F4F59';
          const isNegative = wallet.remaining_amount < 0;
          return (
            <View 
              key={wallet.category_id}
              style={{
                width: 170,
                backgroundColor: '#F8FAFC',
                borderRadius: 14,
                padding: 12,
                borderWidth: 1,
                borderColor: '#F1F5F9',
                justifyContent: 'space-between'
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <View style={{ 
                  width: 28, 
                  height: 28, 
                  borderRadius: 8, 
                  backgroundColor: `${walletColor}15`, 
                  justifyContent: 'center', 
                  alignItems: 'center', 
                  marginRight: 8 
                }}>
                  <Ionicons name={wallet.icon || 'receipt-outline'} size={14} color={walletColor} />
                </View>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#1E293B', flex: 1 }} numberOfLines={1}>
                  {wallet.category_name}
                </Text>
              </View>

              <View>
                <Text style={{ fontSize: 10, color: '#64748B', fontWeight: '500' }}>Remaining</Text>
                <Text 
                  style={{ 
                    fontSize: 14, 
                    fontWeight: '800', 
                    color: isNegative ? '#DC2626' : '#16A34A',
                    marginTop: 1 
                  }}
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
              <Ionicons name="search-outline" size={18} color="#94A3B8" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search transactions or categories..."
                placeholderTextColor="#94A3B8"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>
          </View>
        </View>

        {filteredTransactions.length === 0 ? (
          <View style={styles.emptyTransactions}>
            <View style={styles.emptyIconContainer}>
              <Ionicons name="receipt-outline" size={28} color="#94A3B8" />
            </View>
            <Text style={styles.emptyText}>No Transactions Found</Text>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 20, gap: 8 }}>
            {filteredTransactions.map((expense) => {
              const catColor = expense.categories?.color || '#64748B';
              return (
                <TouchableOpacity
                  key={expense.id}
                  activeOpacity={0.7}
                  onPress={() => handleOpenEditModal(expense)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    backgroundColor: '#F8FAFC',
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: '#F1F5F9',
                  }}
                >
                  <View style={{ 
                    width: 40, 
                    height: 40, 
                    borderRadius: 10, 
                    backgroundColor: `${catColor}15`, 
                    justifyContent: 'center', 
                    alignItems: 'center', 
                    marginRight: 12 
                  }}>
                    <Ionicons name={expense.categories?.icon || 'receipt-outline'} size={18} color={catColor} />
                  </View>
                  
                  <View style={{ flex: 1, justifyContent: 'center' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#1E293B' }} numberOfLines={1}>
                        {expense.description}
                      </Text>
                      {expense.photo_url ? (
                        <TouchableOpacity 
                          onPress={() => setSelectedImageUri(expense.photo_url!)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="image-outline" size={14} color="#1F4F59" />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                    <Text style={{ fontSize: 11, fontWeight: '500', color: '#64748B', marginTop: 2 }}>
                      {formatDate(expense.spent_at)}
                    </Text>
                  </View>

                  <View style={{ alignItems: 'flex-end', flexDirection: 'row', gap: 10 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#DC2626' }}>
                      -₱{(expense.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </Text>
                    <TouchableOpacity 
                      onPress={() => confirmDeleteExpense(expense)}
                      style={styles.deleteIconButton}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Ionicons name="trash-outline" size={16} color="#94A3B8" />
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
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingTransaction ? 'Edit Expense' : 'Add Expense'}
              </Text>
              <TouchableOpacity onPress={handleCloseModal}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            {modalError && (
              <View style={styles.inlineErrorContainer}>
                <Ionicons name="alert-circle-outline" size={18} color="#DC2626" style={{ marginRight: 6 }} />
                <Text style={styles.inlineErrorText}>{modalError}</Text>
              </View>
            )}

            {modalSuccess && (
              <View style={styles.inlineSuccessContainer}>
                <Ionicons name="checkmark-circle-outline" size={18} color="#16A34A" style={{ marginRight: 6 }} />
                <Text style={styles.inlineSuccessText}>{modalSuccess}</Text>
              </View>
            )}

            <View style={styles.calcInputContainer}>
              <TextInput
                style={styles.calcInput}
                placeholder="₱0.00"
                placeholderTextColor="#CBD5E1"
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
                placeholderTextColor="#94A3B8"
                value={descriptionInput}
                onChangeText={setDescriptionInput}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                {categories.map((cat) => {
                  const isSelected = selectedCategory?.id === cat.id;
                  return (
                    <TouchableOpacity
                      key={cat.id}
                      onPress={() => setSelectedCategory(cat)}
                      style={[
                        styles.categoryChip,
                        { backgroundColor: isSelected ? '#1F4F59' : '#F8FAFC', borderColor: isSelected ? '#1F4F59' : '#E2E8F0' }
                      ]}
                    >
                      <Ionicons name={cat.icon || 'receipt-outline'} size={16} color={isSelected ? '#FFFFFF' : cat.color} />
                      <Text style={[styles.categoryChipText, { color: isSelected ? '#FFFFFF' : '#1E293B' }]}>
                        {cat.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            <TouchableOpacity 
              style={[styles.submitButton, isSubmitting && { opacity: 0.7 }]}
              onPress={handleSaveExpense}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.submitButtonText}>
                  {editingTransaction ? 'Update Expense' : 'Save Expense'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODERN DELETE CONFIRMATION MODAL */}
      <Modal
        visible={isDeleteModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsDeleteModalVisible(false)}
      >
        <View style={styles.deleteModalOverlay}>
          <View style={styles.deleteModalCard}>
            <View style={styles.deleteIconBadge}>
              <Ionicons name="trash-outline" size={24} color="#DC2626" />
            </View>

            <Text style={styles.deleteModalTitle}>Delete Transaction</Text>
            <Text style={styles.deleteModalMessage}>
              Are you sure you want to delete <Text style={{ fontWeight: '700', color: '#1E293B' }}>"{transactionToDelete?.description}"</Text>? This action cannot be undone.
            </Text>

            <View style={styles.deleteModalActions}>
              <TouchableOpacity
                style={styles.cancelDeleteButton}
                activeOpacity={0.7}
                onPress={() => setIsDeleteModalVisible(false)}
                disabled={isDeleting}
              >
                <Text style={styles.cancelDeleteButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.confirmDeleteButton, isDeleting && { opacity: 0.7 }]}
                activeOpacity={0.8}
                onPress={handleDeleteExpense}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.confirmDeleteButtonText}>Delete</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
            <Ionicons name="close" size={28} color="#FFFFFF" />
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
          <Ionicons name="arrow-up" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  centeredContent: { justifyContent: 'center', alignItems: 'center' },
  topBackgroundHeader: { backgroundColor: '#1F4F59', borderBottomLeftRadius: 32, borderBottomRightRadius: 32, paddingBottom: 15 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255, 255, 255, 0.15)', justifyContent: 'center', alignItems: 'center' },
  headerContent: { flex: 1, alignItems: 'center', paddingHorizontal: 12 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF', letterSpacing: -0.3 },
  scrollContent: { flex: 1, backgroundColor: '#FFFFFF' },
  searchContainer: { paddingVertical: 4, marginTop: 4 },
  searchWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, paddingHorizontal: 12, height: 42 },
  searchInput: { flex: 1, fontSize: 13, color: '#0F172A', paddingVertical: 0 },
  
  // Modern Screen-Level Inline Success Banner Styles
  screenInlineSuccessContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#86EFAC', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, marginBottom: 12 },
  screenInlineSuccessText: { flex: 1, color: '#16A34A', fontSize: 13, fontWeight: '600' },

  emptyTransactions: { alignItems: 'center', justifyContent: 'center', paddingVertical: 50, paddingHorizontal: 36, gap: 8 },
  emptyIconContainer: { width: 56, height: 56, borderRadius: 14, backgroundColor: '#EFF4F6', justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  emptyText: { fontSize: 15, fontWeight: '700', color: '#2D3748', letterSpacing: -0.3 },
  scrollTopFAB: { position: 'absolute', bottom: 24, right: 24, width: 42, height: 42, borderRadius: 21, backgroundColor: '#1F4F59', justifyContent: 'center', alignItems: 'center', elevation: 5 },
  quickFormTrigger: { width: 38, height: 38, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.12)', justifyContent: 'center', alignItems: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#1E293B' },
  inlineErrorContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FCA5A5', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, marginBottom: 16 },
  inlineErrorText: { flex: 1, color: '#DC2626', fontSize: 12, fontWeight: '600' },
  inlineSuccessContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#86EFAC', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, marginBottom: 16 },
  inlineSuccessText: { flex: 1, color: '#16A34A', fontSize: 12, fontWeight: '600' },
  calcInputContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC', borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', paddingVertical: 12, marginBottom: 20 },
  calcInput: { fontSize: 36, fontWeight: '700', color: '#1E293B', minWidth: 140, textAlign: 'center' },
  inputGroup: { marginBottom: 16 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#64748B', marginBottom: 8 },
  textInputStyle: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, paddingHorizontal: 14, height: 46, fontSize: 14, color: '#1E293B' },
  categoryChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, gap: 6 },
  categoryChipText: { fontSize: 13, fontWeight: '600' },
  submitButton: { backgroundColor: '#1F4F59', borderRadius: 14, height: 50, justifyContent: 'center', alignItems: 'center', marginTop: 10 },
  submitButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  deleteIconButton: { padding: 4, justifyContent: 'center', alignItems: 'center' },
  
  // Modern Delete Modal Styles
  deleteModalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.55)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  deleteModalCard: { width: '100%', maxWidth: 340, backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 10 },
  deleteIconBadge: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#FEF2F2', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  deleteModalTitle: { fontSize: 18, fontWeight: '700', color: '#1E293B', marginBottom: 8, textAlign: 'center' },
  deleteModalMessage: { fontSize: 13, fontWeight: '400', color: '#64748B', textAlign: 'center', lineHeight: 18, marginBottom: 24 },
  deleteModalActions: { flexDirection: 'row', width: '100%', gap: 12 },
  cancelDeleteButton: { flex: 1, height: 46, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center' },
  cancelDeleteButtonText: { fontSize: 14, fontWeight: '600', color: '#475569' },
  confirmDeleteButton: { flex: 1, height: 46, borderRadius: 12, backgroundColor: '#DC2626', justifyContent: 'center', alignItems: 'center' },
  confirmDeleteButtonText: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },

  imageModalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.9)', justifyContent: 'center', alignItems: 'center' },
  fullScreenImage: { width: '90%', height: '80%' },
  closeImageButton: { position: 'absolute', top: 50, right: 20, zIndex: 10, padding: 10 }
});

export default function TransactionsScreenWrapper() {
  return (
    <SafeAreaProvider>
      <TransactionsScreenContent />
    </SafeAreaProvider>
  );
}