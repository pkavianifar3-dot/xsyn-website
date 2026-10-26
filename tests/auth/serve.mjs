// Local preview only. No files, configuration or remote services are changed.
import http from "node:http";
import {readFile,realpath} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
const root=fileURLToPath(new URL("../../",import.meta.url));
const mock=process.argv.includes("--mock");
const port=Number(process.argv.find(x=>x.startsWith("--port="))?.slice(7)||8788);
if(!Number.isInteger(port)||port<1024||port>65535) throw Error("Invalid port");
const mime={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".mjs":"text/javascript; charset=utf-8",".png":"image/png",".woff2":"font/woff2",".ico":"image/x-icon"};
const server=http.createServer(async(req,res)=>{
 try{
  if(!["GET","HEAD"].includes(req.method)){res.writeHead(405);res.end();return;}
  const pathname=decodeURIComponent(new URL(req.url,"http://localhost").pathname);
  if(pathname.split("/").some(p=>p.startsWith(".")||p.includes("\\"))||!(/^\/(auth-test|assets|css|js|about|experts|industries|knowledge|search|solutions)\//.test(pathname)||pathname==="/index.html"||pathname==="/")){res.writeHead(404);res.end();return;}
  let relative=pathname.slice(1);if(pathname.endsWith("/"))relative+="index.html";
  let body;
  if(mock&&pathname==="/auth-test/config.js") body='export const config={projectName:"xsyn-platform-test",supabaseUrl:"https://awfnvhlytiwckkkwfgbc.supabase.co",publishableKey:"sb_publishable_LOCAL_MOCK_ONLY_1234567890"};';
  else{
   if(mock&&pathname==="/assets/vendor/supabase-js-2.118.0.js") relative="tests/auth/mock-sdk.js";
   const resolved=await realpath(path.resolve(root,relative));
   if(!resolved.startsWith(root)||!mime[path.extname(resolved)])throw Error("Blocked");
   body=await readFile(resolved);
  }
  res.writeHead(200,{"Content-Type":mime[path.extname(relative)]||"text/plain","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});
  res.end(req.method==="HEAD"?undefined:body);
 }catch{res.writeHead(404);res.end();}
});
server.listen(port,"127.0.0.1",()=>console.log("XSYN "+(mock?"MOCK (no email/network)":"local")+" preview: http://127.0.0.1:"+port+"/auth-test/"));
