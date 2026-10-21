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
function audioFixture(fail=false,manualPlayRequest=0,options={}){
  const slots=[],effects=[],cleanups=new Map(),errors=[],calls=[];let index=0,notification,tree;
  const changed=(before,after)=>!before||after.some((v,i)=>!Object.is(v,before[i]));
  const react={createElement:(type,props,...children)=>({type,props:{...props,children}}),useRef:value=>{const n=index++;return slots[n]||=({current:value});},useState:value=>{const n=index++;if(!(n in slots))slots[n]=value;return[slots[n],v=>{slots[n]=typeof v==='function'?v(slots[n]):v;}];},
    useCallback:(fn,deps)=>{const n=index++;if(changed(slots[n]?.deps,deps))slots[n]={fn,deps};return slots[n].fn;},
    useEffect:(fn,deps)=>{const n=index++;if(changed(slots[n],deps)){slots[n]=deps;effects.push(()=>{cleanups.get(n)?.();const cleanup=fn();if(cleanup)cleanups.set(n,cleanup);});}}
  };
  const player={addListener:(name,fn)=>{calls.push(name);return{remove:()=>calls.push('remove-status')};},seekTo:async()=>calls.push('seek'),play:()=>calls.push('play'),pause:()=>calls.push('pause'),remove:()=>calls.push('remove-player')};
  const mocks={react,'react-native':{Alert:{alert:(...args)=>calls.push(['alert',...args])},Pressable:'Pressable',Text:'Text',View:'View',StyleSheet:{create:v=>v}},'expo-audio':{createAudioPlayer:source=>{calls.push(['source',source]);calls.push('create');if(fail)throw Object.assign(new Error('Native player unavailable'),{code:'ERR_UNEXPECTED'});return player;},setAudioModeAsync:async value=>{calls.push(['audio-mode',value]);if(options.audioMode)await options.audioMode();}},'expo-notifications':{getLastNotificationResponseAsync:async()=>null,addNotificationResponseReceivedListener:fn=>{notification=fn;return{remove(){}};}},'../theme':require('./theme-fixture.cjs'),'../services/diagnostics':{recordNonFatalError:(e,c)=>errors.push({code:e.code,...c})},'../services/azaanRecording':{getActiveAzaanRecording:options.recording|| (async()=>({source:{uri:'file://uploaded-azaan.mp3'},key:'uploaded-v1',uploaded:true}))}};
  const exports={};const code=babel.transformSync(fs.readFileSync(path.join(__dirname,'../src/components/AzaanPlaybackController.js'),'utf8'),{configFile:false,babelrc:false,plugins:['@babel/plugin-transform-react-jsx','@babel/plugin-transform-modules-commonjs']}).code;
  vm.runInNewContext(code,{exports,require:name=>{if(!(name in mocks))throw Error(name);return mocks[name];}});
  const render=(request=manualPlayRequest)=>{index=0;tree=exports.default({manualPlayRequest:request,onOpenHijriCalendar:()=>calls.push('calendar')});while(effects.length)effects.shift()();return tree;};
  render();
  const stop=node=>node?.props?.accessibilityLabel==='Stop Azaan'?node:(node?.props?.children||[]).flat(Infinity).map(stop).find(Boolean);
  return{get tree(){return tree;},render,calls,errors,stop:()=>stop(tree).props.onPress(),tap:()=>notification({notification:{request:{identifier:'alarm',content:{data:{kind:'azaan-alarm'}}}}}),cleanup:()=>cleanups.forEach(fn=>fn())};
}
test('home mounts without creating native audio and catches device audio failure on tap',async()=>{
 const f=audioFixture(true);assert.equal(f.tree,null);assert.equal(f.calls.includes('create'),false);await f.tap();assert.equal(f.errors[0].code,'ERR_UNEXPECTED');assert.equal(f.errors[0].operation,'open_azaan_player');assert.equal(f.calls.includes('play'),false);f.cleanup();
});
test('deliberate alarm tap creates player, plays and releases its listener and resource',async()=>{
 const f=audioFixture();await f.tap();assert.equal(f.calls.filter(x=>x==='create').length,1);assert.ok(f.calls.includes('play'));assert.ok(f.calls.includes('playbackStatusUpdate'));assert.ok(f.calls.some(x=>Array.isArray(x)&&x[0]==='audio-mode'&&x[1].playsInSilentMode===true));await f.tap();assert.equal(f.calls.filter(x=>x==='play').length,1);f.cleanup();assert.ok(f.calls.includes('remove-status'));assert.ok(f.calls.includes('remove-player'));assert.deepEqual(f.errors,[]);
});
test('manual request plays selected Azaan in silent mode without navigating',async()=>{
 const f=audioFixture(false,1);await new Promise(resolve=>setImmediate(resolve));assert.ok(f.calls.includes('play'));assert.equal(f.calls.includes('calendar'),false);assert.ok(f.calls.some(x=>Array.isArray(x)&&x[0]==='source'&&x[1].uri==='file://uploaded-azaan.mp3'));assert.ok(f.calls.some(x=>Array.isArray(x)&&x[0]==='audio-mode'&&x[1].playsInSilentMode===true));f.cleanup();assert.deepEqual(f.errors,[]);
});

