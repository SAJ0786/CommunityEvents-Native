import React, { useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, Text } from 'react-native';
import { getAuthenticationDiagnosticReport } from '../services/diagnostics/authFailures';
import { colors, spacing } from '../theme';

export default function AuthDiagnosticReportButton() {
  const [busy, setBusy] = useState(false);
  const shareReport = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const message = await getAuthenticationDiagnosticReport();
      await Share.share({ title: 'Community Connect sign-in diagnostics', message });
    } catch {
      Alert.alert('Report unavailable', 'Could not open the diagnostic report. Please try again.');
    } finally { setBusy(false); }
  };
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Share sign-in diagnostic report"
      accessibilityHint="Share error codes and app configuration, without phone numbers, verification codes or API keys."
      disabled={busy} onPress={shareReport} style={styles.button}>
      <Text style={styles.text}>{busy ? 'Preparing report…' : 'Share diagnostic report'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 44, paddingVertical: spacing.sm, justifyContent: 'center' },
  text: { color: colors.tealDark, fontSize: 14, textDecorationLine: 'underline' },
});
