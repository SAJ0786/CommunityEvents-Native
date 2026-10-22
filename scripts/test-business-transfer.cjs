const test=require('node:test');
const assert=require('node:assert/strict');
const {createTransfer}=require('../backend/functions-business-workflow/business-transfer');
class HttpsError extends Error {constructor(code,message){super(message);this.code=code;}}
function fixture(change={}) {
  let serial=0;
  const records=new Map(Object.entries({
    'users/admin':{role:'admin',defaultCity:'sydney',isActive:true},
    'users/new':{fullName:'New Owner',phone:'0400000000',email:'new@example.test',defaultCity:'sydney',isActive:true},
    'businesses/shop':{name:'Shop',ownerId:'old',ownerEmail:'old@example.test',status:'approved',hidden:false,location:{city:'sydney'},submittedAt:'original',lastSubmittedBy:'old',abn:'unchanged'},
    'businessPromotions/offer':{businessId:'shop',ownerId:'old',status:'active',title:'Offer'},
    'businessPromotions/history':{businessId:'shop',ownerId:'old',status:'archived',title:'History'},
    'businessPromotions/other':{businessId:'other',ownerId:'old'},
    'publicBusinesses/shop':{name:'Shop',status:'approved'},
    'businessContactRoutes/shop':{ownerUid:'old',active:true},
    'businessMessageThreads/history':{participantUids:['old','customer'],ownerUid:'old'},
    ...change,
  }));
  const ref=path=>({path});
  const collection=path=>({doc:id=>ref(`${path}/${id||`audit-${++serial}`}`),where:(field,op,value)=>({limit:max=>({collection:path,field,value,max})})});
  const snapshot=reference=>({exists:records.has(reference.path),data:()=>records.get(reference.path),ref:reference});
  const writes=[];
  const db={collection,runTransaction:async fn=>{
    const pending=[];
    const result=await fn({get:async reference=>reference.path?snapshot(reference):(()=>{const docs=[...records].filter(([path,row])=>path.startsWith(reference.collection+'/')&&row[reference.field]===reference.value).slice(0,reference.max).map(([path])=>snapshot(ref(path)));return {docs,size:docs.length};})(),
      update:(reference,value)=>pending.push([reference.path,{...records.get(reference.path),...value}]),set:(reference,value)=>pending.push([reference.path,value])});
    pending.forEach(([path,value])=>{records.set(path,value);writes.push(path);});return result;
  }};
  return {records,writes,run:createTransfer({db,admin:{firestore:{FieldValue:{serverTimestamp:()=> 'NOW'}}},HttpsError}),request:{auth:{uid:'admin'},data:{businessId:'shop',toUid:'new',expectedOwnerId:'old',confirmation:'TRANSFER BUSINESS'}}};
}
test('business transfer atomically moves listing/promotions and new enquiry routing, retaining public content and old conversations',async()=>{
 const f=fixture(),publicBefore=structuredClone(f.records.get('publicBusinesses/shop')),threadBefore=structuredClone(f.records.get('businessMessageThreads/history'));
 const result=await f.run(f.request);assert.equal(result.promotionsTransferred,2);
 const business=f.records.get('businesses/shop');assert.equal(business.ownerId,'new');assert.equal(business.ownerEmail,'new@example.test');assert.equal(business.originalOwnerId,'old');assert.equal(business.status,'approved');assert.equal(business.submittedAt,'original');assert.equal(business.lastSubmittedBy,'old');assert.equal(business.abn,'unchanged');
 for(const id of ['offer','history'])assert.equal(f.records.get('businessPromotions/'+id).ownerId,'new');
 assert.equal(f.records.get('businessPromotions/other').ownerId,'old');assert.equal(f.records.get('businessContactRoutes/shop').ownerUid,'new');
 assert.deepEqual(f.records.get('publicBusinesses/shop'),publicBefore);assert.deepEqual(f.records.get('businessMessageThreads/history'),threadBefore);
 const audit=[...f.records].find(([path])=>path.startsWith('businessAudit/'))[1];assert.equal(audit.actorId,'admin');assert.equal(audit.fromUid,'old');assert.equal(audit.toUid,'new');
});
test('transfer never unhides or approves a private/pending listing',async()=>{
 const f=fixture();Object.assign(f.records.get('businesses/shop'),{status:'pending',hidden:true,hasPublishedVersion:true});await f.run(f.request);
 assert.equal(f.records.get('businesses/shop').status,'pending');assert.equal(f.records.get('businesses/shop').hidden,true);assert.equal(f.records.get('businessContactRoutes/shop').active,false);
});
test('unauthorised, stale, unavailable and same-owner transfers make no partial writes',async()=>{
 for(const change of [
   f=>{f.request.auth=null;},f=>{f.request.data.confirmation='';},f=>{f.records.get('users/admin').role='user';},
   f=>{f.records.get('users/admin').isActive=false;},f=>{f.records.get('businesses/shop').location.city='melbourne';},
   f=>{f.records.get('users/new').defaultCity='melbourne';},f=>{f.records.get('users/new').isActive=false;},f=>{f.records.get('users/new').migratedToUid='other';},
   f=>{f.records.delete('users/new');},f=>{f.records.delete('businesses/shop');},f=>{f.request.data.expectedOwnerId='stale';},
   f=>{f.request.data.toUid='old';},f=>{f.records.get('businesses/shop').status='archived';},f=>{f.records.get('businesses/shop').status='deleted';},
 ]) {const f=fixture();change(f);await assert.rejects(f.run(f.request));assert.equal(f.writes.length,0);}
});
test('superadmin may transfer across city scope and oversized promotion set fails atomically',async()=>{
 const f=fixture();f.records.get('users/admin').role='superAdmin';f.records.get('users/new').defaultCity='melbourne';await f.run(f.request);assert.equal(f.records.get('businesses/shop').ownerId,'new');
 const g=fixture();for(let i=0;i<401;i++)g.records.set('businessPromotions/p'+i,{businessId:'shop',ownerId:'old'});
 await assert.rejects(g.run(g.request),error=>error.code==='resource-exhausted');assert.equal(g.writes.length,0);
});