test('failed manual playback is consumed once despite unrelated parent renders',async()=>{
 const f=audioFixture(true,1);await new Promise(setImmediate);assert.equal(f.errors.length,1);
 f.render(1);f.render(1);await new Promise(setImmediate);assert.equal(f.errors.length,1);assert.equal(f.calls.filter(x=>Array.isArray(x)&&x[0]==='alert').length,1);
 f.render(2);await new Promise(setImmediate);assert.equal(f.errors.length,2,'Only a new explicit request retries');f.cleanup();
});

test('Stop remains stopped across navigation renders and permits a later deliberate Play',async()=>{
 const f=audioFixture(false,1);await new Promise(setImmediate);f.render(1);await f.stop();
 assert.equal(f.render(1),null);f.render(1);await new Promise(setImmediate);assert.equal(f.calls.filter(x=>x==='play').length,1);
 f.render(2);await new Promise(setImmediate);assert.equal(f.calls.filter(x=>x==='play').length,2);f.cleanup();
});

test('Stop and unmount invalidate pending recording/audio-mode work without later playback or alerts',async()=>{
 for(const stage of ['recording','audioMode']){
  let finish;const pending=new Promise(resolve=>{finish=resolve;});
  const f=audioFixture(false,1,stage==='recording'?{recording:()=>pending}:{audioMode:()=>pending});
  await new Promise(setImmediate);f.render(1);await f.stop();finish({source:1,key:'bundled'});await new Promise(setImmediate);
  assert.equal(f.calls.includes('play'),false,stage);assert.equal(f.render(1),null);assert.deepEqual(f.errors,[]);f.cleanup();
 }
 let finish;const f=audioFixture(false,1,{recording:()=>new Promise(resolve=>{finish=resolve;})});f.cleanup();finish({source:1,key:'bundled'});await new Promise(setImmediate);assert.equal(f.calls.includes('create'),false);
});

test('optimized Android release keeps Expo record annotations and notification serialization models through prebuild',()=>{
 const root=path.resolve(__dirname,'..'),rules=fs.readFileSync(path.join(root,'android/app/proguard-rules.pro'),'utf8');
 const config=JSON.parse(fs.readFileSync(path.join(root,'app.json'),'utf8')).expo.plugins.find(p=>Array.isArray(p)&&p[0]==='expo-build-properties')[1].android;
 assert.equal(config.enableMinifyInReleaseBuilds,true);assert.equal(config.enableShrinkResourcesInReleaseBuilds,true);
 for(const rule of ['-keep @interface expo.modules.kotlin.records.Field { *; }','-keep class expo.modules.notifications.** { *; }']){
  assert.ok(rules.includes(rule));assert.ok(config.extraProguardRules.includes(rule));
 }
});
