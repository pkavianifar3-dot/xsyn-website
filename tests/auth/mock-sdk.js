// TEST FIXTURE ONLY: no HTTP requests and no real authentication or RLS.
(function(){
 const key="xsyn-local-mock-session";let session=null,requested=null;const listeners=new Set();const notify=(event,value)=>{for(const fn of listeners)fn(event,value);};
 try{session=JSON.parse(localStorage.getItem(key));}catch{}
 const profiles=new Map(),notes=new Map(),edges=new Set();
 const other={user_id:"mock-b",display_name:"کاربر دوم آزمایشی",bio:"پروفایل شبیه‌سازی‌شده",is_listed:true};
 profiles.set(other.user_id,other);
 function ensure(user){if(!profiles.has(user.id))profiles.set(user.id,{user_id:user.id,display_name:"",bio:"",is_listed:false});if(!notes.has(user.id))notes.set(user.id,{user_id:user.id,private_note:""});}
 if(session)ensure(session.user);
 function persist(){if(session)localStorage.setItem(key,JSON.stringify(session));else localStorage.removeItem(key);}
 const auth={
  async signInWithOtp(args){
   requested=args;
   if(args.email==="network@example.test")return {error:{name:"AuthRetryableFetchError"}};
   if(!args.options.shouldCreateUser&&args.email!=="member@example.test")return {error:{code:"user_not_found"}};
   return {error:null};
  },
  async verifyOtp(args){
   if(!requested||args.token!=="12345678")return {error:{code:"otp_expired"}};
   session={user:{id:args.email==="member@example.test"?"mock-existing":"mock-new",email:args.email}};
   ensure(session.user);persist();notify("SIGNED_IN",session);
   return {data:{session},error:null};
  },
  async getSession(){return {data:{session},error:null};},
  async getUser(){return {data:{user:session?.user||null},error:null};},
  onAuthStateChange(fn){listeners.add(fn);return {data:{subscription:{unsubscribe(){listeners.delete(fn);}}}};},
  async signOut(){session=null;persist();notify("SIGNED_OUT",null);return {error:null};}
 };
 function from(table){
  let operation="select",payload={},filters=[],single=false;
  const q={
   select(){return q;},eq(k,v){filters.push([k,v]);return q;},order(){return q;},limit(){return q;},
   maybeSingle(){single=true;return q;},single(){single=true;return q;},
   update(v){operation="update";payload=v;return q;},insert(v){operation="insert";payload=v;return q;},delete(){operation="delete";return q;},
   then(resolve,reject){return Promise.resolve().then(()=>{
    const uid=session?.user.id;if(!uid) return {error:{code:"unauthorized"}};
    let rows=table==="xsyn_profiles"?[...profiles.values()]:table==="xsyn_profile_private"?[notes.get(uid)]:[...edges].map(id=>({follower_id:uid,followee_id:id}));
    rows=rows.filter(Boolean).filter(r=>filters.every(([k,v])=>r[k]===v));
    if(operation==="insert"){edges.add(payload.followee_id);rows=[];}
    if(operation==="delete"){for(const row of rows)edges.delete(row.followee_id);}
    if(operation==="update"){for(const row of rows)Object.assign(row,payload);}
    return {data:single?rows[0]||null:rows,error:null};
   }).then(resolve,reject);}
  };return q;
 }
 window.supabase={createClient(){setTimeout(()=>{
  const banner=document.createElement("p");banner.textContent="شبیه‌سازی محلی — کد: 12345678 — هیچ ایمیلی ارسال نمی‌شود.";
  banner.className="status";document.querySelector("main").prepend(banner);
 },0);return {auth,from};}};
})();
