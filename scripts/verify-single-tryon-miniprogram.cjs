// Runs the deployed flow with the packaged demo, never with a user's selfie.
const fs=require('node:fs');
const path=require('node:path');
const automator=require('../tmp/tryon-verification-tools/node_modules/miniprogram-automator');
const statePath=path.resolve(__dirname,'../tmp/tryon-live-verification/miniprogram-state.json');
async function main(){
  const previous=fs.existsSync(statePath)?JSON.parse(fs.readFileSync(statePath,'utf8')):null;
  if(previous&&previous.cleaned)throw new Error('This verification was cleaned up; archive its state before a new run');
  if(previous&&!process.argv.includes('--resume'))throw new Error('Verification state already exists; use --resume to keep the same task');
  const app=await automator.connect({wsEndpoint:'ws://127.0.0.1:9420'});
  try{
    const testId=previous?previous.testId:'verification-single-'+Date.now();
    const uploaded=previous?{code:0,data:previous}:await app.evaluate(async function(id){
      const upload=await wx.cloud.uploadFile({cloudPath:'verification/'+id+'/upload.jpg',filePath:'/images/demo-portrait.jpg'});
      const response=await wx.cloud.callFunction({name:'test',data:{action:'uploadSingleSelfie',data:{testId:id,tempFileID:upload.fileID}}});
      return response.result;
    },testId);
    if(uploaded.code!==0||!uploaded.data.selfieFileId)throw new Error('DEMO_UPLOAD_FAILED');
    const state={...previous,testId,selfieFileId:uploaded.data.selfieFileId,productId:'fd6e52d97ef476a9e7aa71d4'};
    fs.writeFileSync(statePath,JSON.stringify(state,null,2));
    console.log(JSON.stringify({stage:'demo_uploaded',permanentSelfie:true}));
    await app.evaluate(function(input){wx.reLaunch({url:'/pages/single-tryon/index?productId='+input.productId+'&testId='+input.testId+'&idempotencyKey='+input.testId});},state);
    let current;
    for(let attempt=0;attempt<65;attempt++){
      await new Promise(resolve=>setTimeout(resolve,2500));
      current=await app.evaluate(function(){
        const p=getCurrentPages().slice(-1)[0],d=p.data;
        return {page:p.route,status:d.status,message:d.tryOnMessage,jobId:p._jobId,
          beforeReady:!!d.beforeImageUrl,afterReady:!!d.resultImageUrl,productReady:!!(d.product&&d.product.imageUrl),
          errorCode:p._lastJob&&p._lastJob.errorCode,resultImage:p._lastJob&&p._lastJob.resultImage};
      });
      if(current.jobId){state.jobId=current.jobId;state.resultImage=current.resultImage;fs.writeFileSync(statePath,JSON.stringify(state,null,2));}
      if(attempt%4===0)console.log(JSON.stringify({stage:'page',status:current.status,beforeReady:current.beforeReady,afterReady:current.afterReady,productReady:current.productReady,errorCode:current.errorCode}));
      if(current.status==='failed')throw new Error(current.errorCode||current.message||'PAGE_FAILED');
      if(current.status==='succeeded'&&current.afterReady)break;
    }
    if(!current||!current.afterReady)throw new Error('VERIFICATION_TIMEOUT');
    const images=await app.evaluate(async function(){
      const d=getCurrentPages().slice(-1)[0].data;
      const dimensions=src=>new Promise(resolve=>wx.getImageInfo({src,success:r=>resolve({ok:true,width:r.width,height:r.height}),fail:()=>resolve({ok:false})}));
      return {before:await dimensions(d.beforeImageUrl),after:await dimensions(d.resultImageUrl),product:await dimensions(d.product.imageUrl)};
    });
    console.log(JSON.stringify({stage:'complete',status:current.status,images}));
  }finally{app.disconnect();}
}
main().catch(error=>{console.error(JSON.stringify({stage:'failed',message:error.message.replace(/https?:\/\/\S+/g,'[url]')}));process.exitCode=1;});
