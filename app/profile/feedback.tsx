// app/profile/feedback.tsx - Send Feedback screen
// Validation shows below the message box; send results show in an inline banner under it.
// Supabase / submit logic is unchanged.
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

import { FieldLabel, FormField } from '../../components/profile/FormField';
import InlineMessage, { FormMessage } from '../../components/profile/InlineMessage';
import PrimaryButton from '../../components/profile/PrimaryButton';
import ProfileScreen from '../../components/profile/ProfileScreen';
import { theme } from '../../constants/theme';
import { incomeStyles, monitoringStyles, profileStyles } from '../../constants/ui.styles';
import { supabase } from '../../lib/supabase';

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
  const [messageError, setMessageError] = useState<string | null>(null);
  const [result, setResult] = useState<FormMessage>(null);
  const locked = useRef(false); // blocks a second tap before the first request finishes

  const trimmed = message.trim();

  async function handleSend() {
    if (locked.current) return;
    if (trimmed.length < MIN_LENGTH) {
      setMessageError(`Please write at least ${MIN_LENGTH} characters.`);
      return;
    }
    locked.current = true;
    setSending(true);
    setResult(null);
    setMessageError(null);

    // user_id is filled in by the database from the signed-in session; it is never sent from here.
    const { error } = await supabase.from('user_feedback').insert({ category, message: trimmed });

    locked.current = false;
    setSending(false);

    if (error) {
      const known =
        error.message.includes('already sent') || error.message.includes('limit reached') ? error.message : null;
      setResult({
        type: 'error',
        message: known ?? 'Could not send your feedback. Please check your connection and try again.',
      });
      return;
    }
    setMessage('');
    setCategory('other');
    setResult({ type: 'success', message: 'Thank you! Your feedback was sent to the Payton team.' });
  }

  return (
    <ProfileScreen
      title="Send Feedback"
      onBack={() => router.back()}
      keyboardAware
      footer={
        <PrimaryButton label="Send feedback" icon="send" onPress={handleSend} loading={sending} />
      }
    >
      <View style={profileStyles.modernCardGroup}>
        <FieldLabel>Category</FieldLabel>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[8], marginBottom: theme.space[24] }}>
          {CATEGORIES.map((c) => {
            const active = category === c.value;
            return (
              <TouchableOpacity
                key={c.value}
                style={[monitoringStyles.filterChip, active && monitoringStyles.filterChipActive]}
                onPress={() => setCategory(c.value)}
                disabled={sending}
                accessibilityRole="button"
                accessibilityState={{ selected: active, disabled: sending }}
              >
                <Text style={[monitoringStyles.filterChipText, active && monitoringStyles.filterChipTextActive]}>
                  {c.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <FormField
          label="Your message"
          placeholder="Tell us what happened or what you would like to see..."
          value={message}
          onChangeText={(t) => {
            setMessage(t);
            if (messageError) setMessageError(null);
            if (result) setResult(null);
          }}
          error={messageError}
          counter={`${trimmed.length}/${MAX_LENGTH}`}
          multiline
          maxLength={MAX_LENGTH}
          editable={!sending}
        />

        {result ? (
          <InlineMessage
            type={result.type}
            message={result.message}
            onDismiss={() => setResult(null)}
          />
        ) : null}

        {/* Privacy note */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            backgroundColor: theme.colors.surfaceAlt,
            borderRadius: 14,
            padding: theme.space[12],
          }}
        >
          <Ionicons
            name="lock-closed-outline"
            size={16}
            color={theme.colors.textMuted}
            style={{ marginRight: theme.space[8], marginTop: 1 }}
          />
          <Text style={[incomeStyles.toggleSubtext, { flex: 1, lineHeight: 18 }]}>
            Please do not include passwords, card numbers, or account balances. Only the Payton admin team can read this.
          </Text>
        </View>
      </View>
    </ProfileScreen>
  );
}
