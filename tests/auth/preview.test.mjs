import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
const root=new URL("../../",import.meta.url),base="http://127.0.0.1:8790";
let server;
test.before(async()=>{
 server=spawn(process.execPath,["tests/auth/serve.mjs","--port=8790"],{cwd:root,stdio:["ignore","pipe","pipe"]});
 await Promise.race([once(server.stdout,"data"),once(server,"error").then(([error])=>{throw error;}),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error("Preview did not start")),5000);timer.unref();})]);
});
test.after(()=>{server?.kill();});
test("preview serves the standalone page and existing public HTML",async()=>{
 for(const pathname of ["/auth-test/","/index.html","/industries/"]){
  const response=await fetch(base+pathname);assert.equal(response.status,200,pathname);
  assert.match(response.headers.get("content-type"),/^text\/html/);
 }
});
test("preview rejects mutation requests and paths outside the public allowlist",async()=>{
 assert.equal((await fetch(base+"/auth-test/",{method:"POST",body:"test"})).status,405);
 for(const pathname of ["/.git/config","/docs/xsyn-auth-test.fa.md","/supabase/xsyn-platform-test/001_profiles_follows.sql","/tests/auth/mock-sdk.js","/auth-test/%2e%2e/%2e%2e/.git/config","/auth-test/%5c..%5c.git%5cconfig"]){
  assert.equal((await fetch(base+pathname)).status,404,pathname);
 }
});
test("normal preview serves the exact project config and the genuine pinned SDK",async()=>{
 const config=await(await fetch(base+"/auth-test/config.js")).text();
 assert.equal(config,await readFile(new URL("../../auth-test/config.js",import.meta.url),"utf8"));
 assert.doesNotMatch(config,/LOCAL_MOCK/);
 const sdk=await(await fetch(base+"/assets/vendor/supabase-js-2.118.0.js")).arrayBuffer();
 const provenance=JSON.parse(await readFile(new URL("../../assets/vendor/supabase-js-provenance.json",import.meta.url),"utf8"));
 assert.equal(createHash("sha256").update(Buffer.from(sdk)).digest("hex"),provenance.sha256);
});
