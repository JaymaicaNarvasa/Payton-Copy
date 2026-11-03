// app/help.tsx
// Built ONLY from existing exports of constants/ui.styles.ts:
//   profileStyles (gradient header + mint sheet), incomeStyles (FAQ cards, bottom-sheet chat modal),
//   insightStyles (chat bubbles, typing indicator, input row, send button), resetPasswordStyles (primary button).
// The AI call (getAiModel), the system instruction and the chat logic below are unchanged.
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';

import GradientBackground from '../../components/GradientBackground';
import { theme } from '../../constants/theme';
import { incomeStyles, insightStyles, profileStyles, resetPasswordStyles } from '../../constants/ui.styles';
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
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', sender: 'payton', text: "Hello! I am Payton, your AI assistant. How can I help you today regarding system help, FAQs, or general financial guidance?" }
  ]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const flatListRef = useRef<ScrollView>(null);

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

  return (
    <View style={profileStyles.container}>
      <StatusBar style="light" />

      {/* Gradient header (same as Profile / About) */}
      <View style={profileStyles.modernHeader}>
        <View style={profileStyles.headerGradientFill} pointerEvents="none">
          <GradientBackground />
        </View>
        <TouchableOpacity onPress={() => router.back()} style={profileStyles.backBtnTouchable} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={theme.colors.white} />
        </TouchableOpacity>
        <Text style={profileStyles.headerTitleCentered}>Help Desk</Text>
        <View style={profileStyles.backBtnTouchable} />
      </View>

      {/* Mint sheet over the gradient */}
      <View style={profileStyles.sheet}>
        <ScrollView
          contentContainerStyle={[profileStyles.scrollContent, { paddingBottom: theme.space[40] }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={profileStyles.modernCardGroup}>
            <Text style={profileStyles.groupContextLabel}>Frequently Asked Questions</Text>

            {FAQS.map((faq, idx) => (
              <View key={idx} style={incomeStyles.incomeCard}>
                <Text style={incomeStyles.sourceText}>{faq.q}</Text>
                <Text style={[incomeStyles.toggleSubtext, { marginTop: theme.space[6], lineHeight: 20 }]}>{faq.a}</Text>
              </View>
            ))}

            <TouchableOpacity style={resetPasswordStyles.primaryButton} onPress={() => setChatVisible(true)}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="chatbubble-ellipses-outline" size={18} color={theme.colors.white} style={{ marginRight: theme.space[8] }} />
                <Text style={resetPasswordStyles.buttonText}>Ask Payton for help</Text>
              </View>
            </TouchableOpacity>
          </View>
        </ScrollView>
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
                <TouchableOpacity onPress={() => setChatVisible(false)} style={incomeStyles.modalCloseBtn}>
                  <Ionicons name="close" size={20} color={theme.colors.textStrong} />
                </TouchableOpacity>
              </View>

              {/* Chat Messages */}
              <ScrollView
                ref={flatListRef}
                contentContainerStyle={insightStyles.chatScrollContent}
                showsVerticalScrollIndicator={false}
                onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
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
                    <View style={insightStyles.typingBubble}>
                      <ActivityIndicator size="small" color={theme.colors.brandDark} />
                      <Text style={insightStyles.typingText}>Thinking...</Text>
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
                />
                <TouchableOpacity
                  style={[insightStyles.sendButton, loading && insightStyles.sendButtonDisabled]}
                  onPress={handleSendMessage}
                  disabled={loading}
                >
                  <Ionicons name="send" size={18} color={theme.colors.white} />
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}