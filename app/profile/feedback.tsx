// app/profile/feedback.tsx  (NEW) - Send Feedback screen
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { colors } from '../(spenderTabs)/profile';

const CATEGORIES = [
  { value: 'bug', label: 'Bug or problem' },
  { value: 'feature', label: 'Feature idea' },
  { value: 'account', label: 'Account issue' },
  { value: 'ai', label: 'AI assistant' },
  { value: 'other', label: 'Other' },
] as const;

const MIN_LENGTH = 10;
const MAX_LENGTH = 1000;

export default function FeedbackScreen() {
  const router = useRouter();
  const [category, setCategory] = useState<string>('other');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const locked = useRef(false); // blocks a second tap before the first request finishes

  const trimmed = message.trim();
  const canSend = trimmed.length >= MIN_LENGTH && !sending;

  async function handleSend() {
    if (locked.current) return;
    if (trimmed.length < MIN_LENGTH) {
      setStatus({ type: 'error', text: `Please write at least ${MIN_LENGTH} characters.` });
      return;
    }
    locked.current = true;
    setSending(true);
    setStatus(null);

    // user_id is filled in by the database from the signed-in session; it is never sent from here.
    const { error } = await supabase.from('user_feedback').insert({ category, message: trimmed });

    locked.current = false;
    setSending(false);

    if (error) {
      const known =
        error.message.includes('already sent') || error.message.includes('limit reached') ? error.message : null;
      setStatus({ type: 'error', text: known ?? 'Could not send your feedback. Please check your connection and try again.' });
      return;
    }
    setMessage('');
    setCategory('other');
    setStatus({ type: 'success', text: 'Thank you! Your feedback was sent to the Payton team.' });
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.modernHeader}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtnTouchable}>
          <Ionicons name="arrow-back" size={20} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitleCentered}>Send Feedback</Text>
        <View style={{ width: 20 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {status && (
            <View style={[styles.banner, status.type === 'success' ? styles.bannerSuccess : styles.bannerError]}>
              <Ionicons
                name={status.type === 'success' ? 'checkmark-circle' : 'alert-circle'}
                size={18}
                color={status.type === 'success' ? '#047857' : '#B91C1C'}
              />
              <Text style={[styles.bannerText, { color: status.type === 'success' ? '#047857' : '#B91C1C' }]}>{status.text}</Text>
            </View>
          )}

          <Text style={styles.sectionLabel}>Category</Text>
          <View style={styles.chipRow}>
            {CATEGORIES.map((c) => (
              <TouchableOpacity
                key={c.value}
                style={[styles.chip, category === c.value && styles.chipActive]}
                onPress={() => setCategory(c.value)}
                disabled={sending}
              >
                <Text style={[styles.chipText, category === c.value && styles.chipTextActive]}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sectionLabel}>Your message</Text>
          <TextInput
            style={styles.input}
            placeholder="Tell us what happened or what you would like to see..."
            placeholderTextColor="#94A3B8"
            value={message}
            onChangeText={(t) => {
              setMessage(t);
              if (status?.type === 'error') setStatus(null);
            }}
            multiline
            maxLength={MAX_LENGTH}
            textAlignVertical="top"
            editable={!sending}
          />
          <Text style={styles.counter}>
            {trimmed.length}/{MAX_LENGTH}
          </Text>
          <Text style={styles.privacyNote}>
            Please do not include passwords, card numbers, or account balances. Only the Payton admin team can read this.
          </Text>

          <TouchableOpacity style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]} onPress={handleSend} disabled={!canSend}>
            {sending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="send" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.sendBtnText}>Send feedback</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5fcfa' },
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
  headerTitleCentered: { flex: 1, textAlign: 'center', fontSize: 20, fontWeight: '800', color: '#ffffff', letterSpacing: -0.5 },
  scrollContent: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 40 },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', marginBottom: 12, letterSpacing: 0.5 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0' },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: '#475569' },
  chipTextActive: { color: '#FFFFFF' },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    minHeight: 160,
    fontSize: 15,
    color: '#1E293B',
  },
  counter: { alignSelf: 'flex-end', fontSize: 12, color: '#94A3B8', marginTop: 6 },
  privacyNote: { fontSize: 12, color: '#64748B', marginTop: 8, lineHeight: 18 },
  sendBtn: { marginTop: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.headerDark, paddingVertical: 15, borderRadius: 28 },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 14, marginBottom: 20, borderWidth: 1 },
  bannerSuccess: { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
  bannerError: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  bannerText: { flex: 1, fontSize: 13, fontWeight: '600' },
});
