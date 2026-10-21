const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const {resolveRuntimeVersionAsync}=require(path.join(root,'node_modules/expo-updates/utils/build/resolveRuntimeVersionAsync'));
const runtime=async platform=>(await resolveRuntimeVersionAsync(root,platform,{},{})).runtimeVersion;
(async()=>{
 const baseline=await runtime('android');assert.match(baseline,/^[a-f0-9]{40}$/);
 const js=path.join(root,'App.js'),originalJs=fs.readFileSync(js);
 try{fs.appendFileSync(js,'\n// Temporary OTA JavaScript compatibility probe.\n');assert.equal(await runtime('android'),baseline,'JavaScript-only changes must remain compatible');}finally{fs.writeFileSync(js,originalJs);}
 const native=path.join(root,'android/app/src/main/java/info/siza/communityevents/app/MainApplication.kt'),originalNative=fs.readFileSync(native);
 try{fs.appendFileSync(native,'\n// Temporary native-runtime compatibility probe.\n');assert.notEqual(await runtime('android'),baseline,'Native changes must get a different runtime');}finally{fs.writeFileSync(native,originalNative);}
 assert.equal(await runtime('android'),baseline,'Source must be restored after probes');
 const ios=await runtime('ios');assert.match(ios,/^[a-f0-9]{40}$/);
 console.log(JSON.stringify({otaRuntimeChecks:'passed',javascriptOnlyUpdateCompatible:true,nativeChangeIsolated:true,sourceRestored:true,androidRuntime:baseline,iosRuntime:ios}));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
