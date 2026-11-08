// app/profile/help.tsx
// FAQ accordion + "Ask Payton" chat sheet. While Payton is answering, a skeleton bubble is shown.
// The AI call (getAiModel), the system instruction and the chat logic are unchanged.
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import PrimaryButton from '../../components/profile/PrimaryButton';
import ProfileScreen from '../../components/profile/ProfileScreen';
import { Skeleton, SkeletonGroup } from '../../components/profile/Skeleton';
import { theme } from '../../constants/theme';
import { incomeStyles, insightStyles, profileStyles } from '../../constants/ui.styles';
import { getAiModel } from '../../services/aiClient';

interface Message {
  id: string;
  sender: 'user' | 'payton';
  text: string;
}

const FAQS = [
  { q: "How do I update my email?", a: "Registered email addresses are locked for security. Please contact our administrators to submit an update request." },
  { q: "How do I reset my password?", a: "You can securely reset your password by tapping 'Forgot Password' on the login screen, or via your profile settings if you are currently logged in." },
  { q: "Is my balance ledger encrypted?", a: "Yes, Payton uses end-to-end Row Level Security protocols integrated securely via Supabase database networks." },
  { q: "How long do image uploads take?", a: "Avatar uploads stream in real-time, generally updating within 2-5 seconds depending on network bandwidth." }
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

      const systemInstruction = `
        You are Payton, a friendly financial advisor, system help desk specialist, and customer support for the Payton mobile app.
        Today's date is ${new Date().toDateString()}.

        YOUR ROLE AND CONSTRAINTS:
        - You do NOT have direct access to the user's personal database, balance ledgers, or specific account balances. If they ask about their personal remaining balance, account total, or private transaction history, politely explain that for security and privacy reasons, you cannot view their personal database, and guide them to check their dashboard or transaction tabs instead.
        - Answer questions regarding general personal finance advice, budgeting tips (like the 50/30/20 rule), savings strategies, and app FAQs/troubleshooting.
        - Provide your response in plain text or a warm conversational tone.
      `;

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
        text: "Pasayloha ko, buddy. Naa koy gamit nga nasugatan sa pagtubag karon. Palihog og sulayi og usab."
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
        onRequestClose={() => setChatVisible(false)}
      >
        <View style={incomeStyles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ width: '100%', maxHeight: '75%', justifyContent: 'flex-end' }}
          >
            <View style={incomeStyles.modalSheet}>
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
