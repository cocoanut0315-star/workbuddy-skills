#!/usr/bin/env node
import {mkdir,readFile,writeFile,rename,chmod,unlink,readdir,rmdir,stat} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {createServer} from 'node:http';
import {fork} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';

const production='https://weizuo-poker-d7ghungs1b578ef96-1425410890.ap-shanghai.app.tcloudbase.com/map';
const base=(process.env.WANGDIAN_BASE_URL||production).replace(/\/$/,'');
if(base!==production&&!/^http:\/\/127\.0\.0\.1:\d+(?:\/map)?$/.test(base))throw Error('仅允许正式网点工作台或本机测试地址。');
const directory=process.env.WANGDIAN_HOME?resolve(process.env.WANGDIAN_HOME):join(homedir(),'.wangdian-workspace');
const credentialFile=join(directory,'credentials.json'),pendingFile=join(directory,'pending.json');
const lockDirectory=join(directory,'connection.lock');
const tools=new Set(['list_official_banks','read_official_page','search_branches','prepare_branch_import','commit_branch_import','list_imports','undo_branch_import']);
const output=value=>process.stdout.write(JSON.stringify(value)+'\n');
const random=()=>randomBytes(32).toString('base64url');
async function read(path){try{return JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw Error('本机连接信息无法读取，请重新连接。');}}
async function save(path,data){await mkdir(directory,{recursive:true,mode:0o700});await chmod(directory,0o700);const tmp=path+'.'+random()+'.tmp';await writeFile(tmp,JSON.stringify(data),{mode:0o600});await rename(tmp,path);await chmod(path,0o600);}
// Serialize this machine's calls, login completion and logout, including remote token rotation.
async function connectedOperation(operation){
  await mkdir(directory,{recursive:true,mode:0o700});
  const owner=process.pid+'-'+random(),deadline=Date.now()+150000;
  while(true){
    try{await mkdir(lockDirectory,{mode:0o700});await writeFile(join(lockDirectory,owner),'',{mode:0o600});break;}
    catch(error){
      if(error.code!=='EEXIST')throw error;
      try{
        const owners=await readdir(lockDirectory);
        if(owners.length===1&&/^\d+-[A-Za-z0-9_-]{43}$/.test(owners[0])){
          const pid=Number(owners[0].split('-')[0]);let dead=false;
          try{process.kill(pid,0);}catch(e){dead=e.code==='ESRCH';}
          // Delete the exact old owner's file first; competing cleaners cannot remove a new owner.
          if(dead){await unlink(join(lockDirectory,owners[0]));await rmdir(lockDirectory);continue;}
        }else if(!owners.length&&Date.now()-(await stat(lockDirectory)).mtimeMs>150000){await rmdir(lockDirectory);continue;}
      }catch{}
      if(Date.now()>deadline)throw Error('另一个网点任务仍在执行，请稍后重试。');
      await delay(100);
    }
  }
  try{return await operation();}finally{await unlink(join(lockDirectory,owner));await rmdir(lockDirectory);}
}
async function request(path,{json,form,token}={}){
  let response;try{response=await fetch(base+path,{method:json||form?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(45000),headers:{Accept:path==='/mcp'?'application/json, text/event-stream':'application/json',...(json?{'Content-Type':'application/json','MCP-Protocol-Version':'2025-11-25'}:{}),...(form?{'Content-Type':'application/x-www-form-urlencoded'}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:json?JSON.stringify(json):form?new URLSearchParams(form):undefined});}catch{throw Error('未能连接网点工作台，请检查网络后重试。');}
  let data;try{data=await response.json();}catch{throw Error('工作台返回异常，请稍后重试。');}
  if(!response.ok){const e=Error(data.error_description||data.message||'请求未完成。');e.status=response.status;e.code=data.error;throw e;}return data;
}
async function credentials(){const c=await read(credentialFile);return c?.base===base?c:null;}
async function refresh(c){
  // Another WorkBuddy tool call may already have rotated this refresh token.
  const latest=await credentials();if(latest&&latest.refresh_token!==c.refresh_token)return latest;
  let t;
  try{t=await request('/oauth/token',{form:{grant_type:'refresh_token',refresh_token:c.refresh_token,client_id:c.client_id,resource:base+'/mcp'}});}
  catch(error){
    if(error.code==='invalid_grant')for(let attempt=0;attempt<10;attempt++){
      await delay(100);const shared=await credentials();if(shared&&shared.refresh_token!==c.refresh_token)return shared;
    }
    throw error;
  }
  const next={...c,...t,expiresAt:Date.now()+t.expires_in*1000};await save(credentialFile,next);return next;
}
async function call(name,args={}){
  if(!tools.has(name))throw Error('不支持此网点工具。');
  let c=await credentials();if(!c)throw Error('请先执行 login，然后在浏览器登录并允许连接。');
  if(c.expiresAt<Date.now()+30000)c=await refresh(c);
  const perform=()=>request('/mcp',{token:c.access_token,json:{jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}}});
  let result;try{result=await perform();}catch(e){if(e.status!==401)throw e;c=await refresh(c);result=await perform();}
  if(result.error)throw Error('网点工具暂不可用，请稍后重试。');
  if(result.result?.isError){const message=result.result.content?.find(c=>c.type==='text')?.text;let detail;try{detail=JSON.parse(message);}catch{}throw Error(detail?.message||'网点操作未完成。');}
  if(!result.result?.structuredContent)throw Error('未收到有效的网点操作结果。');
  return result.result.structuredContent;
}
async function loginWorker(){
  const state=random(),verifier=random(),challenge=createHash('sha256').update(verifier).digest('base64url');
  let registration,redirect,finished=false;
  const server=createServer(async(req,res)=>{
    const url=new URL(req.url,'http://127.0.0.1');
    if(req.method!=='GET'||url.pathname!=='/oauth/callback'){res.writeHead(404);res.end();return;}
    const received=url.searchParams.get('state')||'';
    if(req.headers.host!=='127.0.0.1:'+server.address().port||!/^[A-Za-z0-9_-]{43}$/.test(received)||!timingSafeEqual(Buffer.from(received),Buffer.from(state))){res.writeHead(403);res.end('Invalid authorization state');return;}
    if(finished){res.writeHead(409);res.end('Authorization already handled');return;}
    finished=true;
    try{
      if(url.searchParams.has('error'))throw Error('已取消连接。');
      await connectedOperation(async()=>{
        if((await read(pendingFile))?.pid!==process.pid)throw Error('连接已取消。');
        const t=await request('/oauth/token',{form:{grant_type:'authorization_code',client_id:registration.client_id,code:url.searchParams.get('code')||'',code_verifier:verifier,redirect_uri:redirect,resource:base+'/mcp'}});
        await save(credentialFile,{base,client_id:registration.client_id,...t,expiresAt:Date.now()+t.expires_in*1000});
      });
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'"});
      res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>已连接网点工作台</title><main style="font:18px/1.8 system-ui;max-width:500px;margin:12vh auto;padding:24px;color:#19344c"><h1>已连接，可以回到 WorkBuddy 了</h1><p>现在直接告诉助手，要添加哪家银行、哪个城市的网点。</p></main>');
    }catch{res.writeHead(400,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});res.end('连接未完成，请回到 WorkBuddy 重新连接。');}
    finally{await clearPending();clearTimeout(timer);server.close();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  async function clearPending(){try{await connectedOperation(async()=>{if((await read(pendingFile))?.pid===process.pid)await unlink(pendingFile);});}catch{}}
  const timer=setTimeout(()=>{server.close();clearPending();},5*60000);
  try{
    redirect='http://127.0.0.1:'+server.address().port+'/oauth/callback';
    registration=await request('/oauth/register',{json:{client_name:'WorkBuddy 网点添加助手',redirect_uris:[redirect],token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token'],response_types:['code']}});
    const params=new URLSearchParams({response_type:'code',client_id:registration.client_id,redirect_uri:redirect,code_challenge:challenge,code_challenge_method:'S256',state,resource:base+'/mcp',scope:'branches:maintain'});
    const pending={base,authorizationUrl:base+'/oauth/authorize?'+params,expiresAt:Date.now()+5*60000,pid:process.pid};
    await save(pendingFile,pending);process.send?.({authorizationUrl:pending.authorizationUrl});process.disconnect?.();
  }catch{clearTimeout(timer);server.close();process.send?.({error:'无法发起连接，请检查网络或稍后重试。'});process.disconnect?.();}
}
async function main(){
  const [command,name,flag,input]=process.argv.slice(2);
  if(command==='login-worker'){await loginWorker();return;}
  if(command==='status'){const c=await credentials();output({connectedLocally:!!c,verification:'执行 call list_official_banks 可验证线上连接。'});return;}
  if(command==='login')return connectedOperation(async()=>{
    const pending=await read(pendingFile);if(pending?.base===base&&pending.expiresAt>Date.now()){try{process.kill(pending.pid,0);output({authorizationUrl:pending.authorizationUrl});return;}catch{}}
    const child=fork(fileURLToPath(import.meta.url),['login-worker'],{detached:true,stdio:['ignore','ignore','ignore','ipc']});
    const message=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(Error('发起连接超时，请稍后重试。'));},55000);child.once('message',m=>{clearTimeout(timer);resolve(m);});child.once('error',()=>{clearTimeout(timer);reject(Error('无法启动授权，请重试。'));});child.once('exit',()=>{clearTimeout(timer);reject(Error('授权进程未能启动。'));});});
    child.unref();if(message.error)throw Error(message.error);output(message);return;
  });
  if(command==='logout'){
    await connectedOperation(async()=>{
      await unlink(pendingFile).catch(e=>{if(e.code!=='ENOENT')throw e;});
      const c=await credentials();if(c){await request('/oauth/revoke',{form:{client_id:c.client_id,token:c.refresh_token}});await unlink(credentialFile);}
    });
    output({disconnected:true});return;
  }
  if(command==='call'){
    if(flag&&flag!=='--input'||flag&&!input)throw Error('参数格式：call 工具名 --input JSON文件路径');
    const args=input?JSON.parse(await readFile(resolve(input),'utf8')):{};if(!args||typeof args!=='object'||Array.isArray(args))throw Error('工具参数需要 JSON 对象。');
    output(await connectedOperation(()=>call(name,args)));return;
  }
  throw Error('可用命令：status、login、call、logout。');
}
main().catch(e=>{output({error:e.message});process.exitCode=1;});
