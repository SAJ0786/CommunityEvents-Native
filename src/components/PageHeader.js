import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import NativeBackButton from './NativeBackButton';
import { colors, panelTones, radius, shadow, spacing, typography } from '../theme';

/**
 * Shared screen-level header panel. Every screen renders the same structure
 * (icon chip + eyebrow + title + subtitle on a soft rounded, decorated
 * surface) so the app has one consistent panel language. Pages differentiate
 * themselves only through `tone` (an accent from `panelTones`) and `icon`.
 */
export default function PageHeader({
  title,
  subtitle,
  eyebrow = 'COMMUNITY EVENTS',
  icon = 'shape-outline',
  tone = 'teal',
  onBack,
  backAccessibilityLabel = 'Back',
  children,
  footer,
  style,
}) {
  const palette = panelTones[tone] || panelTones.teal;
  return (
    <View style={[styles.header, { backgroundColor: palette.surface, borderColor: palette.border }, style]}>
      <View style={[styles.glowLarge, { backgroundColor: palette.glow }]} />
      <View style={[styles.glowSmall, { backgroundColor: palette.glowSoft }]} />
      <View style={styles.row}>
        {onBack ? <NativeBackButton onPress={onBack} accessibilityLabel={backAccessibilityLabel} /> : null}
        <View style={[styles.iconChip, { backgroundColor: palette.chipBg, borderColor: palette.chipBorder }]}>
          <MaterialCommunityIcons name={icon} color={palette.icon} size={22} />
        </View>
        <View style={styles.copy}>
          {eyebrow ? <Text maxFontSizeMultiplier={1.2} style={[styles.eyebrow, { color: palette.icon }]}>{eyebrow}</Text> : null}
          <Text accessibilityRole="header" maxFontSizeMultiplier={1.2} style={styles.title}>{title}</Text>
        </View>
        {children ? <View style={styles.actions}>{children}</View> : null}
      </View>
      {subtitle ? <Text numberOfLines={2} maxFontSizeMultiplier={1.2} style={styles.subtitle}>{subtitle}</Text> : null}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    position: 'relative',
    overflow: 'hidden',
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: spacing.sm,
    ...shadow,
  },
  glowLarge: { position: 'absolute', width: 130, height: 130, borderRadius: 65, right: -35, top: -70 },
  glowSmall: { position: 'absolute', width: 72, height: 72, borderRadius: 36, right: 58, bottom: -54 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  iconChip: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  actions: { flexDirection: 'row', alignItems: 'center' },
  footer: { marginTop: spacing.sm },
  eyebrow: { ...typography.eyebrow },
  title: { color: colors.navy, ...typography.pageTitle, marginTop: 0 },
  subtitle: { color: colors.muted, ...typography.subtitle, marginTop: spacing.xs },
});
