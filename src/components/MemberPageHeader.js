import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import NativeBackButton from './NativeBackButton';
import { colors, spacing } from '../theme';

export default function MemberPageHeader({
  title,
  subtitle,
  onBack,
  backAccessibilityLabel,
  children,
  footer,
  style,
}) {
  return (
    <View style={[styles.header, style]}>
      <View style={styles.row}>
        {onBack ? <NativeBackButton accessibilityLabel={backAccessibilityLabel} onPress={onBack} /> : null}
        <View style={styles.copy}>
          <Text accessibilityRole="header" maxFontSizeMultiplier={1.2} style={styles.title}>{title}</Text>
          {subtitle ? <Text maxFontSizeMultiplier={1.2} style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {children ? <View style={styles.actions}>{children}</View> : null}
      </View>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  copy: { flex: 1, minWidth: 0 },
  actions: { flexDirection: 'row', alignItems: 'center' },
  footer: { marginTop: spacing.sm },
  title: { color: colors.navy, fontSize: 22, lineHeight: 27, fontWeight: '700' },
  subtitle: { color: colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '500', marginTop: 2 },
});
