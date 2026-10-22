import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, spacing } from '../theme';
import { transferMemberCandidates, transferMemberContact, transferMemberName } from '../utils/adminUserSearch';

// Both event modules receive the same city-scoped members from the dashboard.
export default function TransferMemberPicker({ users = [], ownerUid, query, onQueryChange, selected, onSelect, loading = false, error = '', busy = false, onConfirm, onCancel, searchLabel = 'Search new organiser' }) {
  const candidates = loading || error ? [] : transferMemberCandidates(users, query, ownerUid);
  const canSubmit = !loading && !error && !busy && candidates.some(user => user.id === selected?.id);
  return <View style={styles.panel}>
    <Text style={styles.hint}>Type at least two characters, then select the new owner.</Text>
    <TextInput accessibilityLabel={searchLabel} placeholder="Search by name, phone number or email" placeholderTextColor={colors.muted}
      autoCapitalize="none" autoCorrect={false} value={query} editable={!busy}
      onChangeText={value => { onQueryChange(value); onSelect(null); }} style={styles.input}/>
    {loading ? <View style={styles.loading}><ActivityIndicator color={colors.tealDark}/><Text style={styles.hint}>Loading members…</Text></View> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>Could not refresh members. Close and reopen transfer to try again.</Text> : null}
    {!loading && !error && query.trim().length < 2 ? <Text style={styles.hint}>Enter at least two characters to search.</Text> : null}
    {!loading && !error && query.trim().length >= 2 && !candidates.length ? <Text style={styles.hint}>No matching active members found.</Text> : null}
    {candidates.length ? <View style={styles.dropdown}>{candidates.map(member => {
      const chosen = member.id === selected?.id;
      return <Pressable key={member.id} accessibilityRole="button" accessibilityState={{selected:chosen,disabled:busy}} disabled={busy}
        onPress={() => onSelect(member)} style={[styles.result,chosen && styles.selected]}>
        <View style={styles.textWrap}>
          <Text style={[styles.name,chosen && styles.selectedText]}>{transferMemberName(member)}</Text>
          <Text style={[styles.contact,chosen && styles.selectedText]}>{transferMemberContact(member)}</Text>
        </View>
        {chosen ? <Text style={styles.check}>✓</Text> : null}
      </Pressable>;
    })}</View> : null}
    <View style={styles.actions}>
      <Pressable accessibilityRole="button" disabled={!canSubmit} onPress={() => { if (canSubmit) onConfirm(selected); }} style={[styles.button,styles.primary,!canSubmit && styles.disabled]}>
        <Text style={styles.primaryText}>{busy ? 'Transferring…' : selected ? `Transfer to ${transferMemberName(selected)}` : 'Select a member'}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" disabled={busy} onPress={onCancel} style={[styles.button,styles.cancel]}><Text style={styles.cancelText}>Cancel</Text></Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  panel:{gap:spacing.sm},hint:{color:colors.muted,fontSize:13,lineHeight:19},
  input:{padding:spacing.md,borderWidth:1,borderColor:colors.border,borderRadius:12,color:colors.navy,backgroundColor:colors.surface},
  loading:{flexDirection:'row',alignItems:'center',gap:spacing.sm},error:{color:colors.danger},
  dropdown:{overflow:'hidden',borderWidth:1,borderColor:colors.border,borderRadius:12,backgroundColor:colors.surface},
  result:{minHeight:54,flexDirection:'row',alignItems:'center',gap:spacing.sm,paddingHorizontal:spacing.md,paddingVertical:spacing.sm,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},
  selected:{backgroundColor:colors.teal},textWrap:{flex:1,minWidth:0},name:{color:colors.navy,fontSize:14,fontWeight:'700'},
  contact:{color:colors.muted,fontSize:13,lineHeight:19},selectedText:{color:colors.surface},check:{color:colors.surface,fontSize:18,fontWeight:'700'},
  actions:{flexDirection:'row',flexWrap:'wrap',gap:spacing.sm},button:{paddingHorizontal:spacing.md,paddingVertical:spacing.sm,borderRadius:12,justifyContent:'center',minHeight:44},
  primary:{backgroundColor:colors.teal,flexGrow:1},primaryText:{color:colors.surface,fontWeight:'700',textAlign:'center'},disabled:{opacity:0.45},
  cancel:{borderWidth:1,borderColor:colors.border,backgroundColor:colors.surface},cancelText:{color:colors.tealDark,fontWeight:'700'},
});
