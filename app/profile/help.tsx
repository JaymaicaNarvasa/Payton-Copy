// app/profile/help.tsx
// FAQ accordion + "Ask Payton" chat sheet. While Payton is answering, a skeleton bubble is shown.
// The system instruction is built in constants/appGuide.ts so the AI only describes real app screens.
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import PrimaryButton from '../../components/profile/PrimaryButton';
import ProfileScreen from '../../components/profile/ProfileScreen';
import { Skeleton, SkeletonGroup } from '../../components/profile/Skeleton';
import { buildHelpSystemInstruction } from '../../constants/appGuide';
import { SUPPORT_EMAIL } from '../../constants/privacyPolicy';
import { theme } from '../../constants/theme';
import { incomeStyles, insightStyles, profileStyles } from '../../constants/ui.styles';
import { getAiModel } from '../../services/aiClient';

interface Message {
  id: string;
  sender: 'user' | 'payton';
  text: string;
}

const FAQS = [
  { q: "How do I report a problem or contact the Payton team?", a: `Go to Account > Support & Info > Send Feedback, choose a category such as Bug or problem, write your message and send it. You can also e-mail ${SUPPORT_EMAIL}.` },
  { q: "How do I update my email?", a: `Your e-mail is locked for security and shows as read-only in Personal Details. To change it, send feedback under "Account issue" (Account > Support & Info > Send Feedback) or e-mail ${SUPPORT_EMAIL}.` },
  { q: "How do I reset or change my password?", a: "If you are logged out, tap 'Forgot Password' on the login screen. If you are logged in, go to Account > Account & Security > Change Password. You will need your current password, and you will be signed out afterwards." },
  { q: "How do I change my name or photo?", a: "Go to Account > Account & Security > Personal Details, update your full name or tap your photo to change it, then tap SAVE." },
  { q: "How do I export my data?", a: "Go to Account > Data Ledger > Export Data and tap GENERATE EXCEL REPORT. It creates an Excel (.xlsx) file with a summary, monthly expenses, categories and all transactions." },
  { q: "How do I delete my account?", a: "Go to Account > Account & Security > Delete Account, enter your password and type DELETE. This permanently removes your account and data and cannot be undone, so export your data first if you want a copy." },
  { q: "Is my data protected?", a: "Your data is sent over encrypted connections and protected by access controls, so you can only see your own records and the ones shared with you. Read the Privacy Policy under Account > Support & Info for details." },
  { q: "How long do image uploads take?", a: "Avatar uploads usually update within 2-5 seconds, depending on your network connection." },
  { q: "What are the Personal, Spender and Sponsor roles?", a: "Your role decides what you see in the app. Personal is for managing your own money, Spender is for tracking spending, and Sponsor is for providing and monitoring funds for a Spender. You choose your role when you first set up your account." },
  { q: "I didn't receive my password reset email. What should I do?", a: "Check your spam or junk folder first and make sure you typed the same email you registered with. If it still doesn't arrive after a few minutes, request a new link. Only the most recent link will work." },
  { q: "Can Payton AI see my balance or transactions?", a: "No. For your privacy, the Ask Payton assistant cannot view your personal database, balances, or transaction history. It can help with general budgeting tips, saving strategies, and app questions." },
  { q: "Is my password stored safely?", a: "Yes. Your password is handled by a secure authentication service and is never visible to other users or to the app's administrators." },
  { q: "The app is slow or not loading my data. What can I do?", a: "Check that you have a stable internet connection, then close and reopen the app. If the problem continues, sign out and sign back in, or report it under Account > Support & Info > Send Feedback." },
];

