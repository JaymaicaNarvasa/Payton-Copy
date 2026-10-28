import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import emailjs from 'emailjs-com';
import 'expo-blob';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { colors, styles } from '../../constants/split.style';

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

export default function SplitScreen() {
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
  // Settlement Management Modal State
  const [settleModalVisible, setSettleModalVisible] = useState<boolean>(false);
  const [selectedSplitForSettle, setSelectedSplitForSettle] = useState<ActiveSplit | null>(null);
  // Settlement Payment Entry Modal State
  const [settleAmountModalVisible, setSettleAmountModalVisible] = useState<boolean>(false);
  const [selectedFriendToSettle, setSelectedFriendToSettle] = useState<ActiveSplitFriend | null>(null);
  const [paymentInputAmount, setPaymentInputAmount] = useState<string>('');
  const [editingFriend, setEditingFriend] = useState<Friend | null>(null);
  const [friendImageUri, setFriendImageUri] = useState<string | null>(null);
  const [myProfile, setMyProfile] = useState<{ full_name?: string; avatar_url?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [formMessage, setFormMessage] = useState<{ text: string; type: 'error' | 'success' } | null>(null);
  const [selectedFriend, setSelectedFriend] = useState<Friend | null>(null);
  const [manageModalVisible, setManageModalVisible] = useState(false);
  // Add this near your other state declarations
  const [friendToDelete, setFriendToDelete] = useState<any | null>(null);
  const [deleteMessage, setDeleteMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [splitFormMessage, setSplitFormMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [splitToDelete, setSplitToDelete] = useState<any | null>(null);
  const [splitDeleteMessage, setSplitDeleteMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [reminderMessage, setReminderMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  // Add this state with your other messages:
  const [settleModalMessage, setSettleModalMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [settleActionMessage, setSettleActionMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showAlert = (title: string, message: string) => {
    Alert.alert(title, message, [{ text: 'OK' }]);
  };

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
    // 0. Fetch Categories[cite: 1]
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
    let permissionResult;
    
    if (useCamera) {
      permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    } else {
      permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    }

    if (!permissionResult.granted) {
      showAlert('Permission Denied', 'Kinahanglan ang pahintulot para ma-access ang camera o gallery.');
      return;
    }

    let result = useCamera
      ? await ImagePicker.launchCameraAsync({ 
          mediaTypes: ['images'], 
          allowsEditing: true, 
          aspect: [1, 1], 
          quality: 0.5,
          base64: false,
        })
      : await ImagePicker.launchImageLibraryAsync({ 
          mediaTypes: ['images'], 
          allowsEditing: true, 
          aspect: [1, 1], 
          quality: 0.5,
          base64: false,
        });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const uri = result.assets[0].uri;
      setFriendImageUri(uri);
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

const handleSaveFriend = async () => {
  if (!newFriendName.trim() || !user) {
    setFormMessage({ text: "Please enter your friend's name.", type: 'error' });
    return;
  }

  try {
    setLoading(true);
    setFormMessage(null); // Clear any existing messages
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

    let actionType = editingFriend ? "updated" : "added";

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

      // Log the successful friend update matching your logs table schema
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

      // Log the successful friend creation matching your logs table schema
      await supabase.from('logs').insert({
        user_id: user.id,
        details: `added friend "${newFriendName.trim()}".`,
      });
    }

    // Success feedback
    setFormMessage({ 
      text: `Friend successfully ${actionType}!`, 
      type: 'success' 
    });

    // Wait 1.2 seconds, then reset everything including loading
    setTimeout(() => {
      setEditingFriend(null);
      setNewFriendName('');
      setNewFriendEmail('');
      setFriendImageUri(null);
      setFormMessage(null);
      setAddFriendModalVisible(false);
      setLoading(false); // <--- Turn off loading here!
    }, 1200);

  } catch (err: any) {
    setFormMessage({ 
      text: err.message || 'Failed to save friend. Please try again.', 
      type: 'error' 
    });
    setLoading(false); // <--- Turn off loading on error too
  }
};

const confirmDeleteFriend = (friendId: string) => {
  // Optional: Find the friend object if you want to show their name in the confirmation dialog
  const friend = friends.find(f => f.id === friendId);
  setFriendToDelete(friend);
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
    setSplitDeleteMessage(null); // Clear any previous message

    // Optional: fetch the split description before deleting if you want a descriptive log
    const { data: splitToDelete } = await supabase
      .from('split_expenses')
      .select('description, total_amount')
      .eq('id', splitId)
      .maybeSingle();

    const { error } = await supabase
      .from('split_expenses')
      .delete()
      .eq('id', splitId);

    if (error) throw error;

    // Fetch current user and log the deletion action matching your logs table schema
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const splitDesc = splitToDelete?.description || splitId;
      await supabase.from('logs').insert({
        user_id: user.id,
        details: `deleted split expense "${splitDesc}".`,
      });
    }

    setActiveSplits((prev) => prev.filter((s) => s.id !== splitId));
    
    // Show inline success message
    setSplitDeleteMessage({ text: 'Split expense deleted successfully.', type: 'success' });
    
    // Auto-clear message after 3 seconds
    setTimeout(() => {
      setSplitDeleteMessage(null);
    }, 3000);

  } catch (err: any) {
    setSplitDeleteMessage({ 
      text: err.message || 'Failed to delete split.', 
      type: 'error' 
    });
  } finally {
    setLoading(false);
  }
};

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
  if (loading) return; // Prevent double taps

  // Clear any existing messages
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
    calculatedFriendsPayload = selectedFriends.map((fId) => ({
      friend_id: fId,
      owed_amount: share,
    }));
  } else {
    let customSum = 0;
    for (const fId of selectedFriends) {
      const val = parseFloat(customShares[fId] || '0');
      if (isNaN(val) || val < 0) {
        setSplitFormMessage({ text: 'Please enter valid custom amounts for selected friends.', type: 'error' });
        return;
      }
      customSum += val;
      calculatedFriendsPayload.push({
        friend_id: fId,
        owed_amount: val,
      });
    }

    if (customSum > numericAmount) {
      setSplitFormMessage({ text: 'The sum of friend shares cannot exceed total amount.', type: 'error' });
      return;
    }
    ownerShare = parseFloat((numericAmount - customSum).toFixed(2));
  }

  // Turn loading on right before performing network/async operations
  setLoading(true);

  try {
    // 1. Fetch the user's most recent active income dynamically (including its amount)
    let activeIncomeId = null;
    const { data: latestIncome, error: incomeFetchErr } = await supabase
      .from('income')
      .select('id, amount')
      .eq('user_id', user.id)
      .eq('is_archived', false) // ensure it's not archived
      .order('received_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (incomeFetchErr) throw incomeFetchErr;

    // Validation: Ensure an active income exists
    if (!latestIncome) {
      setSplitFormMessage({ 
        text: 'No active income found. Please create an income before splitting expenses.', 
        type: 'error' 
      });
      setLoading(false);
      return;
    }

    activeIncomeId = latestIncome.id;

    // 1b. Fetch all expenses linked to this active income to calculate total spent
    const { data: incomeExpenses, error: expFetchErr } = await supabase
      .from('expenses')
      .select('amount')
      .eq('income_id', activeIncomeId);

    if (expFetchErr) throw expFetchErr;

    const totalExpenses = (incomeExpenses || []).reduce((sum, exp) => sum + (exp.amount || 0), 0);
    const remainingBalance = latestIncome.amount - totalExpenses;

    // Validation: Ensure split amount does not exceed remaining balance
    if (numericAmount > remainingBalance) {
      setSplitFormMessage({ 
        text: `Split amount (${numericAmount}) exceeds your remaining income balance (${remainingBalance.toFixed(2)}).`, 
        type: 'error' 
      });
      setLoading(false);
      return;
    }

    // 2. Insert into split_expenses table
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

    const friendInserts = calculatedFriendsPayload.map((f: any) => ({
      split_expense_id: splitExp.id,
      friend_id: f.friend_id,
      owed_amount: f.owed_amount,
      status: 'unpaid',
      updated_at: new Date().toISOString(),
    }));

    const { error: friendsErr } = await supabase.from('split_friends').insert(friendInserts);
    if (friendsErr) throw friendsErr;

    // 3. Insert into general expenses table using category_id, fetched income_id, and spent_at
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

    // 4. Send email notifications
    await sendNewSplitEmails(
      splitExp,
      calculatedFriendsPayload,
      numericAmount,
      description.trim(),
      myProfile?.full_name
    );

    // Log the successful split creation matching your logs table schema
    await supabase.from('logs').insert({
      user_id: user.id,
      details: `created split expense "${description.trim()}" (${numericAmount}).`,
    });

    // Show success inline message
    setSplitFormMessage({ text: 'Split expense saved, logged to expenses, and emails sent!', type: 'success' });

    // Delay closing the modal so the user can see the success banner
    setTimeout(() => {
      setFormVisible(false);
      resetForm();
      fetchData(user.id);
      setSplitFormMessage(null);
      setLoading(false);
    }, 1200);

  } catch (err: any) {
    setSplitFormMessage({ 
      text: err.message || 'Failed to process split.', 
      type: 'error' 
    });
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

  // Clear previous modal messages
  setSettleModalMessage(null);

  const paidVal = parseFloat(paymentInputAmount);
  if (isNaN(paidVal) || paidVal <= 0) {
    // Show error inline inside the modal instead of an alert popup
    setSettleModalMessage({ text: 'Please enter a valid amount paid.', type: 'error' });
    return;
  }

  // Close the modal and turn loading on
  setSettleAmountModalVisible(false);
  setLoading(true);

  try {
    // 1. Validate that an active income exists FIRST before changing any data
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

    // 2. Update split_friends table
    const { error: updateFriendErr } = await supabase
      .from('split_friends')
      .update({
        owed_amount: parseFloat(newOwed.toFixed(2)),
        status: isFullyPaid ? 'paid' : 'unpaid',
        updated_at: new Date().toISOString(),
      })
      .eq('id', selectedFriendToSettle.id);

    if (updateFriendErr) throw updateFriendErr;

    // 3. Add the received payment to the active income found earlier
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

    // 4. Log the successful settlement payment action matching your logs table schema
    await supabase.from('logs').insert({
      user_id: user.id,
      details: `settled split payment of ₱${paidVal.toFixed(2)} from "${friendName}".`,
    });

    let successMessage = `Successfully received ₱${paidVal.toFixed(2)} from ${friendName} (added to your active income). ${
      isFullyPaid ? 'Fully settled!' : `Remaining balance: ₱${newOwed.toFixed(2)}`
    }`;

    // Show inline success message on the main screen
    setSettleActionMessage({ text: successMessage, type: 'success' });
    setTimeout(() => setSettleActionMessage(null), 4000);

    if (selectedSplitForSettle) {
      setSelectedSplitForSettle((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          split_friends: prev.split_friends.map((sf) =>
            sf.id === selectedFriendToSettle.id
              ? {
                  ...sf,
                  owed_amount: parseFloat(newOwed.toFixed(2)),
                  status: isFullyPaid ? 'paid' : 'unpaid',
                }
              : sf
          ),
        };
      });
    }

    fetchData(user.id);
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Failed to record payment.';
    setSettleActionMessage({
      text: errorMessage,
      type: 'error',
    });
    // Automatically clear the error message after 4 seconds
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

  const calculateOwnerShare = () => {
    const total = parseFloat(amount) || 0;
    const friendCount = selectedFriends?.length || 0;
    if (splitType === 'EQUAL') {
      const parts = friendCount + 1;
      return (total / parts).toFixed(2);
    } else {
      let customSum = 0;
      (selectedFriends || []).forEach((id) => {
        customSum += parseFloat(customShares[id] || '0');
      });
      return Math.max(0, total - customSum).toFixed(2);
    }
  };

  const handleSendReminderEmail = async (
  friendEmail: any, 
  friendName: any, 
  owedAmount: any, 
  totalAmount: any,
  description: any,
  senderName: any
) => {
  try {
    setReminderMessage(null); // Clear any existing messages

    const templateParams = {
      email: friendEmail,                        
      email_subject: `Reminder: Balance for ${description}`, 
      friend_name: friendName,                    
      intro_message: "This is a friendly reminder that you still have a remaining balance for this expense.",
      description: description,                    
      total_amount: (totalAmount || 0).toFixed(2),      
      amount: (owedAmount || 0).toFixed(2),            
      call_to_action: "Please settle this at your earliest convenience. Thank you!",
      sender_name: senderName,                    
    };

    const serviceID = 'service_67drjkh';    
    const templateID = 'template_amd0qms';   
    const userID = 'W4iiQMEllSfk5dSfk';        

    const response = await emailjs.send(serviceID, templateID, templateParams, userID);
    
    console.log('SUCCESS!', response.status, response.text);
    
    // Show inline success message
    setReminderMessage({ text: 'Email reminder sent successfully!', type: 'success' });

    // Auto-clear message after 3 seconds
    setTimeout(() => {
      setReminderMessage(null);
    }, 3000);

  } catch (err: any) {
    console.error('FAILED...', err);
    
    // Show inline error message
    setReminderMessage({ 
      text: err.text || err.message || 'Failed to send email reminder.', 
      type: 'error' 
    });
  }
};

  const sendNewSplitEmails = async (createdSplitData: any, friendsPayload: any, totalAmount: any, description: any, senderName: any) => {
    try {
      const serviceID = 'service_67drjkh';    
      const templateID = 'template_amd0qms';   
      const userID = 'W4iiQMEllSfk5dSfk';        

      for (const item of friendsPayload) {
        const friendObj = (friends || []).find((f) => f.id === item.friend_id);
        
        if (!friendObj || !friendObj.email) continue;

        const templateParams = {
          email: friendObj.email,                                    
          email_subject: `New Split Expense Added: ${description}`, 
          friend_name: friendObj.full_name,                          
          intro_message: "You have been added to a new split expense.", 
          description: description,                                  
          total_amount: parseFloat(totalAmount).toFixed(2),        
          amount: parseFloat(item.owed_amount || 0).toFixed(2),    
          call_to_action: "Please settle your balance accordingly. Thank you!",
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
      {/* HEADER */}
      <View style={styles.modernHeader}>
        <View style={styles.headerLeft}>
          <Ionicons name="people-circle-outline" size={28} color="#FFFFFF" />
          <Text style={styles.modernHeaderTitle}>Split Expenses</Text>
        </View>
        <TouchableOpacity
          style={styles.quickFormTrigger}
          onPress={() => setFormVisible(true)}
        >
          <Ionicons name="add" size={18} color="#FFFFFF" />
          <Text style={styles.quickFormTriggerText}>New Split</Text>
        </TouchableOpacity>
      </View>

      {loading && !refreshing ? (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
        > 

          {/* FRIENDS SECTION */}
          <View style={styles.friendsSection}>
            {/* --- INLINE DELETE MESSAGE BANNER --- */}
            {deleteMessage && (
              <View style={[
                styles.inlineMessageContainer, 
                deleteMessage.type === 'error' ? styles.errorBanner : styles.successBanner,
                { marginBottom: 12 }
              ]}>
                <Ionicons 
                  name={deleteMessage.type === 'error' ? "alert-circle-outline" : "checkmark-circle-outline"} 
                  size={18} 
                  color={deleteMessage.type === 'error' ? '#D32F2F' : '#2E7D32'} 
                  style={{ marginRight: 6 }}
                />
                <Text style={[
                  styles.inlineMessageText, 
                  deleteMessage.type === 'error' ? styles.errorText : styles.successText
                ]}>
                  {deleteMessage.text}
                </Text>
              </View>
            )}

            {/* --- INLINE SPLIT DELETE MESSAGE BANNER --- */}
            {splitDeleteMessage && (
              <View style={[
                styles.inlineMessageContainer, 
                splitDeleteMessage.type === 'error' ? styles.errorBanner : styles.successBanner,
                { marginBottom: 12 }
              ]}>
                <Ionicons 
                  name={splitDeleteMessage.type === 'error' ? "alert-circle-outline" : "checkmark-circle-outline"} 
                  size={18} 
                  color={splitDeleteMessage.type === 'error' ? '#D32F2F' : '#2E7D32'} 
                  style={{ marginRight: 6 }}
                />
                <Text style={[
                  styles.inlineMessageText, 
                  splitDeleteMessage.type === 'error' ? styles.errorText : styles.successText
                ]}>
                  {splitDeleteMessage.text}
                </Text>
              </View>
            )}

            {/* --- INLINE REMINDER EMAIL MESSAGE BANNER --- */}
            {reminderMessage && (
              <View style={[
                styles.inlineMessageContainer, 
                reminderMessage.type === 'error' ? styles.errorBanner : styles.successBanner,
                { marginBottom: 12 }
              ]}>
                <Ionicons 
                  name={reminderMessage.type === 'error' ? "alert-circle-outline" : "checkmark-circle-outline"} 
                  size={18} 
                  color={reminderMessage.type === 'error' ? '#D32F2F' : '#2E7D32'} 
                  style={{ marginRight: 6 }}
                />
                <Text style={[
                  styles.inlineMessageText, 
                  reminderMessage.type === 'error' ? styles.errorText : styles.successText
                ]}>
                  {reminderMessage.text}
                </Text>
              </View>
            )}

            {/* --- MAIN SCREEN INLINE SUCCESS/ERROR BANNER FOR SETTLEMENTS --- */}
            {settleActionMessage && (
              <View style={[
                styles.inlineMessageContainer, 
                settleActionMessage.type === 'error' ? styles.errorBanner : styles.successBanner,
                { marginBottom: 12 }
              ]}>
                <Ionicons 
                  name={settleActionMessage.type === 'error' ? "alert-circle-outline" : "checkmark-circle-outline"} 
                  size={18} 
                  color={settleActionMessage.type === 'error' ? '#D32F2F' : '#2E7D32'} 
                  style={{ marginRight: 6 }}
                />
                <Text style={[
                  styles.inlineMessageText, 
                  settleActionMessage.type === 'error' ? styles.errorText : styles.successText
                ]}>
                  {settleActionMessage.text}
                </Text>
              </View>
            )}

            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitle}>Friends List</Text>
              <Text style={styles.sectionCount}>{friends?.length || 0} friends</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalFriendsScroll}>
              <TouchableOpacity style={styles.avatarContainer} onPress={() => setAddFriendModalVisible(true)}>
                <View style={styles.addCircle}>
                  <Ionicons name="add" size={24} color={colors.textFaint} />
                </View>
                <Text style={styles.avatarName}>Add Friend</Text>
              </TouchableOpacity>

              {([...(friends || [])].reverse()).map((f) => {
                return (
                  <TouchableOpacity 
                    key={f.id} 
                    style={styles.avatarContainer}
                    onPress={() => handleFriendPress(f)}
                  >
                    <Image
                      source={
                        f.avatar_url
                          ? { uri: f.avatar_url }
                          : require('../../assets/images/default.png')
                      }
                      style={styles.friendAvatar}
                    />
                    <Text style={styles.avatarName} numberOfLines={1}>
                      {f.full_name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
              
          <View style={[styles.sectionTitleRow, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
            <Text style={styles.sectionTitle}>Split History</Text>
            <Text style={styles.sectionCount}>{activeSplits?.length || 0} splits</Text>
          </View>

          {(activeSplits?.length || 0) === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="receipt-outline" size={48} color="#CBD5E1" />
              <Text style={styles.emptyText}>No splits recorded yet.</Text>
            </View>
          ) : (
            (activeSplits || []).map((item: any) => {
              const sfList = item.split_friends || [];
              const totalAmount = item.total_amount || 0;
              const personalShare = item.personal_share || 0;

              // Get the dynamic category icon name (fallback to 'people-outline' if none exists)
              const categoryIcon = item.categories?.icon || 'people-outline';

              return (
                <View key={item.id} style={styles.historyCard}>
                  {/* TOP ROW: Description, Date & Total Amount */}
                  <View style={styles.historyTop}>
                    <View style={styles.categoryIconContainer}>
                      <Ionicons name={categoryIcon} size={22} color={colors.primary} />
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={styles.historyDesc}>{item.description}</Text>
                      <Text style={styles.historyMeta}>
                        {item.created_at 
                          ? new Date(item.created_at).toLocaleDateString('en-US', { 
                              month: 'long', 
                              day: 'numeric', 
                              year: 'numeric' 
                            }) 
                          : ''}
                      </Text>
                    </View>

                    <View style={{ alignItems: 'flex-end', justifyContent: 'center', marginRight: 10 }}>
                      <Text style={{ fontSize: 11, color: '#64748B' }}>Total Amount</Text>
                      <Text style={styles.settleCardTotalValue}>₱{totalAmount.toFixed(2)}</Text>
                    </View>

                    <View style={styles.rightActionsContainer}>
  <View style={styles.iconButtonsRow}>
    <TouchableOpacity
      style={styles.actionIconButton}
      onPress={() => setSplitToDelete(item)} // <--- Triggers confirmation modal
    >
      <Ionicons name="trash-outline" size={18} color={'#ff5252'} />
    </TouchableOpacity>
  </View>
</View>
                  </View>

                  <View style={{ height: 1, backgroundColor: '#f1f1f1', marginTop: 10, marginBottom: 7 }} />

                  {/* DIRECTLY DISPLAYED DETAILS */}
                  <View style={{ marginTop: 1 }}>
                    {/* Owner Row (Me) */}
                    <View style={styles.settleMemberRowCard}>
                      <View style={styles.settleLeftCol}>
                        <Image
                          source={
                            myProfile?.avatar_url
                              ? { uri: myProfile.avatar_url }
                              : require('../../assets/images/default.png')
                          }
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

                    {/* Friends Rows */}
                    {sfList.map((sf: any) => {
                      const isPaid = sf.status === 'paid' && sf.owed_amount <= 0;
                      const friendName = sf.friends?.full_name || 'Friend';
                      const avatarUrl = sf.friends?.avatar_url;

                      return (
                        <View key={sf.id} style={styles.settleMemberRowCard}>
                          <View style={styles.settleLeftCol}>
                            <Image
                              source={
                                avatarUrl
                                  ? { uri: avatarUrl }
                                  : require('../../assets/images/default.png')
                              }
                              style={styles.settleAvatarImage}
                            />
                            <View style={{ flexShrink: 1 }}>
                              <Text style={styles.settleMemberName} numberOfLines={1}>{friendName}</Text>
                              <Text style={styles.settleMemberSub}>
                                {isPaid ? 'Settled' : 'Owes you'}
                              </Text>
                            </View>
                          </View>

                          <View style={styles.settleCenterCol}>
                            <Text style={styles.settleAmountText}>₱{(sf.owed_amount || 0).toFixed(2)}</Text>
                          </View>

                          <View style={styles.settleRightCol}>
                            {isPaid ? (
                              <View style={styles.settlePaidPill}>
                                <Ionicons name="checkmark-circle" size={14} color={colors.positive} />
                                <Text style={styles.settlePaidPillText}>Paid</Text>
                              </View>
                            ) : (
                              <TouchableOpacity
                                style={styles.settlePayButton}
                                onPress={() => handleInitiateSettleFriend(sf)}
                              >
                                <Text style={styles.settlePayButtonText}>Settle</Text>
                              </TouchableOpacity>
                            )}
                          </View>

                          <View style={styles.settleSuperRightCol}>
                            {!isPaid && sf.friends?.email ? (
                              <TouchableOpacity 
                                onPress={() => handleSendReminderEmail(
                                  sf.friends?.email,       
                                  sf.friends?.full_name,   
                                  sf.owed_amount,          
                                  item?.total_amount,      
                                  item?.description,       
                                  myProfile?.full_name     
                                )}
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

      {/* CREATE SPLIT MODAL */}
      <Modal visible={formVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.formDrawerContainer}>
            <View style={styles.pullBar} />
            <View style={styles.modalHeader}>
              <Text style={styles.drawerTitle}>Create Split Expense</Text>
              <TouchableOpacity 
                style={styles.closeCircle} 
                onPress={() => {
                  setFormVisible(false);
                  setDescription('');
                  setAmount('');
                  setSelectedFriends([]);
                  setCustomShares({});
                  setSplitFormMessage(null); // Clear message on close
                }}
              >
                <Ionicons name="close" size={23} color={colors.headerDarker} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
              
              {/* --- INLINE MESSAGE BANNER --- */}
        {splitFormMessage && (
          <View style={[
            styles.inlineMessageContainer, 
            splitFormMessage.type === 'error' ? styles.errorBanner : styles.successBanner,
            { marginBottom: 16 }
          ]}>
            <Ionicons 
              name={splitFormMessage.type === 'error' ? "alert-circle-outline" : "checkmark-circle-outline"} 
              size={18} 
              color={splitFormMessage.type === 'error' ? '#D32F2F' : '#2E7D32'} 
              style={{ marginRight: 6 }}
            />
            <Text style={[
              styles.inlineMessageText, 
              splitFormMessage.type === 'error' ? styles.errorText : styles.successText
            ]}>
              {splitFormMessage.text}
            </Text>
          </View>
        )}
              
              {/* 1. Total Amount First & Big */}
              <Text style={styles.label}>Total Amount (₱)</Text>
              <TextInput
                style={styles.largeAmountInput}
                placeholder="0.00"
                placeholderTextColor={colors.textFaint}
                keyboardType="numeric"
                value={amount}
                onChangeText={setAmount}
              />

              {/* 2. Description Second */}
              <Text style={styles.label}>Description</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Dinner with Friends"
                placeholderTextColor={colors.textFaint}
                value={description}
                onChangeText={setDescription}
              />

              {/* 3. Category Selection (Horizontal ScrollView) */}
              <Text style={styles.label}>Category</Text>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false} 
                contentContainerStyle={{ gap: 8, marginBottom: 16 }}
              >
                {(categories || []).map((cat) => {
                  const isSelected = selectedCategoryId === cat.id;
                  return (
                    <TouchableOpacity
                      key={cat.id}
                      style={[
                        styles.checkChip, 
                        isSelected && styles.checkChipSelected,
                        { paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }
                      ]}
                      onPress={() => setSelectedCategoryId(cat.id)}
                    >
                      <Text style={[styles.checkChipText, isSelected && styles.checkChipTextSelected]}>
                        {cat.name}
                      </Text>
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

              {/* 4. Horizontal Scrollable Friends Checklist */}
              <Text style={styles.label}>Select Friends Included</Text>
              {(friends?.length || 0) === 0 ? (
                <Text style={styles.emptyInlineText}>No friends added yet. Please add a friend first.</Text>
              ) : (
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false} 
                  contentContainerStyle={styles.horizontalChecklist}
                >
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
                          color={isSelected ? colors.primary : colors.textMuted}
                        />
                        <Text style={[styles.checkChipText, isSelected && styles.checkChipTextSelected]}>
                          {f.full_name}
                        </Text>
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
                          placeholderTextColor={colors.textFaint}
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
                  <Ionicons name="information-circle-outline" size={20} color={colors.positive} />
                  <Text style={styles.previewText}>
                    Your Personal Share: <Text style={{ fontWeight: '800' }}>₱{calculateOwnerShare()}</Text>
                  </Text>
                </View>
              )}

              <TouchableOpacity 
                style={[
                  styles.submitBtn, 
                  loading && { opacity: 0.7 }
                ]} 
                onPress={handleCreateSplitDirectly}
                disabled={loading}
              >
                {loading ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                    <Text style={styles.submitBtnText}>Saving...</Text>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <Text style={styles.submitBtnText}>Confirm & Save Split</Text>
                    <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                  </View>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

{/* --- MODERN SPLIT DELETE CONFIRMATION MODAL --- */}
<Modal visible={!!splitToDelete} animationType="fade" transparent>
  <View style={styles.modalOverlayCenter}>
    <View style={[styles.alertModalContainer, { width: '85%', maxWidth: 360, alignItems: 'center', paddingVertical: 24 }]}>
      
      {/* Warning Icon Badge */}
      <View style={{ 
        width: 56, 
        height: 56, 
        borderRadius: 28, 
        backgroundColor: '#FFEBEE', 
        justifyContent: 'center', 
        alignItems: 'center', 
        marginBottom: 16 
      }}>
        <Ionicons name="warning-outline" size={28} color="#D32F2F" />
      </View>

      {/* Title & Description */}
      <Text style={[styles.modalTitle, { textAlign: 'center', marginBottom: 8 }]}>
        Delete Split Expense?
      </Text>
      <Text style={{ textAlign: 'center', color: colors.textMuted || '#666', fontSize: 14, marginBottom: 24, paddingHorizontal: 10 }}>
        Are you sure you want to delete <Text style={{ fontWeight: '600', color: colors.textDark || '#333' }}>"{splitToDelete?.description}"</Text>? This action cannot be undone.
      </Text>

      {/* Action Buttons */}
      <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
        <TouchableOpacity 
          style={{ 
            flex: 1, 
            paddingVertical: 12, 
            borderRadius: 8, 
            backgroundColor: '#F5F5F5', 
            alignItems: 'center' 
          }}
          onPress={() => setSplitToDelete(null)}
        >
          <Text style={{ fontWeight: '600', color: '#333' }}>Cancel</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={{ 
            flex: 1, 
            paddingVertical: 12, 
            borderRadius: 8, 
            backgroundColor: '#D32F2F', 
            alignItems: 'center' 
          }}
          onPress={async () => {
            const idToDelete = splitToDelete.id;
            setSplitToDelete(null); // Close modal
            await handleDeleteSplit(idToDelete); // Call your existing delete handler
          }}
        >
          <Text style={{ fontWeight: '600', color: '#FFF' }}>Delete</Text>
        </TouchableOpacity>
      </View>

    </View>
  </View>
</Modal>

      {/* ADD / EDIT FRIEND MODAL */}
<Modal visible={addFriendModalVisible} animationType="fade" transparent>
  <View style={styles.modalOverlayCenter}>
    <View style={styles.alertModalContainer}>
      <View style={styles.modalHeader}>
        <Text style={styles.modalTitle}>
          {editingFriend ? "Edit Friend" : "Add New Friend"}
        </Text>
        <TouchableOpacity 
          style={styles.closeCircle} 
          onPress={() => {
            setAddFriendModalVisible(false);
            setEditingFriend(null);
            setNewFriendName('');
            setNewFriendEmail('');
            setFriendImageUri(null);
            setFormMessage(null); // Clear message on close
          }}
        >
          <Ionicons name="close" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* --- INLINE MESSAGE BANNER --- */}
      {formMessage && (
        <View style={[
          styles.inlineMessageContainer, 
          formMessage.type === 'error' ? styles.errorBanner : styles.successBanner
        ]}>
          <Ionicons 
            name={formMessage.type === 'error' ? "alert-circle-outline" : "checkmark-circle-outline"} 
            size={18} 
            color={formMessage.type === 'error' ? '#D32F2F' : '#2E7D32'} 
            style={{ marginRight: 6 }}
          />
          <Text style={[
            styles.inlineMessageText, 
            formMessage.type === 'error' ? styles.errorText : styles.successText
          ]}>
            {formMessage.text}
          </Text>
        </View>
      )}

      <TextInput
        style={[styles.input, { marginTop: 12 }]}
        placeholder="Friend's Full Name"
        placeholderTextColor={colors.textFaint}
        value={newFriendName}
        onChangeText={setNewFriendName}
      />

      <TextInput
        style={[styles.input, { marginTop: 12 }]}
        placeholder="Friend's Email"
        placeholderTextColor={colors.textFaint}
        value={newFriendEmail}
        onChangeText={setNewFriendEmail}
      />

      <View style={{ alignItems: 'center', marginVertical: 10 }}>
        <Image
          source={
            friendImageUri
              ? { uri: friendImageUri }
              : require('../../assets/images/default.png')
          }
          style={{ width: 80, height: 80, borderRadius: 40, marginBottom: 10 }}
        />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity onPress={() => pickImage(false)} style={{ padding: 6, backgroundColor: '#eee', borderRadius: 5 }}>
            <Text>Pick from Gallery</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => pickImage(true)} style={{ padding: 6, backgroundColor: '#eee', borderRadius: 5 }}>
            <Text>Take Photo</Text>
          </TouchableOpacity>
        </View>
      </View>
      
      <TouchableOpacity 
        style={[styles.submitBtn, loading && { opacity: 0.7 }]} 
        onPress={handleSaveFriend}
        disabled={loading}
      >
        <Text style={styles.submitBtnText}>
          {loading ? "Saving..." : (editingFriend ? "Update Friend" : "Save Friend")}
        </Text>
      </TouchableOpacity>
    </View>
  </View>
</Modal>

{/* MANAGE FRIEND ACTION MODAL */}
<Modal visible={manageModalVisible} animationType="fade" transparent>
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
          {/* Friend Profile Snippet */}
          <View style={styles.manageProfileRow}>
            <Image
              source={
                selectedFriend.avatar_url
                  ? { uri: selectedFriend.avatar_url }
                  : require('../../assets/images/default.png')
              }
              style={{ width: 50, height: 50, borderRadius: 25, marginRight: 12 }}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.manageFriendName}>{selectedFriend.full_name}</Text>
              <Text style={styles.manageFriendEmail} numberOfLines={1}>
                {selectedFriend.email || 'No email provided'}
              </Text>
            </View>
          </View>

          {/* Action Buttons */}
          <TouchableOpacity 
            style={styles.actionOptionBtn} 
            onPress={() => {
              const friendToEdit = selectedFriend;
              setManageModalVisible(false);
              setSelectedFriend(null);
              openEditModal(friendToEdit);
            }}
          >
            <Ionicons name="pencil-outline" size={20} color={colors.textDark || '#333'} style={{ marginRight: 10 }} />
            <Text style={styles.actionOptionText}>Edit Friend Details</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.actionOptionBtn, styles.deleteOptionBtn]} 
            onPress={() => {
              const friendId = selectedFriend.id;
              setManageModalVisible(false);
              setSelectedFriend(null);
              confirmDeleteFriend(friendId); // <--- Triggers modern confirmation modal instead
            }}
          >
            <Ionicons name="trash-outline" size={20} color="#D32F2F" style={{ marginRight: 10 }} />
            <Text style={[styles.actionOptionText, styles.deleteOptionText]}>Delete Friend</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  </View>
</Modal>

{/* --- MODERN DELETE CONFIRMATION MODAL --- */}
<Modal visible={!!friendToDelete} animationType="fade" transparent>
  <View style={styles.modalOverlayCenter}>
    <View style={[styles.alertModalContainer, { width: '85%', maxWidth: 360, alignItems: 'center', paddingVertical: 24 }]}>
      
      {/* Warning Icon Badge */}
      <View style={{ 
        width: 56, 
        height: 56, 
        borderRadius: 28, 
        backgroundColor: '#FFEBEE', 
        justifyContent: 'center', 
        alignItems: 'center', 
        marginBottom: 16 
      }}>
        <Ionicons name="warning-outline" size={28} color="#D32F2F" />
      </View>

      {/* Title & Description */}
      <Text style={[styles.modalTitle, { textAlign: 'center', marginBottom: 8 }]}>
        Delete Friend?
      </Text>
      <Text style={{ textAlign: 'center', color: colors.textMuted || '#666', fontSize: 14, marginBottom: 24, paddingHorizontal: 10 }}>
        Are you sure you want to delete <Text style={{ fontWeight: '600', color: colors.textDark || '#333' }}>{friendToDelete?.full_name}</Text>? This action cannot be undone.
      </Text>

      {/* Action Buttons */}
      <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
        <TouchableOpacity 
          style={{ 
            flex: 1, 
            paddingVertical: 12, 
            borderRadius: 8, 
            backgroundColor: '#F5F5F5', 
            alignItems: 'center' 
          }}
          onPress={() => setFriendToDelete(null)}
        >
          <Text style={{ fontWeight: '600', color: '#333' }}>Cancel</Text>
        </TouchableOpacity>

        <TouchableOpacity 
  style={{ 
    flex: 1, 
    paddingVertical: 12, 
    borderRadius: 8, 
    backgroundColor: '#D32F2F', 
    alignItems: 'center' 
  }}
  onPress={async () => {
    const idToDelete = friendToDelete.id;
    const friendName = friendToDelete.full_name;
    setFriendToDelete(null); // Close confirmation modal
    
    try {
      const { error } = await supabase
        .from('friends')
        .delete()
        .eq('id', idToDelete);

      if (error) throw error;

      // Fetch current user and log the deletion action matching your logs table schema
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('logs').insert({
          user_id: user.id,
          details: `deleted friend "${friendName || idToDelete}".`,
        });
      }

      // Update state
      setFriends((prev) => prev.filter((f) => f.id !== idToDelete));
      
      // Show inline success message
      setDeleteMessage({ text: 'Friend deleted successfully.', type: 'success' });
      
      // Auto-clear message after 3 seconds
      setTimeout(() => {
        setDeleteMessage(null);
      }, 3000);

    } catch (err: any) {
      setDeleteMessage({ 
        text: err.message || 'Failed to delete friend.', 
        type: 'error' 
      });
    }
  }}
>
  <Text style={{ fontWeight: '600', color: '#FFF' }}>Delete</Text>
</TouchableOpacity>
      </View>

    </View>
  </View>
</Modal>

{/* PAYMENT ENTRY INPUT MODAL FOR MARK PAID */}
<Modal visible={settleAmountModalVisible} animationType="fade" transparent>
  <View style={styles.modalOverlayCenter}>
    <View style={styles.paymentModalContainer}>
      <View style={styles.paymentModalHeader}>
        <View style={styles.paymentModalTitleRow}>
          <View style={styles.paymentIconContainer}>
            <Ionicons name="cash-outline" size={20} color={colors.primary} />
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

      {/* --- INLINE ERROR MESSAGE INSIDE MODAL --- */}
      {settleModalMessage && (
        <View style={[styles.inlineMessageContainer, styles.errorBanner, { marginBottom: 12 }]}>
          <Ionicons name="alert-circle-outline" size={16} color="#D32F2F" style={{ marginRight: 6 }} />
          <Text style={[styles.inlineMessageText, styles.errorText]}>{settleModalMessage.text}</Text>
        </View>
      )}

      <View style={styles.paymentInfoCard}>
        <Text style={styles.paymentCardLabel}>From Friend</Text>
        <Text style={styles.paymentFriendName}>
          {selectedFriendToSettle?.friends?.full_name || 'Friend'}
        </Text>
        
        <View style={styles.paymentCardDivider} />
        
        <View style={styles.paymentBalanceRow}>
          <Text style={styles.paymentCardLabel}>Current Balance Owed:</Text>
          <Text style={styles.paymentOwedAmount}>
            ₱{(selectedFriendToSettle?.owed_amount || 0).toFixed(2)}
          </Text>
        </View>
      </View>

      <Text style={[styles.label, { marginBottom: 6 }]}>Amount Received (₱)</Text>
      <TextInput
        style={styles.paymentInput}
        placeholder="0.00"
        placeholderTextColor={colors.textFaint}
        keyboardType="numeric"
        value={paymentInputAmount}
        onChangeText={(text) => {
          setPaymentInputAmount(text);
          if (settleModalMessage) setSettleModalMessage(null); // Clear error on typing
        }}
        autoFocus={true}
      />

      <TouchableOpacity
        style={styles.paymentSubmitBtn}
        onPress={handleConfirmSettlePayment}
      >
        <Ionicons name="checkmark-circle-outline" size={18} color="#FFFFFF" />
        <Text style={styles.paymentSubmitBtnText}>Confirm Settlement</Text>
      </TouchableOpacity>

    </View>
  </View>
</Modal>
    </View>
  );
}