// app/help.tsx
import { Ionicons } from '@expo/vector-icons';
import { getAiModel } from '../../services/aiClient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { colors } from '../(spenderTabs)/profile';

interface Message {
  id: string;
  sender: 'user' | 'payton';
  text: string;
}

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
    <View style={styles.container}>
      <StatusBar style="light" />
      
      {/* Modern Curved Header */}
      <View style={styles.modernHeader}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtnTouchable}>
          <Ionicons name="arrow-back" size={20} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitleCentered}>Help Desk</Text>
        <View style={{ width: 20 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>Frequently Asked Questions</Text>
        
        {[
          { q: "How do I update my email?", a: "Registered email addresses are locked for security. Please contact our administrators to submit an update request." },
          { q: "How do I reset my password?", a: "You can securely reset your password by tapping 'Forgot Password' on the login screen, or via your profile settings if you are currently logged in." },
          { q: "Is my balance ledger encrypted?", a: "Yes, Payton uses end-to-end Row Level Security protocols integrated securely via Supabase database networks." },
          { q: "How long do image uploads take?", a: "Avatar uploads stream in real-time, generally updating within 2-5 seconds depending on network bandwidth." }
        ].map((faq, idx) => (
          <View key={idx} style={styles.faqCard}>
            <Text style={styles.questionText}>{faq.q}</Text>
            <Text style={styles.answerText}>{faq.a}</Text>
          </View>
        ))}

        <TouchableOpacity 
          style={styles.pillPrimaryActionBtn} 
          onPress={() => setChatVisible(true)}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
          <Text style={styles.pillPrimaryActionBtnText}>Ask Payton for help</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Interactive Chat Modal */}
      <Modal
        visible={chatVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setChatVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.keyboardAvoidingContainer}
          >
            <View style={styles.chatContainer}>
              {/* Chat Header */}
              <View style={styles.chatHeader}>
                <View style={styles.chatHeaderInfo}>
                  <View style={styles.aiAvatar}>
                    <Ionicons name="chatbubble-ellipses-outline" size={16} color="#FFFFFF" />
                  </View>
                  <View>
                    <Text style={styles.chatTitle}>Ask Payton</Text>
                    <Text style={styles.chatSubtitle}>AI Assistant & System Support</Text>
                  </View>
                </View>
                <TouchableOpacity onPress={() => setChatVisible(false)} style={styles.closeBtn}>
                  <Ionicons name="close" size={22} color="#1E293B" />
                </TouchableOpacity>
              </View>

              {/* Chat Messages */}
              <ScrollView 
                ref={flatListRef}
                contentContainerStyle={styles.chatScroll} 
                showsVerticalScrollIndicator={false}
                onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
              >
                {messages.map((msg) => (
                  <View 
                    key={msg.id} 
                    style={[
                      styles.messageBubble, 
                      msg.sender === 'user' ? styles.userBubble : styles.paytonBubble
                    ]}
                  >
                    <Text style={[
                      styles.messageText, 
                      msg.sender === 'user' ? styles.userText : styles.paytonText
                    ]}>
                      {msg.text}
                    </Text>
                  </View>
                ))}
                {loading && (
                  <View style={[styles.messageBubble, styles.paytonBubble, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
                    <ActivityIndicator size="small" color="#173D45" />
                    <Text style={{ fontSize: 12, color: '#64748B', fontStyle: 'italic' }}>Thinking...</Text>
                  </View>
                )}
              </ScrollView>

              {/* Chat Input Area */}
              <View style={styles.chatInputContainer}>
                <TextInput
                  style={styles.chatInput}
                  placeholder="Ask Payton..."
                  placeholderTextColor="#94A3B8"
                  value={inputText}
                  onChangeText={setInputText}
                  multiline
                />
                <TouchableOpacity style={styles.sendButton} onPress={handleSendMessage} disabled={loading}>
                  <Ionicons name="send" size={18} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#f5fcfa',
  },
  modernHeader: { 
    flexDirection: 'row', 
    justifyContent: 'center', 
    alignItems: 'center', 
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'android' ? 44 : 20,
    paddingBottom: 20,
    backgroundColor: colors.headerDark,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  backBtnTouchable: { width: 20 },
  headerTitleCentered: { 
    flex: 1, 
    textAlign: 'center', 
    fontSize: 20, 
    fontWeight: '800', 
    color: '#ffffff', 
    letterSpacing: -0.5 
  },
  scrollContent: { 
    paddingHorizontal: 24, 
    paddingTop: 24, 
    paddingBottom: 40 
  },
  sectionLabel: { 
    fontSize: 12, 
    fontWeight: '700', 
    color: '#94A3B8', 
    textTransform: 'uppercase', 
    marginBottom: 16, 
    letterSpacing: 0.5 
  },
  faqCard: { 
    backgroundColor: '#FFFFFF', 
    padding: 20, 
    borderRadius: 20, 
    marginBottom: 12, 
    borderWidth: 1, 
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
  },
  questionText: { 
    fontSize: 15, 
    fontWeight: '700', 
    color: '#1E293B', 
    marginBottom: 6 
  },
  answerText: { 
    fontSize: 14, 
    color: '#64748B', 
    lineHeight: 22 
  },
  pillPrimaryActionBtn: {
    backgroundColor: '#173D45',
    borderRadius: 30,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  pillPrimaryActionBtnText: { 
    color: '#FFFFFF', 
    fontSize: 15, 
    fontWeight: '700', 
    letterSpacing: 0.5 
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  keyboardAvoidingContainer: {
    width: '100%',
    maxHeight: '75%',
    justifyContent: 'flex-end',
  },
  chatContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 30 : 20,
    maxHeight: '100%',
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  chatHeaderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  aiAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#173D45',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  chatTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
  },
  chatSubtitle: {
    fontSize: 12,
    color: '#64748B',
  },
  closeBtn: {
    padding: 4,
  },
  chatScroll: {
    paddingVertical: 15,
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
    marginBottom: 10,
  },
  userBubble: {
    backgroundColor: '#173D45',
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  paytonBubble: {
    backgroundColor: '#F1F5F9',
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  userText: {
    color: '#FFFFFF',
  },
  paytonText: {
    color: '#1E293B',
  },
  chatInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  chatInput: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1E293B',
    maxHeight: 100,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#173D45',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
});