// Code-only development deployment. Never prints or persists cloud secrets.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const envId = 'newhzapp-d4g8fk4yiaa3fa679';
const cli = path.join(root, 'tmp_npm_cache_cli/_npx/9a8789722ddc2fbe/node_modules/@cloudbase/cli/bin/tcb');
const stage = path.join(root, 'tmp-deploy/test-single-tryon-20260927');
const files = ['index.js','test-core.js','single-tryon.js','single-image-provider.js','jimeng-api.js','image-transport.js','credits.js','credit-policy.js','package.json','package-lock.json'];
function run(args, cwd = root) {
  const result = spawnSync(process.execPath, [cli, ...args, '--env-id', envId, '--json'], {cwd, encoding:'utf8', timeout:120000, windowsHide:true});
  if (result.status !== 0) throw new Error('CLI_FAILED: ' + args.slice(0,3).join(' '));
  const raw = result.stdout || '';
  const start = raw.indexOf('{');
  if (start < 0) throw new Error('CLI_JSON_MISSING');
  const parsed = JSON.parse(raw.slice(start));
  if (parsed.error) throw new Error('CLI_ERROR');
  return parsed.data || parsed;
}
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const configFingerprint = detail => hash([detail.Environment, detail.Runtime, detail.Timeout, detail.MemorySize, detail.Handler, detail.VpcConfig]);
async function main() {
  const before = run(['fn','detail','test']);
  if (before.FunctionName !== 'test' || before.Namespace !== envId) throw new Error('TARGET_MISMATCH');
  if (before.Status !== 'Active') throw new Error('FUNCTION_NOT_ACTIVE');
  console.log(JSON.stringify({envId,functionName:'test',runtime:before.Runtime,operation:'code-only',files,apply:process.argv.includes('--apply')}));
  if (!process.argv.includes('--apply')) return;
  fs.mkdirSync(stage, {recursive:true});
  for (const file of files) fs.copyFileSync(path.join(root,'cloudfunctions/test',file), path.join(stage,file));
  run(['fn','code','update','test','--dir',stage], stage);
  let after;
  for (let i=0;i<20;i++) {
    after = run(['fn','detail','test']);
    if (after.Status === 'Active') break;
    await new Promise(resolve=>setTimeout(resolve,2000));
  }
  if (after.Status !== 'Active') throw new Error('DEPLOYMENT_NOT_ACTIVE');
  if (configFingerprint(before)!==configFingerprint(after)) throw new Error('FUNCTION_CONFIGURATION_CHANGED');
  console.log(JSON.stringify({deployed:true,status:after.Status,configurationPreserved:true,modifiedAt:after.ModTime,codeSize:after.CodeSize}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
