// components/CategoryDropdown.tsx
// Expense-category picker: a field that expands into a list INSIDE the modal.
// (No nested <Modal>, which misbehaves on iOS and fights the keyboard.)
import { theme } from '@/constants/theme';
import { dropdownStyles as d } from '@/constants/ui.styles';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Keyboard, ScrollView, Text, TouchableOpacity, View } from 'react-native';

export type CategoryOption = { id: string; name: string };

type Props = {
  categories: CategoryOption[];
  value: string | null;            // selected category id
  onChange: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
};

export function CategoryDropdown({ categories, value, onChange, placeholder = 'Select category', disabled }: Props) {
  const [open, setOpen] = useState(false);
  const selected = categories.find((c) => c.id === value);

  const toggle = () => {
    Keyboard.dismiss(); // close the keyboard so the list isn't hidden behind it
    setOpen((o) => !o);
  };

  return (
    <View>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={toggle}
        disabled={disabled}
        style={[d.trigger, open && d.triggerOpen, disabled && d.triggerDisabled]}
      >
        <View style={d.triggerLeft}>
          <Ionicons name="pricetag-outline" size={16} color={theme.colors.textMuted} />
          <Text style={[d.triggerText, !selected && d.placeholder]} numberOfLines={1}>
            {selected ? selected.name : placeholder}
          </Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.textMuted} />
      </TouchableOpacity>

      {open && (
        <View style={d.list}>
          <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {categories.length === 0 && <Text style={d.empty}>No categories yet</Text>}
            {categories.map((c) => {
              const active = c.id === value;
              return (
                <TouchableOpacity
                  key={c.id}
                  style={[d.item, active && d.itemSelected]}
                  onPress={() => { onChange(c.id); setOpen(false); }}
                >
                  <Text style={[d.itemText, active && d.itemTextSelected]}>{c.name}</Text>
                  {active && <Ionicons name="checkmark" size={18} color={theme.colors.mintPillText} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}
    </View>
  );
}