// components/KeyboardAwareModal.tsx
// Bottom-sheet modal that rides ABOVE the keyboard instead of being covered by it.
// Replaces every hand-rolled <Modal> + overlay + sheet in home / transactions / income.
import { styles as p } from '@/constants/ui.styles';
import { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView } from 'react-native';

type Props = {
  visible: boolean;
  onClose: () => void;
  onShow?: () => void;
  children: ReactNode;
};

export function KeyboardAwareModal({ visible, onClose, onShow, children }: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} onShow={onShow} statusBarTranslucent>
      {/* 'padding' on both platforms: Android is edge-to-edge in current Expo, so the window no
          longer resizes for the keyboard. If you opted out of edge-to-edge and see a double gap
          on Android, change the Android behavior to undefined. */}
      <KeyboardAvoidingView style={p.flex1} behavior="padding">
        <Pressable style={p.modalOverlay} onPress={onClose}>
          {/* Inner Pressable swallows taps so touching the sheet doesn't close it. */}
          <Pressable style={p.modalSheet} onPress={() => {}}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              {children}
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}