export default function HelpScreen() {
  const router = useRouter();
  const [chatVisible, setChatVisible] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', sender: 'payton', text: "Hello! I am Payton, your AI assistant. How can I help you today regarding system help, FAQs, or general financial guidance?" }
  ]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // Android (standalone build): a Modal doesn't resize with the keyboard, so track its height manually.
  const { height: windowHeight } = useWindowDimensions();
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const insets = useSafeAreaInsets();

  // Never let the sheet grow past the status bar, with or without the keyboard.
  const roomAbove = windowHeight - keyboardHeight - insets.top - 16;
  const maxSheetHeight = keyboardHeight ? roomAbove : Math.min(windowHeight * 0.75, roomAbove);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const handleSendMessage = async () => {
    if (!inputText.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      sender: 'user',
      text: inputText.trim()
    };

    setMessages(prev => [...prev, userMessage]);
    const currentInput = inputText.trim();
    setInputText('');
    setLoading(true);

    try {
      const model = getAiModel('help', {
        model: "gemini-3.5-flash-lite",
      });

      const systemInstruction = buildHelpSystemInstruction(new Date().toDateString());

      const result = await model.generateContent([systemInstruction, `User Input: ${currentInput}`]);
      const responseText = result.response.text();

      const paytonMessage: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'payton',
        text: responseText || "I'm here to help with financial tips and app support!"
      };

      setMessages(prev => [...prev, paytonMessage]);

    } catch (error) {
      console.error("🚨 Help Chat Flow Error:", error);
      const errorReply: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'payton',
        text: "Sorry about that. I ran into a problem while replying. Please try again."
      };
      setMessages(prev => [...prev, errorReply]);
    } finally {
      setLoading(false);
    }
  };

  const canSend = !loading && inputText.trim().length > 0;

  return (
    <ProfileScreen
      title="Help Desk"
      onBack={() => router.back()}
      footer={
        <PrimaryButton
          label="Ask Payton for help"
          icon="chatbubble-ellipses-outline"
          onPress={() => setChatVisible(true)}
        />
      }
    >
      <View style={profileStyles.modernCardGroup}>
        <View style={incomeStyles.incomeCard}>
          <Text style={[incomeStyles.sourceText, { marginBottom: theme.space[6] }]}>Need to report something?</Text>
          <Text style={[incomeStyles.toggleSubtext, { lineHeight: 20, marginBottom: theme.space[12] }]}>
            Send a report straight to the Payton team, or e-mail {SUPPORT_EMAIL}.
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity
              onPress={() => router.push('/profile/feedback' as any)}
              accessibilityRole="button"
              style={{ flexDirection: 'row', alignItems: 'center', marginRight: theme.space[20] }}
            >
              <Ionicons name="chatbox-ellipses-outline" size={16} color={theme.colors.brand} style={{ marginRight: 6 }} />
              <Text style={{ color: theme.colors.brand }}>Send Feedback</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
              accessibilityRole="button"
              style={{ flexDirection: 'row', alignItems: 'center' }}
            >
              <Ionicons name="mail-outline" size={16} color={theme.colors.brand} style={{ marginRight: 6 }} />
              <Text style={{ color: theme.colors.brand }}>E-mail us</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={profileStyles.groupContextLabel}>Frequently Asked Questions</Text>

        {FAQS.map((faq, idx) => {
          const open = openFaq === idx;
          return (
            <View key={idx} style={incomeStyles.incomeCard}>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setOpenFaq(open ? null : idx)}
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <Text style={[incomeStyles.sourceText, { flex: 1, marginRight: theme.space[12] }]}>{faq.q}</Text>
                <Ionicons
                  name={open ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={open ? theme.colors.brand : theme.colors.textMuted}
                />
              </TouchableOpacity>
              {open ? (
                <Text style={[incomeStyles.toggleSubtext, { marginTop: theme.space[10], lineHeight: 20 }]}>{faq.a}</Text>
              ) : null}
            </View>
          );
        })}
      </View>

      {/* Interactive Chat Modal (bottom sheet) */}
      <Modal
        visible={chatVisible}
        animationType="slide"
        transparent={true}
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setChatVisible(false)}
      >
        <View style={incomeStyles.modalOverlay}>
          <KeyboardAvoidingView
            enabled={Platform.OS === 'ios'}
            behavior="padding"
            style={{
              width: '100%',
              maxHeight: maxSheetHeight,
              justifyContent: 'flex-end',
              marginBottom: Platform.OS === 'android' ? keyboardHeight : 0,
            }}
          >
            <View style={[incomeStyles.modalSheet, { flexShrink: 1, maxHeight: maxSheetHeight }]}>
              {/* Chat Header */}
              <View style={incomeStyles.modalHeaderRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                  <View style={[insightStyles.sendButton, { marginRight: theme.space[10] }]}>
                    <Ionicons name="chatbubble-ellipses-outline" size={18} color={theme.colors.white} />
                  </View>
                  <View>
                    <Text style={incomeStyles.modalTitle}>Ask Payton</Text>
                    <Text style={incomeStyles.dateText}>AI Assistant & System Support</Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => setChatVisible(false)}
                  style={incomeStyles.modalCloseBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Close chat"
                >
                  <Ionicons name="close" size={20} color={theme.colors.textStrong} />
                </TouchableOpacity>
              </View>

              {/* Chat Messages */}
              <ScrollView
                ref={scrollRef}
                contentContainerStyle={insightStyles.chatScrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
              >
                {messages.map((msg) =>
                  msg.sender === 'user' ? (
                    <View key={msg.id} style={insightStyles.userMessageRow}>
                      <View style={insightStyles.userBubble}>
                        <Text style={insightStyles.userText}>{msg.text}</Text>
                      </View>
                    </View>
                  ) : (
                    <View key={msg.id} style={insightStyles.coachMessageRow}>
                      <View style={insightStyles.coachBubble}>
                        <Text style={insightStyles.coachText}>{msg.text}</Text>
                      </View>
                    </View>
                  )
                )}
                {loading && (
                  <View style={insightStyles.coachMessageRow}>
                    {/* Skeleton "typing" bubble */}
                    <View style={insightStyles.coachBubble}>
                      <SkeletonGroup style={{ width: 190 }}>
                        <Skeleton width="100%" height={12} />
                        <Skeleton width="80%" height={12} style={{ marginTop: theme.space[8] }} />
                        <Skeleton width="55%" height={12} style={{ marginTop: theme.space[8] }} />
                      </SkeletonGroup>
                    </View>
                  </View>
                )}
              </ScrollView>

              {/* Chat Input Area */}
              <View style={[insightStyles.inputRow, { paddingTop: theme.space[10] }]}>
                <TextInput
                  style={[insightStyles.textInput, { maxHeight: 100 }]}
                  placeholder="Ask Payton..."
                  placeholderTextColor={theme.colors.textSubtle}
                  value={inputText}
                  onChangeText={setInputText}
                  multiline
                  accessibilityLabel="Message Payton"
                />
                <TouchableOpacity
                  style={[insightStyles.sendButton, !canSend && insightStyles.sendButtonDisabled]}
                  onPress={handleSendMessage}
                  disabled={!canSend}
                  accessibilityRole="button"
                  accessibilityLabel="Send message"
                >
                  <Ionicons name="send" size={18} color={theme.colors.white} />
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </ProfileScreen>
  );
}
