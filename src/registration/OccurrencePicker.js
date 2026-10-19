import React from 'react';
import {Pressable,Text,View} from 'react-native';
import {styles} from './RegistrationControls';
import {availableOccurrences} from './occurrenceSelection';
export default function OccurrencePicker({detail,places,selected,onChange,disabled}) {
  if (!detail.occurrences?.length) return null;
  const eligible=availableOccurrences(detail,places),all=eligible.length>0 && selected.length===eligible.length && eligible.every(row=>selected.includes(row.eventId));
  const choice=(key,label,checked,onPress,locked=false)=><Pressable key={key} accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{checked,disabled:disabled || locked}} disabled={disabled || locked} onPress={onPress} style={[styles.button,checked && styles.selected,(disabled || locked) && styles.disabled]}><Text style={styles.text}>{checked ? '☑ ' : '☐ '}{label}</Text></Pressable>;
  return <View style={styles.insetPanel}><Text style={styles.title}>Choose occurrences</Text><Text style={styles.muted}>Participant details and places apply to every selected date. Existing bookings on other dates stay unchanged.</Text>
    {choice('all','Select all available occurrences',all,()=>onChange(all ? [] : eligible.map(row=>row.eventId)),!eligible.length)}
    {detail.occurrences.map(row=>{const checked=selected.includes(row.eventId),available=eligible.some(item=>item.eventId===row.eventId);return choice(row.eventId,`${row.date}${row.startTime ? ` · ${row.startTime}` : ''}${!available ? ` — ${row.reason || 'Not enough places'}` : ` · ${row.availablePlaces} places available`}`,checked,()=>onChange(checked ? selected.filter(id=>id!==row.eventId) : [...selected,row.eventId]),!available && !checked);})}
    <Text style={styles.muted}>{selected.length} {selected.length===1 ? 'occurrence' : 'occurrences'} selected</Text>
  </View>;
}
