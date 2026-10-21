const assert=require('node:assert/strict');
const fs=require('node:fs');
const {initializeApp,deleteApp}=require('firebase/app');
const {getFirestore,connectFirestoreEmulator,doc,updateDoc}=require('firebase/firestore');
const project='demo-community-hidden',endpoint='http://127.0.0.1:8097';
const val=x=>typeof x==='boolean'?{booleanValue:x}:{stringValue:String(x)};
async function seed(path,data){const r=await fetch(endpoint+'/v1/projects/'+project+'/databases/(default)/documents/'+path,{method:'PATCH',headers:{Authorization:'Bearer owner','Content-Type':'application/json'},body:JSON.stringify({fields:Object.fromEntries(Object.entries(data).map(([k,v])=>[k,val(v)]))})});assert.ok(r.ok,await r.text());}
(async()=>{
 for(const [uid,role] of [['owner','user'],['admin','admin'],['super','superAdmin']])await seed('users/'+uid,{role,adminCity:'sydney',isActive:true});
 const apps=[];let checks=0;
 for(const uid of ['owner','admin','super']){
  const app=initializeApp({projectId:project,apiKey:'fake',appId:uid},uid);apps.push(app);const db=getFirestore(app);connectFirestoreEmulator(db,'127.0.0.1',8097,{mockUserToken:{sub:uid,user_id:uid,firebase:{sign_in_provider:'phone'}}});
  await seed('events/event',{createdByUserId:'owner',metroArea:'sydney',hidden:true,eventType:'Event'});
  const restore=updateDoc(doc(db,'events','event'),{hidden:false});
  if(uid==='owner')await restore;else await assert.rejects(restore,error=>error.code==='permission-denied');checks++;
  await seed('events/event',{createdByUserId:'owner',metroArea:'sydney',hidden:true,eventType:'Event'});
  const edit=updateDoc(doc(db,'events','event'),{eventType:'Edited'});
  if(uid==='owner')await edit;else await assert.rejects(edit,error=>error.code==='permission-denied');checks++;
  await seed('events/event',{createdByUserId:'owner',metroArea:'sydney',hidden:false,eventType:'Event'});
  await updateDoc(doc(db,'events','event'),{eventType:'Visible edit'});checks++;
 }
 await Promise.all(apps.map(deleteApp));console.log('PASS normal hidden event rules: '+checks+' owner/admin/superadmin restore and edit checks');
})().catch(error=>{console.error(error);process.exitCode=1;});
