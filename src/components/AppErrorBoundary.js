import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../theme';
import { recordNonFatalError } from '../services/diagnostics';

export default class AppErrorBoundary extends React.Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    recordNonFatalError(error, { feature: 'react_render', component_stack: info?.componentStack || '' });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <View style={styles.root}>
        <Text style={styles.icon}>!</Text>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.text}>The issue has been recorded. Please try opening this screen again.</Text>
        <Pressable onPress={() => this.setState({ failed: false })} style={styles.button}>
          <Text style={styles.buttonText}>Try Again</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, backgroundColor: colors.background },
  icon: { width: 54, height: 54, borderRadius: 27, color: colors.surface, backgroundColor: colors.danger, fontSize: 32, lineHeight: 54, fontWeight: '900', textAlign: 'center' },
  title: { marginTop: spacing.lg, color: colors.navy, fontSize: 24, fontWeight: '900' },
  text: { maxWidth: 420, marginTop: spacing.sm, color: colors.muted, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  button: { minWidth: 160, minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: spacing.lg, borderRadius: radius.md, backgroundColor: colors.teal },
  buttonText: { color: colors.surface, fontSize: 15, fontWeight: '900' },
});
