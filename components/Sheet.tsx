// components/Sheet.tsx
// Shared bottom-sheet building blocks (extracted from app/(sponsorTabs)/home.tsx) so every
// modal in the app looks and behaves the same: Sheet, SheetActions, Banner, Field, DatePickerSheet.
import { Ionicons } from '@expo/vector-icons';
import { ReactNode, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { theme } from '../constants/theme';
import { sponsorHomeStyles as styles } from '../constants/ui.styles';

export type Msg = { type: 'error' | 'success'; text: string } | null;

/** iOS cannot present a second Modal until the first has finished dismissing. */
export const MODAL_SWAP_DELAY = Platform.OS === 'ios' ? 350 : 0;

export const AMOUNT_REGEX = /^\d+(\.\d{1,2})?$/;

/* ---------- Banner (submit / server messages, shown inside the sheet) ---------- */
export function Banner({ message }: { message: Msg }) {
  if (!message) return null;
  const ok = message.type === 'success';
  return (
    <View style={[styles.banner, ok ? styles.bannerSuccess : styles.bannerError]}>
      <Ionicons
        name={ok ? 'checkmark-circle' : 'alert-circle'}
        size={16}
        color={ok ? theme.colors.success : theme.colors.danger}
      />
      <Text style={[styles.bannerText, { color: ok ? theme.colors.success : theme.colors.danger }]}>
        {message.text}
      </Text>
    </View>
  );
}

/* ---------- Field: label + input + message right below the input ---------- */
export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
      {error ? (
        <View style={styles.fieldErrorRow}>
          <Ionicons name="alert-circle" size={13} color={theme.colors.danger} />
          <Text style={styles.fieldErrorText}>{error}</Text>
        </View>
      ) : hint ? (
        <Text style={styles.fieldHint}>{hint}</Text>
      ) : null}
    </View>
  );
}

/* ---------- Sheet ---------- */
export function Sheet({
  visible,
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Modal
      animationType="slide"
      transparent
      visible={visible}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetTitle}>{title}</Text>
              {subtitle ? <Text style={styles.sheetSubtitle}>{subtitle}</Text> : null}
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.sheetClose}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={18} color={theme.colors.textGray} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.sheetBody}
            contentContainerStyle={{ paddingBottom: 6 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>

          {footer ? <View style={styles.sheetFooter}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function SheetActions({
  onCancel,
  onSubmit,
  submitLabel,
  cancelLabel = 'Cancel',
  loading = false,
  disabled = false,
  danger = false,
}: {
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel: string;
  cancelLabel?: string;
  loading?: boolean;
  disabled?: boolean;
  danger?: boolean;
}) {
  const submitDisabled = loading || disabled;
  return (
    <View style={styles.actionsRow}>
      <TouchableOpacity
        style={styles.btnSecondary}
        onPress={onCancel}
        disabled={loading}
        activeOpacity={0.8}
      >
        <Text style={styles.btnSecondaryText}>{cancelLabel}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[
          styles.btnPrimary,
          danger && { backgroundColor: theme.colors.danger },
          submitDisabled && { opacity: 0.5 },
        ]}
        onPress={onSubmit}
        disabled={submitDisabled}
        activeOpacity={0.85}
      >
        {loading ? (
          <ActivityIndicator size="small" color={theme.colors.white} />
        ) : (
          <Text style={styles.btnPrimaryText}>{submitLabel}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

/* ---------- Date helpers (local time, "YYYY-MM-DD") ---------- */
export const toDateString = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const parseDateString = (s: string) => {
  const [y, m, d] = (s || '').split('-').map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  return isNaN(date.getTime()) ? new Date() : date;
};

export const formatDisplayDate = (s: string) =>
  s
    ? parseDateString(s).toLocaleDateString('en-US', { month: 'long', day: '2-digit', year: 'numeric' })
    : '';

/* ---------- Date picker field (the trigger that replaces a typed date input) ---------- */
export function DateButton({
  value,
  placeholder = 'Select a date',
  hasError = false,
  onPress,
}: {
  value: string;
  placeholder?: string;
  hasError?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.selectMemberButton, hasError && styles.inputError]}
      activeOpacity={0.7}
      onPress={onPress}
    >
      <Ionicons name="calendar-outline" size={18} color={theme.colors.dueGreen} />
      <Text
        style={[
          styles.selectMemberText,
          value ? { color: theme.colors.textStrong } : null,
        ]}
      >
        {value ? formatDisplayDate(value) : placeholder}
      </Text>
      <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
    </TouchableOpacity>
  );
}

/* ---------- Single-date picker sheet ---------- */
export function DatePickerSheet({
  visible,
  value,
  title = 'Select Date',
  subtitle = 'Tap a day to choose it.',
  onClose,
  onConfirm,
}: {
  visible: boolean;
  value: string;
  title?: string;
  subtitle?: string;
  onClose: () => void;
  onConfirm: (dateStr: string) => void;
}) {
  const [month, setMonth] = useState(() => parseDateString(value));
  const [temp, setTemp] = useState<string | null>(value || null);

  // Every time the picker opens, start from the current value.
  useEffect(() => {
    if (visible) {
      setMonth(parseDateString(value));
      setTemp(value || null);
    }
  }, [visible]);

  const shiftMonth = (delta: number) => {
    const next = new Date(month.getFullYear(), month.getMonth() + delta, 1);
    setMonth(next);
  };

  const renderCells = () => {
    const year = month.getFullYear();
    const m = month.getMonth();
    const firstDayIndex = new Date(year, m, 1).getDay();
    const totalDays = new Date(year, m + 1, 0).getDate();
    const todayStr = toDateString(new Date());

    const cells: ReactNode[] = [];
    for (let i = 0; i < firstDayIndex; i++) {
      cells.push(<View key={`empty-${i}`} style={styles.dayCellEmpty} />);
    }
    for (let day = 1; day <= totalDays; day++) {
      const dateStr = toDateString(new Date(year, m, day));
      const isToday = dateStr === todayStr;
      const isSelected = temp === dateStr;
      cells.push(
        <TouchableOpacity
          key={dateStr}
          activeOpacity={0.7}
          style={[styles.dayCell, isToday && styles.dayCellToday, isSelected && styles.dayCellSelected]}
          onPress={() => setTemp(dateStr)}
        >
          <Text
            style={[
              styles.dayCellText,
              isToday && styles.dayCellTextToday,
              isSelected && styles.dayCellTextSelected,
            ]}
          >
            {day}
          </Text>
        </TouchableOpacity>,
      );
    }
    return cells;
  };

  return (
    <Sheet
      visible={visible}
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      footer={
        <SheetActions
          onCancel={onClose}
          onSubmit={() => temp && onConfirm(temp)}
          submitLabel="Select Date"
          disabled={!temp}
        />
      }
    >
      <View style={styles.calendarNavRow}>
        <Text style={styles.calendarMonthTitle}>
          {month.toLocaleString('en-US', { month: 'long', year: 'numeric' })}
        </Text>
        <View style={styles.calendarArrowsContainer}>
          <TouchableOpacity style={styles.calendarArrowBtn} onPress={() => shiftMonth(-1)}>
            <Ionicons name="chevron-back" size={18} color={theme.colors.textStrong} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.calendarArrowBtn} onPress={() => shiftMonth(1)}>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.textStrong} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.weekDaysRow}>
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <Text key={d} style={styles.weekDayText}>{d}</Text>
        ))}
      </View>
      <View style={styles.daysGrid}>{renderCells()}</View>
    </Sheet>
  );
}
