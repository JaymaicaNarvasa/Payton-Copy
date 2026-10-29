// app/(personalTabs)/split.tsx
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import emailjs from 'emailjs-com';
import 'expo-blob';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleProp,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import GradientBackground from '../../components/GradientBackground';
import { AlertConfig, PaytonAlertDialog } from '../../components/PaytonAlert';
import { theme } from '../../constants/theme';
import { splitStyles as styles } from '../../constants/ui.styles';

const { colors, space } = theme;
const DEFAULT_AVATAR = require('../../assets/images/default.png');

type Friend = {
  id: string;
  full_name: string;
  email?: string;
  avatar_url?: string;
};

type Category = {
  id: string;
  name: string;
  icon?: string;
};

type ActiveSplitFriend = {
  id: string;
  split_expense_id: string;
  friend_id: string;
  owed_amount: number;
  status: 'unpaid' | 'paid';
  friends?: {
    id: string;
    full_name: string;
    avatar_url?: string;
  };
};

type ActiveSplit = {
  id: string;
  description: string;
  total_amount: number;
  personal_share: number;
  split_type: 'EQUAL' | 'CUSTOM';
  created_at: string;
  split_friends: ActiveSplitFriend[];
};

type Msg = { text: string; type: 'error' | 'success' } | null;

/** Inline success / error banner (was copy-pasted 6 times) */
function Banner({ msg, style }: { msg: Msg; style?: StyleProp<ViewStyle> }) {
  if (!msg) return null;
  const isError = msg.type === 'error';
  return (
    <View style={[styles.inlineMessageContainer, isError ? styles.errorBanner : styles.successBanner, style]}>
      <Ionicons
        name={isError ? 'alert-circle-outline' : 'checkmark-circle-outline'}
        size={18}
        color={isError ? colors.danger : colors.success}
        style={{ marginRight: space[6] }}
      />
      <Text style={[styles.inlineMessageText, isError ? styles.errorText : styles.successText]}>{msg.text}</Text>
    </View>
  );
}

const ALERT_CLOSED: AlertConfig = { visible: false, title: '' };

