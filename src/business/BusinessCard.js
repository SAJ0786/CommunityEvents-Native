import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadow, spacing } from '../theme';

const fallbackBusinessImage = require('../../assets/business-placeholder.png');

function TierBadge({ tier }) {
  if (tier === 'free') return null;
  const featured = tier === 'featured';
  return (
    <View style={[styles.tierBadge, featured ? styles.featuredBadge : styles.standardBadge]}>
      <Text style={[styles.tierText, featured ? styles.featuredText : styles.standardText]}>
        {featured ? '\u2605 SPONSORED' : 'STANDARD'}
      </Text>
    </View>
  );
}

export default function BusinessCard({ business, saved = false, onPress, onToggleSaved }) {
  const [imageFailed, setImageFailed] = useState(false);
  const promotionPulse = useRef(new Animated.Value(1)).current;
  const imageUrl = business.coverUrl || business.logoUrl;
  useEffect(() => {
    if (!business.hasActivePromotion) return undefined;
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(promotionPulse, { toValue: 0.35, duration: 650, useNativeDriver: true }),
      Animated.timing(promotionPulse, { toValue: 1, duration: 650, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [business.hasActivePromotion, promotionPulse]);
  return (
    <View style={styles.card}>
      <Pressable onPress={onPress} style={({ pressed }) => [styles.openArea, pressed && styles.pressed]}>
        <View style={[styles.cover, { backgroundColor: business.coverColor || colors.teal }]}> 
          <Image
            source={!imageFailed && imageUrl ? { uri: imageUrl } : fallbackBusinessImage}
            onError={() => setImageFailed(true)}
            resizeMode="cover"
            style={[styles.coverImage, (!imageUrl || imageFailed) && styles.fallbackImage]}
          />
          <View style={styles.coverAccent} />
          {business.hasActivePromotion ? <Animated.View style={[styles.promotionBadge, { opacity: promotionPulse }]}><Text style={styles.promotionBadgeText}>{'\u{1F3F7}\uFE0F'} PROMO</Text></Animated.View> : null}
        </View>
        <View style={styles.copy}>
          <View style={styles.badgeRow}>
            <TierBadge tier={business.tier} />
            {business.verificationBadge ? <View style={styles.organisationBadge}><Text style={styles.organisationText}>{business.verificationBadge}</Text></View> : null}
          </View>
          <Text numberOfLines={2} style={styles.name}>{business.name}</Text>
          <Text numberOfLines={1} style={styles.category}>{business.category}</Text>
          <View style={styles.metaRow}>
            {business.distanceKm != null ? <Text style={styles.meta}>{business.distanceKm} km</Text> : null}
            {typeof business.openNow === 'boolean' ? (
              <Text style={[styles.meta, business.openNow ? styles.open : styles.closed]}>
                {business.openNow ? 'Open' : 'Closed'}
              </Text>
            ) : null}
          </View>
        </View>
      </Pressable>
      <Pressable
        accessibilityLabel={saved ? 'Remove business from Favourites' : 'Add business to Favourites'}
        accessibilityRole="button"
        onPress={onToggleSaved}
        style={({ pressed }) => [styles.saveButton, saved && styles.saveButtonActive, pressed && styles.pressed]}
      >
        <Text maxFontSizeMultiplier={1} style={[styles.saveIcon, saved && styles.saveIconActive]}>{saved ? '\u2665' : '\u2661'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    ...shadow,
  },
  openArea: { flex: 1 },
  cover: {
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  coverAccent: {
    position: 'absolute',
    width: 90,
    height: 90,
    right: -28,
    bottom: -46,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.13)',
  },
  promotionBadge: { position: 'absolute', left: 7, bottom: 7, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 99, backgroundColor: '#fff0d4' },
  promotionBadgeText: { color: '#9a5c05', fontSize: 8.5, fontWeight: '900' },
  coverImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  fallbackImage: { padding: 18, backgroundColor: '#eaf7f5' },
  initials: { color: '#ffffff', fontSize: 28, fontWeight: '900', letterSpacing: 1 },
  copy: { padding: spacing.md },
  badgeRow: { minHeight: 22, flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  tierBadge: { borderRadius: 99, paddingHorizontal: 7, paddingVertical: 3 },
  featuredBadge: { backgroundColor: '#fff0d4' },
  standardBadge: { backgroundColor: colors.tealSoft },
  tierText: { fontSize: 9, fontWeight: '900' },
  featuredText: { color: '#9a5c05' },
  standardText: { color: colors.tealDark },
  organisationBadge: { borderRadius: 99, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: '#eef3f2' },
  organisationText: { color: colors.muted, fontSize: 9, fontWeight: '800' },
  name: { minHeight: 39, marginTop: 6, color: colors.navy, fontSize: 15, lineHeight: 19, fontWeight: '900' },
  category: { marginTop: 3, color: colors.muted, fontSize: 11, fontWeight: '700' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: spacing.sm },
  meta: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  open: { color: '#318342' },
  closed: { color: colors.danger },
  saveButton: {
    position: 'absolute',
    right: 8,
    top: 8,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
    backgroundColor: 'rgba(255,255,255,0.94)',
  },
  saveButtonActive: { backgroundColor: '#fff0f4' },
  saveIcon: { color: colors.muted, fontSize: 25, lineHeight: 28, fontWeight: '900' },
  saveIconActive: { color: '#d43867' },
  pressed: { opacity: 0.78 },
});
