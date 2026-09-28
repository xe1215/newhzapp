// Only the synthetic records created by verify-single-tryon-miniprogram.cjs.
// No real user selfie records or storage objects are removed.
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const file=path.join(root,'tmp/tryon-live-verification/miniprogram-state.json');
const state=JSON.parse(fs.readFileSync(file,'utf8'));
if(!/^verification-single-\d+$/.test(state.testId)||!state.jobId)throw new Error('INVALID_VERIFICATION_TARGET');
const cli=path.join(root,'tmp_npm_cache_cli/_npx/9a8789722ddc2fbe/node_modules/@cloudbase/cli/bin/tcb');
function run(commands){
  const r=spawnSync(process.execPath,[cli,'db','nosql','execute','--command',JSON.stringify(commands),'--env-id','newhzapp-d4g8fk4yiaa3fa679','--json'],{cwd:root,encoding:'utf8',windowsHide:true});
  if(r.status!==0)throw new Error('CLEANUP_COMMAND_FAILED');
  const parsed=JSON.parse(r.stdout.slice(r.stdout.indexOf('{')));
  if(parsed.error)throw new Error('CLEANUP_API_FAILED');
  return parsed.data.results;
}
const targets=[
  {name:'try_on_tests',filter:{_id:state.testId,selfieFileId:state.selfieFileId}},
  {name:'single_tryon_jobs',filter:{_id:state.jobId,testId:state.testId,idempotencyKey:state.testId}},
];
const queries=targets.map(t=>({TableName:t.name,CommandType:'QUERY',Command:JSON.stringify({find:t.name,filter:t.filter,limit:2})}));
const before=run(queries);
if(before.some(rows=>!Array.isArray(rows)||rows.length!==1))throw new Error('EXPECTED_EXACTLY_ONE_SYNTHETIC_RECORD_PER_COLLECTION');
console.log(JSON.stringify({preview:targets.map((t,i)=>({collection:t.name,syntheticRecords:before[i].length})),storageObjectsDeleted:0}));
if(process.argv.includes('--apply')){
  fs.writeFileSync(path.join(root,'tmp/tryon-live-verification/synthetic-records-backup.json'),JSON.stringify(before,null,2));
  run(targets.map(t=>({TableName:t.name,CommandType:'DELETE',Command:JSON.stringify({delete:t.name,deletes:[{q:t.filter,limit:1}]})})));
  const after=run(queries);
  if(after.some(rows=>rows.length))throw new Error('CLEANUP_NOT_VERIFIED');
  state.cleaned=true;fs.writeFileSync(file,JSON.stringify(state,null,2));
  console.log(JSON.stringify({cleaned:true,syntheticRecordsDeleted:2,backup:'tmp/tryon-live-verification/synthetic-records-backup.json'}));
}