export default function SplitScreen() {
  const insets = useSafeAreaInsets();

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  // Default Array States
  const [friends, setFriends] = useState<Friend[]>([]);
  const [activeSplits, setActiveSplits] = useState<ActiveSplit[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  // Creation Form States
  const [formVisible, setFormVisible] = useState<boolean>(false);
  const [description, setDescription] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [splitType, setSplitType] = useState<'EQUAL' | 'CUSTOM'>('EQUAL');
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [customShares, setCustomShares] = useState<{ [key: string]: string }>({});
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  // Friend Modal State
  const [addFriendModalVisible, setAddFriendModalVisible] = useState<boolean>(false);
  const [newFriendName, setNewFriendName] = useState<string>('');
  const [newFriendEmail, setNewFriendEmail] = useState<string>('');
  // Settlement Management State
  const [selectedSplitForSettle, setSelectedSplitForSettle] = useState<ActiveSplit | null>(null);
  // Settlement Payment Entry Modal State
  const [settleAmountModalVisible, setSettleAmountModalVisible] = useState<boolean>(false);
  const [selectedFriendToSettle, setSelectedFriendToSettle] = useState<ActiveSplitFriend | null>(null);
  const [paymentInputAmount, setPaymentInputAmount] = useState<string>('');
  const [editingFriend, setEditingFriend] = useState<Friend | null>(null);
  const [friendImageUri, setFriendImageUri] = useState<string | null>(null);
  const [myProfile, setMyProfile] = useState<{ full_name?: string; avatar_url?: string } | null>(null);
  const [selectedFriend, setSelectedFriend] = useState<Friend | null>(null);
  const [manageModalVisible, setManageModalVisible] = useState(false);

  // Inline banners
  const [formMessage, setFormMessage] = useState<Msg>(null);
  const [deleteMessage, setDeleteMessage] = useState<Msg>(null);
  const [splitFormMessage, setSplitFormMessage] = useState<Msg>(null);
  const [splitDeleteMessage, setSplitDeleteMessage] = useState<Msg>(null);
  const [reminderMessage, setReminderMessage] = useState<Msg>(null);
  const [settleModalMessage, setSettleModalMessage] = useState<Msg>(null);
  const [settleActionMessage, setSettleActionMessage] = useState<Msg>(null);

  // Shared dialog (PaytonAlertDialog local-state API): permission errors + delete confirmations
  const [alertCfg, setAlertCfg] = useState<AlertConfig>(ALERT_CLOSED);
  const closeAlert = useCallback(() => setAlertCfg((p) => ({ ...p, visible: false })), []);

  useEffect(() => {
    fetchUserAndData();
  }, []);

  const fetchUserAndData = async () => {
    setLoading(true);
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();
    if (currentUser) {
      setUser(currentUser);
      await fetchData(currentUser.id);
    }
    setLoading(false);
  };

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();
    if (currentUser) {
      setUser(currentUser);
      await fetchData(currentUser.id);
    }
    setRefreshing(false);
  }, []);

  const fetchData = async (userId: string) => {
    // 0. Fetch Categories
    try {
      const { data: catData, error: catErr } = await supabase
        .from('categories')
        .select('id, name, icon')
        .order('name', { ascending: true });

      if (catErr) console.error('Categories fetch error:', catErr.message);
      setCategories(catData || []);
      if (catData && catData.length > 0 && !selectedCategoryId) {
        setSelectedCategoryId(catData[0].id);
      }
    } catch (err) {
      console.error('Categories error:', err);
      setCategories([]);
    }

    // 1. Fetch Friends
    try {
      const { data: friendsData, error: friendsErr } = await supabase
        .from('friends')
        .select('id, full_name, email, avatar_url')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

      if (friendsErr) console.error('Friends fetch error:', friendsErr.message);
      setFriends(friendsData || []);
    } catch (err) {
      console.error('Friends error:', err);
      setFriends([]);
    }

    // 2. Fetch Active Splits
    try {
      const { data: splitsData, error: splitsErr } = await supabase
        .from('split_expenses')
        .select(`
          id,
          user_id,
          description,
          total_amount,
          personal_share,
          created_at,
          split_type,
          category_id,
          categories (
            name,
            icon
          ),
          split_friends (
            id,
            split_expense_id,
            friend_id,
            owed_amount,
            status,
            friends (
              id,
              full_name,
              email,
              avatar_url
            )
          )
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (splitsErr) console.error('Splits fetch error:', splitsErr.message);
      setActiveSplits((splitsData as unknown as ActiveSplit[]) || []);
    } catch (err) {
      console.error('Splits error:', err);
      setActiveSplits([]);
    }

    // 3. Fetch User Profile
    try {
      const { data: profileData, error: profileErr } = await supabase
        .from('profiles')
        .select('full_name, avatar_url')
        .eq('id', userId)
        .single();

      if (profileErr) console.error('Profile fetch error:', profileErr.message);
      setMyProfile(profileData || null);
    } catch (err) {
      console.error('Profile error:', err);
      setMyProfile(null);
    }
  };

  const pickImage = async (useCamera: boolean = false) => {
    const permissionResult = useCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permissionResult.granted) {
      setAlertCfg({
        visible: true,
        type: 'warning',
        title: 'Permission Denied',
        message: 'Kinahanglan ang pahintulot para ma-access ang camera o gallery.',
        buttons: [{ text: 'OK', onPress: closeAlert }],
      });
      return;
    }

    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: false,
    };
    const result = useCamera
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setFriendImageUri(result.assets[0].uri);
    }
  };

  const uploadAvatarToSupabase = async (uri: string): Promise<string | null> => {
    try {
      if (!user) throw new Error('No user logged in');

      const fileName = `${Date.now()}.jpg`;
      const filePath = `${user.id}/${fileName}`;

      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const binaryString = atob(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, bytes, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
      return data.publicUrl;
    } catch (err: any) {
      console.error('Upload error:', err.message);
      return null;
    }
  };

  const closeFriendModal = () => {
    setAddFriendModalVisible(false);
    setEditingFriend(null);
    setNewFriendName('');
    setNewFriendEmail('');
    setFriendImageUri(null);
    setFormMessage(null);
  };

  const handleSaveFriend = async () => {
    if (!newFriendName.trim() || !user) {
      setFormMessage({ text: "Please enter your friend's name.", type: 'error' });
      return;
    }

    try {
      setLoading(true);
      setFormMessage(null);
      let uploadedAvatarUrl = editingFriend?.avatar_url || null;

      if (friendImageUri && !friendImageUri.startsWith('http')) {
        uploadedAvatarUrl = await uploadAvatarToSupabase(friendImageUri);
      }

      const friendDataPayload = {
        user_id: user.id,
        full_name: newFriendName.trim(),
        email: newFriendEmail.trim() ? newFriendEmail.trim().toLowerCase() : null,
        avatar_url: uploadedAvatarUrl,
      };

      const actionType = editingFriend ? 'updated' : 'added';

      if (editingFriend) {
        const { data, error } = await supabase
          .from('friends')
          .update(friendDataPayload)
          .eq('id', editingFriend.id)
          .select()
          .single();

        if (error) throw error;
        if (data) {
          setFriends((prev) => (prev || []).map((f) => (f.id === editingFriend.id ? data : f)));
        }

        await supabase.from('logs').insert({
          user_id: user.id,
          details: `updated friend "${newFriendName.trim()}".`,
        });
      } else {
        const { data, error } = await supabase
          .from('friends')
          .insert([friendDataPayload])
          .select()
          .single();

        if (error) throw error;
        if (data) {
          setFriends((prev) => [...(prev || []), data]);
        }

        await supabase.from('logs').insert({
          user_id: user.id,
          details: `added friend "${newFriendName.trim()}".`,
        });
      }

      setFormMessage({ text: `Friend successfully ${actionType}!`, type: 'success' });

      // let the success banner show, then reset everything
      setTimeout(() => {
        closeFriendModal();
        setLoading(false);
      }, 1200);
    } catch (err: any) {
      setFormMessage({ text: err.message || 'Failed to save friend. Please try again.', type: 'error' });
      setLoading(false);
    }
  };

  const handleDeleteFriend = async (friend: Friend) => {
    try {
      const { error } = await supabase.from('friends').delete().eq('id', friend.id);
      if (error) throw error;

      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      if (currentUser) {
        await supabase.from('logs').insert({
          user_id: currentUser.id,
          details: `deleted friend "${friend.full_name || friend.id}".`,
        });
      }

      setFriends((prev) => prev.filter((f) => f.id !== friend.id));
      setDeleteMessage({ text: 'Friend deleted successfully.', type: 'success' });
      setTimeout(() => setDeleteMessage(null), 3000);
    } catch (err: any) {
      setDeleteMessage({ text: err.message || 'Failed to delete friend.', type: 'error' });
    }
  };

  const confirmDeleteFriend = (friendId: string) => {
    const friend = friends.find((f) => f.id === friendId);
    if (!friend) return;
    setAlertCfg({
      visible: true,
      type: 'warning',
      title: 'Delete Friend?',
      message: `Are you sure you want to delete "${friend.full_name}"? This action cannot be undone.`,
      buttons: [
        { text: 'Cancel', style: 'cancel', onPress: closeAlert },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            closeAlert();
            handleDeleteFriend(friend);
          },
        },
      ],
    });
  };

  const handleFriendPress = (friend: Friend) => {
    setSelectedFriend(friend);
    setManageModalVisible(true);
  };

  const openEditModal = (friend: Friend) => {
    setEditingFriend(friend);
    setNewFriendName(friend.full_name);
    setNewFriendEmail(friend.email || '');
    setFriendImageUri(friend.avatar_url || null);
    setAddFriendModalVisible(true);
  };

  const handleDeleteSplit = async (splitId: string) => {
    try {
      setLoading(true);
      setSplitDeleteMessage(null);

      // fetch the description first so the log is readable
      const { data: splitRow } = await supabase
        .from('split_expenses')
        .select('description, total_amount')
        .eq('id', splitId)
        .maybeSingle();

      const { error } = await supabase.from('split_expenses').delete().eq('id', splitId);
      if (error) throw error;

      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      if (currentUser) {
        await supabase.from('logs').insert({
          user_id: currentUser.id,
          details: `deleted split expense "${splitRow?.description || splitId}".`,
        });
      }

      setActiveSplits((prev) => prev.filter((s) => s.id !== splitId));
      setSplitDeleteMessage({ text: 'Split expense deleted successfully.', type: 'success' });
      setTimeout(() => setSplitDeleteMessage(null), 3000);
    } catch (err: any) {
      setSplitDeleteMessage({ text: err.message || 'Failed to delete split.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const confirmDeleteSplit = (split: ActiveSplit) =>
    setAlertCfg({
      visible: true,
      type: 'warning',
      title: 'Delete Split Expense?',
      message: `Are you sure you want to delete "${split.description}"? This action cannot be undone.`,
      buttons: [
        { text: 'Cancel', style: 'cancel', onPress: closeAlert },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            closeAlert();
            handleDeleteSplit(split.id);
          },
        },
      ],
    });

  const toggleSelectFriend = (friendId: string) => {
    if (selectedFriends.includes(friendId)) {
      setSelectedFriends((prev) => prev.filter((id) => id !== friendId));
      const updatedShares = { ...customShares };
      delete updatedShares[friendId];
      setCustomShares(updatedShares);
    } else {
      setSelectedFriends((prev) => [...prev, friendId]);
    }
  };

  const handleCustomShareChange = (friendId: string, val: string) => {
    setCustomShares((prev) => ({ ...prev, [friendId]: val }));
  };

  const handleCreateSplitDirectly = async () => {
    if (loading) return; // prevent double taps
    setSplitFormMessage(null);

    const numericAmount = parseFloat(amount);
    if (!description.trim() || isNaN(numericAmount) || numericAmount <= 0) {
      setSplitFormMessage({ text: 'Please enter a valid description and amount.', type: 'error' });
      return;
    }

    if ((selectedFriends?.length || 0) === 0) {
      setSplitFormMessage({ text: 'Please select at least one friend to split with.', type: 'error' });
      return;
    }

    let calculatedFriendsPayload: { friend_id: string; owed_amount: number }[] = [];
    let ownerShare = 0;

    if (splitType === 'EQUAL') {
      const totalParticipants = selectedFriends.length + 1;
      const share = parseFloat((numericAmount / totalParticipants).toFixed(2));
      ownerShare = share;
      calculatedFriendsPayload = selectedFriends.map((fId) => ({ friend_id: fId, owed_amount: share }));
    } else {
      let customSum = 0;
      for (const fId of selectedFriends) {
        const val = parseFloat(customShares[fId] || '0');
        if (isNaN(val) || val < 0) {
          setSplitFormMessage({ text: 'Please enter valid custom amounts for selected friends.', type: 'error' });
          return;
        }
        customSum += val;
        calculatedFriendsPayload.push({ friend_id: fId, owed_amount: val });
      }

      if (customSum > numericAmount) {
        setSplitFormMessage({ text: 'The sum of friend shares cannot exceed total amount.', type: 'error' });
        return;
      }
      ownerShare = parseFloat((numericAmount - customSum).toFixed(2));
    }

    setLoading(true);

    try {
      // 1. Most recent active income (with its amount)
      const { data: latestIncome, error: incomeFetchErr } = await supabase
        .from('income')
        .select('id, amount')
        .eq('user_id', user.id)
        .eq('is_archived', false)
        .order('received_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (incomeFetchErr) throw incomeFetchErr;

      if (!latestIncome) {
        setSplitFormMessage({
          text: 'No active income found. Please create an income before splitting expenses.',
          type: 'error',
        });
        setLoading(false);
        return;
      }

      const activeIncomeId = latestIncome.id;

      // 1b. Expenses already linked to this income -> remaining balance
      const { data: incomeExpenses, error: expFetchErr } = await supabase
        .from('expenses')
        .select('amount')
        .eq('income_id', activeIncomeId);

      if (expFetchErr) throw expFetchErr;

      const totalExpenses = (incomeExpenses || []).reduce((sum, exp) => sum + (exp.amount || 0), 0);
      const remainingBalance = latestIncome.amount - totalExpenses;

      if (numericAmount > remainingBalance) {
        setSplitFormMessage({
          text: `Split amount (${numericAmount}) exceeds your remaining income balance (${remainingBalance.toFixed(2)}).`,
          type: 'error',
        });
        setLoading(false);
        return;
      }

      // 2. split_expenses
      const { data: splitExp, error: splitExpErr } = await supabase
        .from('split_expenses')
        .insert([
          {
            user_id: user.id,
            description: description.trim(),
            total_amount: numericAmount,
            personal_share: ownerShare,
            created_at: new Date().toISOString(),
            split_type: splitType,
            category_id: selectedCategoryId,
          },
        ])
        .select()
        .single();

      if (splitExpErr) throw splitExpErr;

      const friendInserts = calculatedFriendsPayload.map((f) => ({
        split_expense_id: splitExp.id,
        friend_id: f.friend_id,
        owed_amount: f.owed_amount,
        status: 'unpaid',
        updated_at: new Date().toISOString(),
      }));

      const { error: friendsErr } = await supabase.from('split_friends').insert(friendInserts);
      if (friendsErr) throw friendsErr;

      // 3. general expenses table
      const { error: expenseErr } = await supabase.from('expenses').insert([
        {
          user_id: user.id,
          amount: numericAmount,
          description: description.trim(),
          category_id: selectedCategoryId,
          income_id: activeIncomeId,
          spent_at: new Date().toISOString(),
        },
      ]);

      if (expenseErr) console.error('Failed to log in expenses table:', expenseErr.message);

      // 4. email notifications
      await sendNewSplitEmails(splitExp, calculatedFriendsPayload, numericAmount, description.trim(), myProfile?.full_name);

      await supabase.from('logs').insert({
        user_id: user.id,
        details: `created split expense "${description.trim()}" (${numericAmount}).`,
      });

      setSplitFormMessage({ text: 'Split expense saved, logged to expenses, and emails sent!', type: 'success' });

      // let the user see the success banner before closing
      setTimeout(() => {
        setFormVisible(false);
        resetForm();
        fetchData(user.id);
        setSplitFormMessage(null);
        setLoading(false);
      }, 1200);
    } catch (err: any) {
      setSplitFormMessage({ text: err.message || 'Failed to process split.', type: 'error' });
      setLoading(false);
    }
  };

  const handleInitiateSettleFriend = (friendShare: ActiveSplitFriend) => {
    setSelectedFriendToSettle(friendShare);
    setPaymentInputAmount(friendShare.owed_amount.toString());
    setSettleAmountModalVisible(true);
  };

  const handleConfirmSettlePayment = async () => {
    if (!user || !selectedFriendToSettle) return;

    setSettleModalMessage(null);

    const paidVal = parseFloat(paymentInputAmount);
    if (isNaN(paidVal) || paidVal <= 0) {
      setSettleModalMessage({ text: 'Please enter a valid amount paid.', type: 'error' });
      return;
    }

    setSettleAmountModalVisible(false);
    setLoading(true);

    try {
      // 1. an active income must exist BEFORE any data changes
      const { data: latestIncome, error: incomeFetchErr } = await supabase
        .from('income')
        .select('id, amount')
        .eq('user_id', user.id)
        .eq('is_archived', false)
        .order('received_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (incomeFetchErr) throw incomeFetchErr;

      if (!latestIncome) {
        throw new Error('No active income found. Please create an active income before settling payments.');
      }

      const friendName = selectedFriendToSettle.friends?.full_name || 'Friend';
      const currentOwed = selectedFriendToSettle.owed_amount || 0;
      const newOwed = Math.max(0, currentOwed - paidVal);
      const isFullyPaid = newOwed === 0;

      // 2. split_friends
      const { error: updateFriendErr } = await supabase
        .from('split_friends')
        .update({
          owed_amount: parseFloat(newOwed.toFixed(2)),
          status: isFullyPaid ? 'paid' : 'unpaid',
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedFriendToSettle.id);

      if (updateFriendErr) throw updateFriendErr;

      // 3. add the received payment to the active income
      const currentIncomeAmount = parseFloat(latestIncome.amount) || 0;
      const updatedIncomeAmount = currentIncomeAmount + paidVal;

      const { error: incomeUpdateErr } = await supabase
        .from('income')
        .update({ amount: updatedIncomeAmount })
        .eq('id', latestIncome.id);

      if (incomeUpdateErr) {
        console.error('Failed to update income amount:', incomeUpdateErr.message);
        throw incomeUpdateErr;
      }

      // 4. log
      await supabase.from('logs').insert({
        user_id: user.id,
        details: `settled split payment of ₱${paidVal.toFixed(2)} from "${friendName}".`,
      });

      const successMessage = `Successfully received ₱${paidVal.toFixed(2)} from ${friendName} (added to your active income). ${
        isFullyPaid ? 'Fully settled!' : `Remaining balance: ₱${newOwed.toFixed(2)}`
      }`;

      setSettleActionMessage({ text: successMessage, type: 'success' });
      setTimeout(() => setSettleActionMessage(null), 4000);

      if (selectedSplitForSettle) {
        setSelectedSplitForSettle((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            split_friends: prev.split_friends.map((sf) =>
              sf.id === selectedFriendToSettle.id
                ? { ...sf, owed_amount: parseFloat(newOwed.toFixed(2)), status: isFullyPaid ? 'paid' : 'unpaid' }
                : sf
            ),
          };
        });
      }

      fetchData(user.id);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to record payment.';
      setSettleActionMessage({ text: errorMessage, type: 'error' });
      setTimeout(() => setSettleActionMessage(null), 4000);
    } finally {
      setLoading(false);
      setSelectedFriendToSettle(null);
      setPaymentInputAmount('');
    }
  };

  const resetForm = () => {
    setDescription('');
    setAmount('');
    setSplitType('EQUAL');
    setSelectedFriends([]);
    setCustomShares({});
    if (categories.length > 0) setSelectedCategoryId(categories[0].id);
  };

  const closeCreateForm = () => {
    setFormVisible(false);
    setDescription('');
    setAmount('');
    setSelectedFriends([]);
    setCustomShares({});
    setSplitFormMessage(null);
  };

  const calculateOwnerShare = () => {
    const total = parseFloat(amount) || 0;
    const friendCount = selectedFriends?.length || 0;
    if (splitType === 'EQUAL') {
      return (total / (friendCount + 1)).toFixed(2);
    }
    let customSum = 0;
    (selectedFriends || []).forEach((id) => {
      customSum += parseFloat(customShares[id] || '0');
    });
    return Math.max(0, total - customSum).toFixed(2);
  };

  const handleSendReminderEmail = async (
    friendEmail: any,
    friendName: any,
    owedAmount: any,
    totalAmount: any,
    desc: any,
    senderName: any
  ) => {
    try {
      setReminderMessage(null);

      const templateParams = {
        email: friendEmail,
        email_subject: `Reminder: Balance for ${desc}`,
        friend_name: friendName,
        intro_message: 'This is a friendly reminder that you still have a remaining balance for this expense.',
        description: desc,
        total_amount: (totalAmount || 0).toFixed(2),
        amount: (owedAmount || 0).toFixed(2),
        call_to_action: 'Please settle this at your earliest convenience. Thank you!',
        sender_name: senderName,
      };

      const serviceID = 'service_67drjkh';
      const templateID = 'template_amd0qms';
      const userID = 'W4iiQMEllSfk5dSfk';

      const response = await emailjs.send(serviceID, templateID, templateParams, userID);
      console.log('SUCCESS!', response.status, response.text);

      setReminderMessage({ text: 'Email reminder sent successfully!', type: 'success' });
      setTimeout(() => setReminderMessage(null), 3000);
    } catch (err: any) {
      console.error('FAILED...', err);
      setReminderMessage({ text: err.text || err.message || 'Failed to send email reminder.', type: 'error' });
    }
  };

  const sendNewSplitEmails = async (createdSplitData: any, friendsPayload: any, totalAmount: any, desc: any, senderName: any) => {
    try {
      const serviceID = 'service_67drjkh';
      const templateID = 'template_amd0qms';
      const userID = 'W4iiQMEllSfk5dSfk';

      for (const item of friendsPayload) {
        const friendObj = (friends || []).find((f) => f.id === item.friend_id);
        if (!friendObj || !friendObj.email) continue;

        const templateParams = {
          email: friendObj.email,
          email_subject: `New Split Expense Added: ${desc}`,
          friend_name: friendObj.full_name,
          intro_message: 'You have been added to a new split expense.',
          description: desc,
          total_amount: parseFloat(totalAmount).toFixed(2),
          amount: parseFloat(item.owed_amount || 0).toFixed(2),
          call_to_action: 'Please settle your balance accordingly. Thank you!',
          sender_name: senderName,
        };

        await emailjs.send(serviceID, templateID, templateParams, userID);
      }

      console.log('All split expense emails sent successfully!');
    } catch (err) {
      console.error('FAILED sending split emails...', err);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* HEADER (gradient) */}
      <View style={[styles.modernHeader, { paddingTop: insets.top + space[12] }]}>
        <View style={styles.headerGradientFill} pointerEvents="none">
          <GradientBackground />
        </View>
        <View style={styles.headerLeft}>
          <Ionicons name="people-circle-outline" size={28} color={colors.white} />
          <Text style={styles.modernHeaderTitle}>Split Expenses</Text>
        </View>
        <TouchableOpacity style={styles.quickFormTrigger} onPress={() => setFormVisible(true)}>
          <Ionicons name="add" size={18} color={colors.white} />
          <Text style={styles.quickFormTriggerText}>New Split</Text>
        </TouchableOpacity>
      </View>

      {/* CONTENT SHEET */}
      <View style={styles.sheet}>
        {loading && !refreshing ? (
          <View style={styles.emptyContainer}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={[colors.accent]}
                tintColor={colors.accent}
              />
            }
          >
            {/* FRIENDS SECTION */}
            <View style={styles.friendsSection}>
              <Banner msg={deleteMessage} style={{ marginBottom: space[12] }} />
              <Banner msg={splitDeleteMessage} style={{ marginBottom: space[12] }} />
              <Banner msg={reminderMessage} style={{ marginBottom: space[12] }} />
              <Banner msg={settleActionMessage} style={{ marginBottom: space[12] }} />

              <View style={styles.sectionTitleRow}>
                <Text style={styles.sectionTitle}>Friends List</Text>
                <Text style={styles.sectionCount}>{friends?.length || 0} friends</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalFriendsScroll}>
                <TouchableOpacity style={styles.avatarContainer} onPress={() => setAddFriendModalVisible(true)}>
                  <View style={styles.addCircle}>
                    <Ionicons name="add" size={24} color={colors.textSubtle} />
                  </View>
                  <Text style={styles.avatarName}>Add Friend</Text>
                </TouchableOpacity>

                {[...(friends || [])].reverse().map((f) => (
                  <TouchableOpacity key={f.id} style={styles.avatarContainer} onPress={() => handleFriendPress(f)}>
                    <Image
                      source={f.avatar_url ? { uri: f.avatar_url } : DEFAULT_AVATAR}
                      style={styles.friendAvatar}
                    />
                    <Text style={styles.avatarName} numberOfLines={1}>
                      {f.full_name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitle}>Split History</Text>
              <Text style={styles.sectionCount}>{activeSplits?.length || 0} splits</Text>
            </View>

            {(activeSplits?.length || 0) === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="receipt-outline" size={48} color={colors.borderStrong} />
                <Text style={styles.emptyText}>No splits recorded yet.</Text>
              </View>
            ) : (
              (activeSplits || []).map((item: any) => {
                const sfList = item.split_friends || [];
                const totalAmount = item.total_amount || 0;
                const personalShare = item.personal_share || 0;
                const categoryIcon = item.categories?.icon || 'people-outline';

                return (
                  <View key={item.id} style={styles.historyCard}>
                    {/* TOP ROW: description, date, total, delete */}
                    <View style={styles.historyTop}>
                      <View style={styles.categoryIconContainer}>
                        <Ionicons name={categoryIcon} size={22} color={colors.accent} />
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text style={styles.historyDesc}>{item.description}</Text>
                        <Text style={styles.historyMeta}>
                          {item.created_at
                            ? new Date(item.created_at).toLocaleDateString('en-US', {
                                month: 'long',
                                day: 'numeric',
                                year: 'numeric',
                              })
                            : ''}
                        </Text>
                      </View>

                      <View style={{ alignItems: 'flex-end', justifyContent: 'center', marginRight: space[10] }}>
                        <Text style={{ fontSize: theme.fontSize.tiny, color: colors.textMuted }}>Total Amount</Text>
                        <Text style={styles.settleCardTotalValue}>₱{totalAmount.toFixed(2)}</Text>
                      </View>

                      <View style={styles.rightActionsContainer}>
                        <View style={styles.iconButtonsRow}>
                          <TouchableOpacity style={styles.actionIconButton} onPress={() => confirmDeleteSplit(item)}>
                            <Ionicons name="trash-outline" size={18} color={colors.dangerBright} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>

                    <View style={{ height: 1, backgroundColor: colors.borderLight, marginTop: space[10], marginBottom: 7 }} />

                    {/* DETAILS */}
                    <View style={{ marginTop: 1 }}>
                      {/* Owner row (me) */}
                      <View style={styles.settleMemberRowCard}>
                        <View style={styles.settleLeftCol}>
                          <Image
                            source={myProfile?.avatar_url ? { uri: myProfile.avatar_url } : DEFAULT_AVATAR}
                            style={styles.settleAvatarImage}
                          />
                          <View style={{ flexShrink: 1 }}>
                            <Text style={styles.settleMemberName}>Me</Text>
                            <Text style={styles.settleMemberSub}>My Share</Text>
                          </View>
                        </View>

                        <View style={styles.settleCenterCol}>
                          <Text style={styles.settleAmountText}>₱{personalShare.toFixed(2)}</Text>
                        </View>

                        <View style={styles.settleRightCol}>
                          <View style={styles.settleOwnerBadge}>
                            <Text style={styles.settleOwnerBadgeText}>Payer</Text>
                          </View>
                        </View>

                        <View style={styles.settleSuperRightCol} />
                      </View>

                      {/* Friend rows */}
                      {sfList.map((sf: any) => {
                        const isPaid = sf.status === 'paid' && sf.owed_amount <= 0;
                        const friendName = sf.friends?.full_name || 'Friend';
                        const avatarUrl = sf.friends?.avatar_url;

                        return (
                          <View key={sf.id} style={styles.settleMemberRowCard}>
                            <View style={styles.settleLeftCol}>
                              <Image source={avatarUrl ? { uri: avatarUrl } : DEFAULT_AVATAR} style={styles.settleAvatarImage} />
                              <View style={{ flexShrink: 1 }}>
                                <Text style={styles.settleMemberName} numberOfLines={1}>
                                  {friendName}
                                </Text>
                                <Text style={styles.settleMemberSub}>{isPaid ? 'Settled' : 'Owes you'}</Text>
                              </View>
                            </View>

                            <View style={styles.settleCenterCol}>
                              <Text style={styles.settleAmountText}>₱{(sf.owed_amount || 0).toFixed(2)}</Text>
                            </View>

                            <View style={styles.settleRightCol}>
                              {isPaid ? (
                                <View style={styles.settlePaidPill}>
                                  <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                                  <Text style={styles.settlePaidPillText}>Paid</Text>
                                </View>
                              ) : (
                                <TouchableOpacity style={styles.settlePayButton} onPress={() => handleInitiateSettleFriend(sf)}>
                                  <Text style={styles.settlePayButtonText}>Settle</Text>
                                </TouchableOpacity>
                              )}
                            </View>

                            <View style={styles.settleSuperRightCol}>
                              {!isPaid && sf.friends?.email ? (
                                <TouchableOpacity
                                  onPress={() =>
                                    handleSendReminderEmail(
                                      sf.friends?.email,
                                      sf.friends?.full_name,
                                      sf.owed_amount,
                                      item?.total_amount,
                                      item?.description,
                                      myProfile?.full_name
                                    )
                                  }
                                >
                                  <Ionicons name="notifications-outline" size={20} color={colors.textMuted} />
                                </TouchableOpacity>
                              ) : null}
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
        )}
      </View>

      {/* CREATE SPLIT MODAL */}
      <Modal visible={formVisible} animationType="fade" transparent onRequestClose={closeCreateForm}>
        <View style={styles.modalOverlay}>
          <View style={styles.formDrawerContainer}>
            <View style={styles.pullBar} />
            <View style={styles.modalHeader}>
              <Text style={styles.drawerTitle}>Create Split Expense</Text>
              <TouchableOpacity style={styles.closeCircle} onPress={closeCreateForm}>
                <Ionicons name="close" size={23} color={colors.brandDark} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space[24] }}>
              <Banner msg={splitFormMessage} style={{ marginBottom: space[16] }} />

              {/* 1. Total amount */}
              <Text style={styles.label}>Total Amount (₱)</Text>
              <TextInput
                style={styles.largeAmountInput}
                placeholder="0.00"
                placeholderTextColor={colors.textSubtle}
                keyboardType="numeric"
                value={amount}
                onChangeText={setAmount}
              />

              {/* 2. Description */}
              <Text style={styles.label}>Description</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Dinner with Friends"
                placeholderTextColor={colors.textSubtle}
                value={description}
                onChangeText={setDescription}
              />

              {/* 3. Category */}
              <Text style={styles.label}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[8], marginBottom: space[16] }}>
                {(categories || []).map((cat) => {
                  const isSelected = selectedCategoryId === cat.id;
                  return (
                    <TouchableOpacity
                      key={cat.id}
                      style={[
                        styles.checkChip,
                        isSelected && styles.checkChipSelected,
                        { paddingHorizontal: space[16], paddingVertical: space[8], flexDirection: 'row', alignItems: 'center', gap: space[6] },
                      ]}
                      onPress={() => setSelectedCategoryId(cat.id)}
                    >
                      <Text style={[styles.checkChipText, isSelected && styles.checkChipTextSelected]}>{cat.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <Text style={styles.label}>Split Method</Text>
              <View style={styles.tabContainer}>
                <TouchableOpacity
                  style={[styles.tabBtn, splitType === 'EQUAL' && styles.tabBtnActive]}
                  onPress={() => setSplitType('EQUAL')}
                >
                  <Text style={[styles.tabBtnText, splitType === 'EQUAL' && styles.tabBtnTextActive]}>Equal</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tabBtn, splitType === 'CUSTOM' && styles.tabBtnActive]}
                  onPress={() => setSplitType('CUSTOM')}
                >
                  <Text style={[styles.tabBtnText, splitType === 'CUSTOM' && styles.tabBtnTextActive]}>Custom</Text>
                </TouchableOpacity>
              </View>

              {/* 4. Friends checklist */}
              <Text style={styles.label}>Select Friends Included</Text>
              {(friends?.length || 0) === 0 ? (
                <Text style={styles.emptyInlineText}>No friends added yet. Please add a friend first.</Text>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalChecklist}>
                  {(friends || []).map((f) => {
                    const isSelected = selectedFriends.includes(f.id);
                    return (
                      <TouchableOpacity
                        key={f.id}
                        style={[styles.checkChip, isSelected && styles.checkChipSelected]}
                        onPress={() => toggleSelectFriend(f.id)}
                      >
                        <Ionicons
                          name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                          size={16}
                          color={isSelected ? colors.accent : colors.textMuted}
                        />
                        <Text style={[styles.checkChipText, isSelected && styles.checkChipTextSelected]}>{f.full_name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}

              {splitType === 'CUSTOM' && (selectedFriends?.length || 0) > 0 && (
                <View style={styles.customSection}>
                  <Text style={styles.customSectionTitle}>Enter Friend Shares (₱)</Text>
                  {selectedFriends.map((fId) => {
                    const friendObj = (friends || []).find((f) => f.id === fId);
                    return (
                      <View key={fId} style={styles.customRow}>
                        <Text style={styles.customMemberName}>{friendObj?.full_name || 'Friend'}</Text>
                        <TextInput
                          style={styles.customInput}
                          placeholder="0.00"
                          placeholderTextColor={colors.textSubtle}
                          keyboardType="numeric"
                          value={customShares[fId] || ''}
                          onChangeText={(val) => handleCustomShareChange(fId, val)}
                        />
                      </View>
                    );
                  })}
                </View>
              )}

              {amount !== '' && (selectedFriends?.length || 0) > 0 && (
                <View style={styles.previewBanner}>
                  <Ionicons name="information-circle-outline" size={20} color={colors.success} />
                  <Text style={styles.previewText}>
                    Your Personal Share: <Text style={{ fontFamily: theme.fontFamily.extrabold }}>₱{calculateOwnerShare()}</Text>
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={[styles.submitBtn, loading && { opacity: 0.7 }]}
                onPress={handleCreateSplitDirectly}
                disabled={loading}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[8] }}>
                  {loading ? (
                    <>
                      <ActivityIndicator size="small" color={colors.white} />
                      <Text style={styles.submitBtnText}>Saving...</Text>
                    </>
                  ) : (
                    <>
                      <Text style={styles.submitBtnText}>Confirm & Save Split</Text>
                      <Ionicons name="arrow-forward" size={18} color={colors.white} />
                    </>
                  )}
                </View>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ADD / EDIT FRIEND MODAL */}
      <Modal visible={addFriendModalVisible} animationType="fade" transparent onRequestClose={closeFriendModal}>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.alertModalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingFriend ? 'Edit Friend' : 'Add New Friend'}</Text>
              <TouchableOpacity style={styles.closeCircle} onPress={closeFriendModal}>
                <Ionicons name="close" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <Banner msg={formMessage} />

            <TextInput
              style={[styles.input, { marginTop: space[12] }]}
              placeholder="Friend's Full Name"
              placeholderTextColor={colors.textSubtle}
              value={newFriendName}
              onChangeText={setNewFriendName}
            />

            <TextInput
              style={[styles.input, { marginTop: space[12] }]}
              placeholder="Friend's Email"
              placeholderTextColor={colors.textSubtle}
              value={newFriendEmail}
              onChangeText={setNewFriendEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />

            <View style={{ alignItems: 'center', marginVertical: space[10] }}>
              <Image
                source={friendImageUri ? { uri: friendImageUri } : DEFAULT_AVATAR}
                style={{ width: 80, height: 80, borderRadius: 40, marginBottom: space[10] }}
              />
              <View style={{ flexDirection: 'row', gap: space[10] }}>
                <TouchableOpacity
                  onPress={() => pickImage(false)}
                  style={{ paddingVertical: space[8], paddingHorizontal: space[12], backgroundColor: colors.surfaceAlt, borderRadius: theme.radius.sm }}
                >
                  <Text style={{ fontFamily: theme.fontFamily.semibold, color: colors.textSecondary }}>Pick from Gallery</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => pickImage(true)}
                  style={{ paddingVertical: space[8], paddingHorizontal: space[12], backgroundColor: colors.surfaceAlt, borderRadius: theme.radius.sm }}
                >
                  <Text style={{ fontFamily: theme.fontFamily.semibold, color: colors.textSecondary }}>Take Photo</Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity style={[styles.submitBtn, loading && { opacity: 0.7 }]} onPress={handleSaveFriend} disabled={loading}>
              <Text style={styles.submitBtnText}>{loading ? 'Saving...' : editingFriend ? 'Update Friend' : 'Save Friend'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MANAGE FRIEND ACTION MODAL */}
      <Modal
        visible={manageModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => {
          setManageModalVisible(false);
          setSelectedFriend(null);
        }}
      >
        <View style={styles.modalOverlayCenter}>
          <View style={styles.alertModalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Manage Friend</Text>
              <TouchableOpacity
                style={styles.closeCircle}
                onPress={() => {
                  setManageModalVisible(false);
                  setSelectedFriend(null);
                }}
              >
                <Ionicons name="close" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {selectedFriend && (
              <View style={styles.manageContentContainer}>
                <View style={styles.manageProfileRow}>
                  <Image
                    source={selectedFriend.avatar_url ? { uri: selectedFriend.avatar_url } : DEFAULT_AVATAR}
                    style={{ width: 50, height: 50, borderRadius: 25, marginRight: space[12] }}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.manageFriendName}>{selectedFriend.full_name}</Text>
                    <Text style={styles.manageFriendEmail} numberOfLines={1}>
                      {selectedFriend.email || 'No email provided'}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.actionOptionBtn}
                  onPress={() => {
                    const friendToEdit = selectedFriend;
                    setManageModalVisible(false);
                    setSelectedFriend(null);
                    openEditModal(friendToEdit);
                  }}
                >
                  <Ionicons name="pencil-outline" size={20} color={colors.textStrong} style={{ marginRight: space[10] }} />
                  <Text style={styles.actionOptionText}>Edit Friend Details</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionOptionBtn, styles.deleteOptionBtn]}
                  onPress={() => {
                    const friendId = selectedFriend.id;
                    setManageModalVisible(false);
                    setSelectedFriend(null);
                    confirmDeleteFriend(friendId);
                  }}
                >
                  <Ionicons name="trash-outline" size={20} color={colors.dangerDark} style={{ marginRight: space[10] }} />
                  <Text style={[styles.actionOptionText, styles.deleteOptionText]}>Delete Friend</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* RECORD PAYMENT MODAL */}
      <Modal
        visible={settleAmountModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => {
          setSettleAmountModalVisible(false);
          setSettleModalMessage(null);
        }}
      >
        <View style={styles.modalOverlayCenter}>
          <View style={styles.paymentModalContainer}>
            <View style={styles.paymentModalHeader}>
              <View style={styles.paymentModalTitleRow}>
                <View style={styles.paymentIconContainer}>
                  <Ionicons name="cash-outline" size={20} color={colors.accent} />
                </View>
                <Text style={styles.paymentModalMainTitle}>Record Payment</Text>
              </View>
              <TouchableOpacity
                style={styles.closeCircle}
                onPress={() => {
                  setSettleAmountModalVisible(false);
                  setSettleModalMessage(null);
                }}
              >
                <Ionicons name="close" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <Banner msg={settleModalMessage} style={{ marginBottom: space[12] }} />

            <View style={styles.paymentInfoCard}>
              <Text style={styles.paymentCardLabel}>From Friend</Text>
              <Text style={styles.paymentFriendName}>{selectedFriendToSettle?.friends?.full_name || 'Friend'}</Text>

              <View style={styles.paymentCardDivider} />

              <View style={styles.paymentBalanceRow}>
                <Text style={styles.paymentCardLabel}>Current Balance Owed:</Text>
                <Text style={styles.paymentOwedAmount}>₱{(selectedFriendToSettle?.owed_amount || 0).toFixed(2)}</Text>
              </View>
            </View>

            <Text style={[styles.label, { marginBottom: space[6] }]}>Amount Received (₱)</Text>
            <TextInput
              style={styles.paymentInput}
              placeholder="0.00"
              placeholderTextColor={colors.textSubtle}
              keyboardType="numeric"
              value={paymentInputAmount}
              onChangeText={(text) => {
                setPaymentInputAmount(text);
                if (settleModalMessage) setSettleModalMessage(null);
              }}
              autoFocus
            />

            <TouchableOpacity style={styles.paymentSubmitBtn} onPress={handleConfirmSettlePayment}>
              <Ionicons name="checkmark-circle-outline" size={18} color={colors.white} />
              <Text style={styles.paymentSubmitBtnText}>Confirm Settlement</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* shared dialog: delete confirmations + permission errors */}
      <PaytonAlertDialog {...alertCfg} onDismiss={closeAlert} />
    </View>
  );
}