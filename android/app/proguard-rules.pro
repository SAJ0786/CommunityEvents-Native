# App-specific R8 rules. React Native and dependencies provide consumer rules.
# Keep only reflection entry points demonstrated to require additional rules.

# Expo SDK 54 Record options use Field.key() reflectively (audio, pickers).
# Backport upstream expo/expo#51206: a renamed Field annotation can return a
# null key in optimized release builds, rejecting valid native option maps.
-keep @interface expo.modules.kotlin.records.Field { *; }

# expo-notifications 0.32.17 ships this consumer rule but does not register it
# in its Android build.gradle (expo/expo#45292, #45974). Scheduled requests are
# serialized and parcelled; retain their native model/trigger implementations.
-keep class expo.modules.notifications.** { *; }
