// Run the actual WeChat template/style compilers, not an HTML tag regex.
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const miniRoot=path.resolve('miniprogram');
const bin=process.env.WECHAT_COMPILER_DIR || 'D:/微信web开发者工具/resources/app.asar.unpacked/node_modules/wcc-exec';
const output=fs.mkdtempSync(path.join(os.tmpdir(),'newhz-compile-'));
const pages=JSON.parse(fs.readFileSync(path.join(miniRoot,'app.json'),'utf8')).pages.slice(0,9);
for(const page of pages){
  for(const ext of ['wxml','wxss']){
    const args=ext==='wxml'?[page+'.wxml']: [page+'.wxss','pages/design-shared.wxss'];
    const run=spawnSync(path.join(bin,ext==='wxml'?'wcc.exe':'wcsc.exe'),args,{cwd:miniRoot,encoding:'utf8'});
    fs.writeFileSync(path.join(output,page.split('/')[1]+'.'+ext+'.log'),(run.stdout||'')+(run.stderr||''));
    if(run.error||run.status!==0)throw new Error(page+' '+ext+': '+(run.stderr||run.error));
  }
  console.log('PASS '+page+' WXML/WXSS');
}
console.log('Compiler artifacts: '+output);
