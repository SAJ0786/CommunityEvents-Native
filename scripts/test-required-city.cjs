const test=require('node:test'),assert=require('node:assert/strict');
const {createMemberRegistrationHandlers,LEGAL_VERSION}=require('../backend/functions-lifecycle/memberRegistration');
const req=data=>({auth:{uid:'member',token:{firebase:{sign_in_provider:'phone'}}},data});
function setup(profile={fullName:'Test Member',email:'member@example.test',role:'user'}) {
 let saved=profile;const writes=[];
 const db={collection:()=>({doc:()=>({})}),runTransaction:fn=>fn({get:async()=>({exists:!!saved,data:()=>saved,createTime:'JOINED'}),set:(_,p)=>{writes.push(p);saved={...saved,...p};}})};
 const api=createMemberRegistrationHandlers({db,auth:{getUser:async()=>({phoneNumber:'+61400000000'})},serverTimestamp:()=>'NOW',HttpsError:class extends Error{constructor(code,message){super(message);this.code=code;}}});
 return{...api,writes,saved:()=>saved};
}
test('city-only completion saves the explicit choice without changing identity role or join date',async()=>{
 const h=setup({fullName:'Test Member',email:'member@example.test',role:'superAdmin',registeredAt:'ORIGINAL'});await h.chooseCity(req({defaultCity:'canberra',role:'user',registeredAt:'FAKE'}));assert.equal(h.saved().defaultCity,'canberra');assert.equal(h.saved().role,'superAdmin');assert.equal(h.saved().registeredAt,'ORIGINAL');assert.deepEqual(Object.keys(h.writes[0]).sort(),['defaultCity','updatedAt']);
});
test('city cannot be skipped, fabricated, changed through onboarding or submitted anonymously',async()=>{
 for(const defaultCity of [undefined,'','fake-city'])await assert.rejects(setup().chooseCity(req({defaultCity})),{code:'invalid-argument'});
 await assert.rejects(setup({fullName:'Test Member',email:'x@y.test',defaultCity:'sydney'}).chooseCity(req({defaultCity:'perth'})),{code:'failed-precondition'});
 await assert.rejects(setup().chooseCity({data:{defaultCity:'sydney'}}),{code:'unauthenticated'});
});
test('new profile completion cannot omit city even when name email and consent are valid',async()=>{
 const h=setup(null),data={fullName:'New Member',email:'new@example.test',privacyAccepted:true,termsAccepted:true,legalVersion:LEGAL_VERSION};await assert.rejects(h.complete(req(data)),{code:'failed-precondition'});assert.equal(h.writes.length,0);await h.complete(req({...data,defaultCity:'melbourne',role:'superAdmin'}));assert.equal(h.saved().role,'user');assert.equal(h.saved().defaultCity,'melbourne');
});
