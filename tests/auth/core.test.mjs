import test from "node:test";
import assert from "node:assert/strict";
import {OtpFlow,validateConfig,normalizeCode,normalizeEmail,errorText,PROJECT_URL,PROJECT_NAME,THROTTLE_KEY} from "../../auth-test/auth-core.mjs";
import {createRepository} from "../../auth-test/data.mjs";
function fixture(overrides={}) {
 let time=1000000; const values=new Map(),calls=[];
 const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
 const auth={signInWithOtp:async args=>{calls.push(args);return {error:null};},verifyOtp:async args=>{calls.push(args);return {data:{session:{user:{id:"a"}}},error:null};},...overrides};
 const flow=new OtpFlow(auth,{storage,now:()=>time});
 return {flow,auth,storage,values,calls,advance:seconds=>{time+=seconds*1000;},restore:()=>new OtpFlow(auth,{storage,now:()=>time})};
}
test("configuration restricts the project and permits publishable keys only",()=>{
 const good={projectName:PROJECT_NAME,supabaseUrl:PROJECT_URL,publishableKey:"sb_publishable_abcdefghijklmnopqrst"};
 assert.doesNotThrow(()=>validateConfig(good));
 for(const key of ["REPLACE_WITH_KEY","eyJhbGciOiJIUzI1NiJ9","sb_secret_"+"abcdefghijklmnopqrst",""]) assert.throws(()=>validateConfig({...good,publishableKey:key}));
 assert.throws(()=>validateConfig({...good,supabaseUrl:"https://other.supabase.co"}),{code:"wrong_project"});
 assert.throws(()=>validateConfig({...good,projectName:"other"}),{code:"wrong_project"});
});
test("email and eight-digit codes support Persian and Arabic digits",()=>{
 assert.equal(normalizeEmail(" member@example.test "),"member@example.test");
 for(const bad of ["x","x@","a b@example.test","a".repeat(255)+"@x.test"]) assert.throws(()=>normalizeEmail(bad));
 assert.equal(normalizeCode(" ۱۲۳۴۵۶۷۸ "),"12345678"); assert.equal(normalizeCode("١٢٣٤٥٦٧٨"),"12345678");
 for(const bad of ["123456","1234567","123456789","123a56","12 456","<script>"]) assert.throws(()=>normalizeCode(bad));
});
test("existing account request cannot silently create a user",async()=>{
 const f=fixture(); await f.flow.request("member@example.test","signin");
 assert.deepEqual(f.calls[0],{email:"member@example.test",options:{shouldCreateUser:false}});
 assert.equal(f.flow.expiresIn(),600);
 assert.deepEqual([...f.values.keys()],[THROTTLE_KEY]);
 assert.ok(!JSON.stringify([...f.values]).includes("member"));
});
test("new account explicitly permits signup and verifies an email OTP",async()=>{
 const f=fixture(); await f.flow.request("new@example.test","signup");
 assert.equal(f.calls[0].options.shouldCreateUser,true);
 const session=await f.flow.verify("۱۲۳۴۵۶۷۸");
 assert.equal(session.user.id,"a");
 assert.deepEqual(f.calls[1],{email:"new@example.test",token:"12345678",type:"email"});
 assert.equal(f.flow.pending,null);
});
test("resend keeps mode and email, throttle persists after reset and reload",async()=>{
 const f=fixture(); await f.flow.request("new@example.test","signup");
 await assert.rejects(f.flow.resend(),{code:"cooldown"});
 assert.equal(f.restore().remaining(),60);
 f.advance(60); await f.flow.resend(); assert.equal(f.calls.length,2);
 assert.deepEqual(f.calls[0],f.calls[1]); assert.equal(f.flow.expiresIn(),600);
 f.flow.reset(); assert.equal(f.flow.remaining(),60);
 await assert.rejects(f.flow.request("other@example.test","signin"),{code:"cooldown"});
});
test("failed requests release busy state and retain backoff",async()=>{
 const f=fixture({signInWithOtp:async()=>({error:{status:429}})});
 await assert.rejects(f.flow.request("a@example.test","signup"));
 assert.equal(f.flow.busy,false); assert.equal(f.flow.pending,null);assert.equal(f.flow.remaining(),60);
});
test("invalid and expired codes do not invoke Auth; errors do not erase pending",async()=>{
 const f=fixture({verifyOtp:async()=>({error:{code:"otp_expired"}})});
 await assert.rejects(f.flow.verify("12345678"),{code:"no_pending"});
 await f.flow.request("a@example.test","signup");
 await assert.rejects(f.flow.verify("12"),{code:"invalid_code"});
 await assert.rejects(f.flow.verify("12345678"),{code:"otp_expired"});
 assert.ok(f.flow.pending);assert.equal(f.flow.busy,false);
 f.advance(600); await assert.rejects(f.flow.verify("12345678"),{code:"expired"});
 assert.equal(f.calls.length,1);
});
test("concurrent requests cannot send multiple codes",async()=>{
 let release; const f=fixture({signInWithOtp:()=>new Promise(r=>{release=r;})});
 const pending=f.flow.request("a@example.test","signin");
 await assert.rejects(f.flow.request("b@example.test","signup"),{code:"busy"});
 release({error:null});await pending;
});
test("malformed successful verification is rejected",async()=>{
 const f=fixture({verifyOtp:async()=>({data:{session:null},error:null})});
 await f.flow.request("a@example.test","signin");
 await assert.rejects(f.flow.verify("12345678"),{code:"no_session"});
 assert.ok(f.flow.pending);
});
test("safe errors never echo raw server responses or tokens",()=>{
 const secret="NEVER_ECHO_ME";
 for(const error of [{message:secret},{code:secret},{status:429,message:secret},{code:"otp_expired",message:secret}]) assert.ok(!errorText(error).includes(secret));
 assert.equal(errorText({code:"user_not_found"}),errorText({code:"signup_disabled"}));
});
test("invalid mode is rejected before requesting or persisting",async()=>{
 const f=fixture(); await assert.rejects(f.flow.request("a@example.test","admin"),{code:"invalid_mode"});
 assert.equal(f.calls.length,0);assert.equal(f.values.size,0);
});
test("repository whitelists updates and never supplies follower identity",async()=>{
 const calls=[]; const client={from(table){
  const chain={then:resolve=>Promise.resolve({data:{user_id:"a"},error:null}).then(resolve)};
  for(const method of ["select","eq","maybeSingle","single","order","limit","insert","update","delete"]) chain[method]=(...args)=>{calls.push({table,method,args});return chain;};
  return chain;
 }};
 const repo=createRepository(client);
 await repo.savePublic("a",{display_name:"Name",bio:"Bio",is_listed:true,user_id:"b",email:"secret",role:"admin"});
 assert.deepEqual(calls.find(c=>c.method==="update").args[0],{display_name:"Name",bio:"Bio",is_listed:true});
 calls.length=0;await repo.follow("b");
 assert.deepEqual(calls.find(c=>c.method==="insert").args[0],{followee_id:"b"});
 calls.length=0;await repo.unfollow("a","b");
 assert.deepEqual(calls.filter(c=>c.method==="eq").map(c=>c.args),[["follower_id","a"],["followee_id","b"]]);
});
