// Developer-only smoke test. Uses the packaged demonstration portrait, never a user's selfie.
// CLI credentials and provider secrets remain in memory; only sanitized results are printed.
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {createSingleImageProvider}=require('../cloudfunctions/test/single-image-provider');
const {httpRequest,downloadUrl}=require('../cloudfunctions/test/image-transport');
const root=path.resolve(__dirname,'..');
const cli=path.join(root,'tmp_npm_cache_cli/_npx/9a8789722ddc2fbe/node_modules/@cloudbase/cli/bin/tcb');
const envId='newhzapp-d4g8fk4yiaa3fa679';
function command(args){
  const r=spawnSync(process.execPath,[cli,...args,'--env-id',envId,'--json'],{cwd:root,encoding:'utf8',timeout:45000,windowsHide:true});
  const raw=r.stdout||'';let data;
  try{data=JSON.parse(raw.slice(raw.indexOf('{')));}catch(_){
    if(args[0]==='storage'&&args[1]==='upload'&&r.status===0)return {uploaded:true};
    console.error(JSON.stringify({stage:'cli_parse',command:args.slice(0,2),exitCode:r.status,output:args[0]==='fn'?'[configuration omitted]':raw.slice(-250).replace(/https?:\/\/\S+/g,'[url]')}));
    throw new Error('CLI_RESPONSE_INVALID');
  }
  if(r.status!==0||data.error)throw new Error(data.error&&data.error.code||'CLI_FAILED');
  return data.data||data;
}
function find(obj,key){
  if(!obj||typeof obj!=='object')return '';
  if(obj[key])return obj[key];
  for(const v of Object.values(obj)){const found=find(v,key);if(found)return found;}
  return '';
}
async function main(){
  const detail=command(['fn','detail','test']);
  let vars=detail.Environment&&detail.Environment.Variables||{};
  if(Array.isArray(vars))vars=Object.fromEntries(vars.map(v=>[v.Key,v.Value]));
  if(!vars.JIMENG_ACCESS_KEY_ID||!vars.JIMENG_SECRET_ACCESS_KEY)throw new Error('PROVIDER_CREDENTIALS_UNAVAILABLE');
  const previous=process.argv[2] ? JSON.parse(fs.readFileSync(process.argv[2],'utf8')) : null;
  const stamp=previous ? previous.stamp : Date.now().toString();
  const prefix='verification/single-tryon-'+stamp;
  const dir=path.join(root,'tmp/tryon-live-verification',stamp);fs.mkdirSync(dir,{recursive:true});
  if(!previous)command(['storage','upload',path.join(root,'miniprogram/images/demo-portrait.jpg'),prefix+'/original.jpg']);
  const urls=command(['storage','url',prefix+'/original.jpg']);
  const reference=find(urls,'url')||find(urls,'tempFileURL');
  if(!reference)throw new Error('REFERENCE_URL_UNAVAILABLE');
  const runtime={env:vars,now:()=>new Date(),httpRequest,
    getTempFileURL:async()=>reference,
    uploadFileFromUrl:async({url})=>{
      const buffer=await downloadUrl(url);const local=path.join(dir,'result.jpg');fs.writeFileSync(local,buffer);
      command(['storage','upload',local,prefix+'/result.jpg']);
      console.log(JSON.stringify({stage:'image_saved',bytes:buffer.length,local}));
      return prefix+'/result.jpg';
    }};
  const provider=createSingleImageProvider({runtime});
  const input={jobId:'verification-'+stamp,selfieFileId:'packaged-demo',product:{brand:'验证色号',shadeCode:'01',shadeName:'玫瑰豆沙',colorHex:'#9F4050',texture:'丝绒'}};
  const stateFile=path.join(dir,'task.json');
  let result=previous ? {pending:true,providerTask:previous.providerTask} : await provider.generate(input);let count=0;
  if(result.pending)fs.writeFileSync(stateFile,JSON.stringify({stamp,providerTask:result.providerTask}));
  console.log(JSON.stringify({stage:'submitted',pending:!!result.pending}));
  while(result.pending&&count++<75){
    await new Promise(resolve=>setTimeout(resolve,2000));
    result=await provider.generate({...input,providerTask:result.providerTask});
    if(count%10===0)console.log(JSON.stringify({stage:'waiting',polls:count}));
  }
  if(result.pending)throw new Error('LIVE_VERIFICATION_TIMEOUT');
  console.log(JSON.stringify({stage:'complete',imageCount:result.imageCount,cloudPrefix:prefix,localResult:path.join(dir,'result.jpg')}));
}
main().catch(e=>{console.error(JSON.stringify({stage:'failed',code:e.code||e.message,providerCode:e.providerCode,httpStatus:e.httpStatus,providerMessage:e.providerMessage}));process.exitCode=1;});
