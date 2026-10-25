import { theme } from '@/constants/theme';
import { transactionStyles as styles } from '@/constants/ui.styles';
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
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';

const COLORS = {
  white: theme.colors.white,
};

interface Transaction {
  id: string;
  amount: number;
  description: string;
  spent_at: string;
  photo_url?: string | null;
  allowance_id?: string | null;
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

function TransactionsScreenContent() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef<ScrollView>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
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
  const [allowanceIdInput, setAllowanceIdInput] = useState<string | null>(null);

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
    setAllowanceIdInput(null);
    setModalError(null);
    setModalSuccess(null);
    setIsAddModalVisible(false);
  };

  const handleOpenEditModal = (expense: Transaction) => {
    setEditingTransaction(expense);
    setAmountInput(expense.amount.toString());
    setDescriptionInput(expense.description);
    setAllowanceIdInput(expense.allowance_id || null);
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
          allowance_id,
          categories (
            name,
            icon,
            color
          ),
          allowances!inner (
            is_archived
          )
        `)
        .eq('allowances.is_archived', false)
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
          allowance_id: expense.allowance_id || null,
          categories: {
            name: rawCategory?.name || 'Uncategorized',
            icon: rawCategory?.icon || 'receipt-outline',
            color: rawCategory?.color || theme.colors.textMuted
          }
        };
      });

      setTransactions(formattedData as Transaction[]);
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

      let targetAllowanceId = allowanceIdInput;
      let activeAllowances: any[] = [];
      
      if (targetAllowanceId) {
        const { data: specificAllowance } = await supabase
          .from('allowances')
          .select('*')
          .eq('id', targetAllowanceId)
          .single();
        if (specificAllowance) activeAllowances = [specificAllowance];
      }

      if (activeAllowances.length === 0) {
        const { data: allAllowances, error: allowanceErr } = await supabase
          .from('allowances')
          .select('*')
          .eq('spender_id', user.id)
          .eq('is_archived', false)
          .order('received_at', { ascending: false }); // Sort to get the latest allowance first

        if (allowanceErr) throw allowanceErr;
        activeAllowances = allAllowances || [];
      }

      if (activeAllowances.length === 0) {
        setModalError('Cannot save expense: No active allowances found.');
        setIsSubmitting(false);
        return;
      }

      // Calculate total available amount across all valid allowances
      const totalAllowanceBudget = activeAllowances.reduce((sum, item) => sum + Number(item.amount), 0);

      // Get all expenses linked to these allowances
      const allowanceIds = activeAllowances.map(a => a.id);
      const { data: allExpenses, error: expErr } = await supabase
        .from('expenses')
        .select('id, amount')
        .in('allowance_id', allowanceIds);

      if (expErr) throw expErr;

      // Filter out current editing transaction if updating
      const filteredExpenses = (allExpenses || []).filter(item => {
        if (editingTransaction && item.id === editingTransaction.id) {
          return false;
        }
        return true;
      });

      const totalSpent = filteredExpenses.reduce((sum, item) => sum + Number(item.amount), 0);
      const remainingBalance = totalAllowanceBudget - totalSpent;

      if (numericAmount > remainingBalance) {
        setModalError(`Expense exceeds total remaining allowance balance (₱${remainingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}).`);
        setIsSubmitting(false);
        return;
      }

      // Default target allowance ID for new inserts (grabs the latest one since it's sorted)
      if (!targetAllowanceId && activeAllowances.length > 0) {
        targetAllowanceId = activeAllowances[0].id;
      }

      if (editingTransaction) {
        const { error } = await supabase
          .from('expenses')
          .update({
            amount: numericAmount,
            description: descriptionInput.trim(),
            category_id: selectedCategory.id,
            allowance_id: targetAllowanceId || null,
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
          allowance_id: targetAllowanceId || null,
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
      
      // Trigger Modern Inline Success Alert on screen
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
            <Ionicons name="chevron-back" size={24} color={theme.colors.white} />
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
        contentContainerStyle={{ paddingBottom: 80, paddingTop: theme.space[16] }}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh} 
            tintColor={theme.colors.brand} 
            colors={[theme.colors.brand]} 
          />
        }
      >
        <View style={{ paddingHorizontal: theme.space[20], marginBottom: theme.space[12] }}>
          {/* MODERN INLINE SUCCESS ALERT BANNER */}
          {successMessage && (
            <View style={styles.screenInlineSuccessContainer}>
              <Ionicons name="checkmark-circle" size={18} color={theme.colors.green} style={{ marginRight: theme.space[8] }} />
              <Text style={styles.screenInlineSuccessText}>{successMessage}</Text>
              <TouchableOpacity onPress={() => setSuccessMessage(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={16} color={theme.colors.green} />
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.searchContainer}>
            <View style={styles.searchWrapper}>
              <Ionicons name="search-outline" size={18} color={theme.colors.textSubtle} style={{ marginRight: theme.space[8] }} />
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
          <View style={{ paddingHorizontal: theme.space[20], gap: theme.space[8] }}>
            {filteredTransactions.map((expense) => {
              const catColor = expense.categories?.color || theme.colors.textMuted;
              return (
                <TouchableOpacity
                  key={expense.id}
                  activeOpacity={0.7}
                  onPress={() => handleOpenEditModal(expense)}
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
                  <View style={{ 
                    width: 40, 
                    height: 40, 
                    borderRadius: theme.radius.tight, 
                    backgroundColor: `${catColor}15`, 
                    justifyContent: 'center', 
                    alignItems: 'center', 
                    marginRight: theme.space[12] 
                  }}>
                    <Ionicons name={expense.categories?.icon || 'receipt-outline'} size={18} color={catColor} />
                  </View>
                  
                  <View style={{ flex: 1, justifyContent: 'center' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[6] }}>
                      <Text style={{ fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.bold, color: theme.colors.text }} numberOfLines={1}>
                        {expense.description}
                      </Text>
                      {expense.photo_url ? (
                        <TouchableOpacity 
                          onPress={() => setSelectedImageUri(expense.photo_url!)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="image-outline" size={14} color={theme.colors.brand} />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                    <Text style={{ fontSize: theme.fontSize.tiny, fontWeight: theme.fontWeight.medium, color: theme.colors.textMuted, marginTop: theme.space[2] }}>
                      {formatDate(expense.spent_at)}
                    </Text>
                  </View>

                  <View style={{ alignItems: 'flex-end', flexDirection: 'row', gap: theme.space[10] }}>
                    <Text style={{ fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.bold, color: theme.colors.danger }}>
                      -₱{(expense.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </Text>
                    <TouchableOpacity 
                      onPress={() => confirmDeleteExpense(expense)}
                      style={styles.deleteIconButton}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
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
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingTransaction ? 'Edit Expense' : 'Add Expense'}
              </Text>
              <TouchableOpacity onPress={handleCloseModal}>
                <Ionicons name="close" size={24} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </View>

            {modalError && (
              <View style={styles.inlineErrorContainer}>
                <Ionicons name="alert-circle-outline" size={18} color={theme.colors.danger} style={{ marginRight: theme.space[6] }} />
                <Text style={styles.inlineErrorText}>{modalError}</Text>
              </View>
            )}

            {modalSuccess && (
              <View style={styles.inlineSuccessContainer}>
                <Ionicons name="checkmark-circle-outline" size={18} color={theme.colors.green} style={{ marginRight: theme.space[6] }} />
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
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.space[8], paddingVertical: theme.space[4] }}>
                {categories.map((cat) => {
                  const isSelected = selectedCategory?.id === cat.id;
                  return (
                    <TouchableOpacity
                      key={cat.id}
                      onPress={() => setSelectedCategory(cat)}
                      style={[
                        styles.categoryChip,
                        { backgroundColor: isSelected ? theme.colors.brand : theme.colors.background, borderColor: isSelected ? theme.colors.brand : theme.colors.border }
                      ]}
                    >
                      <Ionicons name={cat.icon || 'receipt-outline'} size={16} color={isSelected ? theme.colors.white : cat.color} />
                      <Text style={[styles.categoryChipText, { color: isSelected ? theme.colors.white : theme.colors.text }]}>
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
                <ActivityIndicator color={theme.colors.white} />
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
              <Ionicons name="trash-outline" size={24} color={theme.colors.danger} />
            </View>

            <Text style={styles.deleteModalTitle}>Delete Transaction</Text>
            <Text style={styles.deleteModalMessage}>
              Are you sure you want to delete <Text style={{ fontWeight: theme.fontWeight.bold, color: theme.colors.text }}>"{transactionToDelete?.description}"</Text>? This action cannot be undone.
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
                  <ActivityIndicator color={theme.colors.white} size="small" />
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