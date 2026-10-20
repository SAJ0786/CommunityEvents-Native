const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const babel=require('@babel/core');
const {unresolved,verify}=require('./verify-ui-bindings.cjs');
test('source gate catches missing JSX imports and participant helpers',()=>{
  assert.equal(unresolved('export default () => <ActivityIndicator/>;').some(x=>x.includes('ActivityIndicator')),true);
  assert.equal(unresolved('export const preview = () => registrationFieldGroups([], 2);').some(x=>x.includes('registrationFieldGroups')),true);
  assert.deepEqual(unresolved("import {ActivityIndicator} from 'react-native'; export default () => <ActivityIndicator/>;"),[]);
  verify();
});
function audioFixture(fail=false,manualPlayRequest=0){
  const slots=[],effects=[],cleanups=[],errors=[],calls=[];let index=0,notification;
  const react={createElement:(type,props,...children)=>({type,props:{...props,children}}),useRef:value=>{const n=index++;return slots[n]||=( {current:value});},useState:value=>{const n=index++;if(!(n in slots))slots[n]=value;return[slots[n],v=>{slots[n]=typeof v==='function'?v(slots[n]):v;}];},useCallback:fn=>fn,useEffect:fn=>effects.push(fn)};
  const player={addListener:(name,fn)=>{calls.push(name);return{remove:()=>calls.push('remove-status')};},seekTo:async()=>calls.push('seek'),play:()=>calls.push('play'),pause:()=>calls.push('pause'),remove:()=>calls.push('remove-player')};
  const mocks={react,'react-native':{Alert:{alert:(...args)=>calls.push(['alert',...args])},Pressable:'Pressable',Text:'Text',View:'View',StyleSheet:{create:v=>v}},'expo-audio':{createAudioPlayer:()=>{calls.push('create');if(fail)throw Object.assign(new Error('Native player unavailable'),{code:'ERR_UNEXPECTED'});return player;},setAudioModeAsync:async options=>calls.push(['audio-mode',options])},'expo-notifications':{getLastNotificationResponseAsync:async()=>null,addNotificationResponseReceivedListener:fn=>{notification=fn;return{remove(){}};}},'../theme':require('./theme-fixture.cjs'),'../services/diagnostics':{recordNonFatalError:(e,c)=>errors.push({code:e.code,...c})},'../../assets/sounds/azan_mashad.mp3':1};
  const exports={};const code=babel.transformSync(fs.readFileSync(path.join(__dirname,'../src/components/AzaanPlaybackController.js'),'utf8'),{configFile:false,babelrc:false,plugins:['@babel/plugin-transform-react-jsx','@babel/plugin-transform-modules-commonjs']}).code;
  vm.runInNewContext(code,{exports,require:name=>{if(!(name in mocks))throw Error(name);return mocks[name];}});
  index=0;const tree=exports.default({manualPlayRequest,onOpenHijriCalendar:()=>calls.push('calendar')});while(effects.length){const cleanup=effects.shift()();if(cleanup)cleanups.push(cleanup);}
  return{tree,calls,errors,tap:()=>notification({notification:{request:{identifier:'alarm',content:{data:{kind:'azaan-alarm'}}}}}),cleanup:()=>cleanups.forEach(fn=>fn())};
}
test('home mounts without creating native audio and catches device audio failure on tap',async()=>{
 const f=audioFixture(true);assert.equal(f.tree,null);assert.equal(f.calls.includes('create'),false);await f.tap();assert.equal(f.errors[0].code,'ERR_UNEXPECTED');assert.equal(f.errors[0].operation,'open_azaan_player');assert.equal(f.calls.includes('play'),false);f.cleanup();
});
test('deliberate alarm tap creates player, plays and releases its listener and resource',async()=>{
 const f=audioFixture();await f.tap();assert.equal(f.calls.filter(x=>x==='create').length,1);assert.ok(f.calls.includes('play'));assert.ok(f.calls.includes('playbackStatusUpdate'));assert.ok(f.calls.some(x=>Array.isArray(x)&&x[0]==='audio-mode'&&x[1].playsInSilentMode===true));await f.tap();assert.equal(f.calls.filter(x=>x==='play').length,1);f.cleanup();assert.ok(f.calls.includes('remove-status'));assert.ok(f.calls.includes('remove-player'));assert.deepEqual(f.errors,[]);
});
test('manual request plays bundled Azaan in silent mode without navigating',async()=>{
 const f=audioFixture(false,1);await new Promise(resolve=>setImmediate(resolve));assert.ok(f.calls.includes('play'));assert.equal(f.calls.includes('calendar'),false);assert.ok(f.calls.some(x=>Array.isArray(x)&&x[0]==='audio-mode'&&x[1].playsInSilentMode===true));f.cleanup();assert.deepEqual(f.errors,[]);
});
