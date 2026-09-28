const assert = require('node:assert/strict');
const {test} = require('node:test');
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function (name, parent, main) {
  if (name === 'wx-server-sdk') return {init(){}, DYNAMIC_CURRENT_ENV:'test'};
  return originalLoad.call(this,name,parent,main);
};
const service = require('../cloudfunctions/test');
Module._load = originalLoad;

function fixture() {
  const store = {try_on_tests:{},single_tryon_jobs:{},lipsticks:{'lip-1':{_id:'lip-1',status:'active',brand:'Brand',productName:'Velvet',shadeCode:'01',colorHex:'#aa1234',texture:'丝绒',productImage:'cloud://test/product.jpg'}},events:{}};
  let counter=0;
  function database() {return {collection(name) {return {
    doc(id) {return {async get(){return {data:store[name][id]||null};},async update({data}){Object.assign(store[name][id],data);return {stats:{updated:1}};}};},
    where(filter) {return {limit(){return this;},orderBy(){return this;},async get(){return {data:Object.values(store[name]).filter(x=>Object.entries(filter).every(([k,v])=>x[k]===v))};}};},
    async add({data}){const id=data._id||'record-'+(++counter);store[name][id]={...data,_id:id};return {_id:id};},
  };},async runTransaction(callback){return callback(database());}};}
  const calls=[];
  const deps={db:database(),wxContext:{OPENID:'user-1'},now:()=>new Date('2026-09-27T00:00:00Z'),id:()=> 'id-'+(++counter),
    env:{IMAGE_PROVIDER:'jimeng',JIMENG_ACCESS_KEY_ID:'test',JIMENG_SECRET_ACCESS_KEY:'test'},
    moveFile:async()=>({fileID:'cloud://test/permanent-selfie.jpg'}),
    getTempFileURL:async()=> 'https://example.invalid/original.jpg',
    uploadFileFromUrl:async()=> 'cloud://test/result.jpg',
    httpRequest:async(options)=> {calls.push(options.path);return {statusCode:200,json:options.path.includes('Submit')?{code:10000,data:{task_id:'provider-1'}}:{code:10000,data:{status:'done',image_urls:['https://example.invalid/result.jpg']}}};},
  };
  return {store,calls,deps,call:(action,data={})=>service.main({action,data},{},deps)};
}

test('uploaded selfie and real product stay attached to one resumable single-image task', async()=>{
  const f=fixture();
  const upload=await f.call('uploadSingleSelfie',{tempFileID:'cloud://test/temporary.jpg'});
  const latest=await f.call('getLatestTryOnTest');
  assert.equal(latest.data.test.selfieFileId,'cloud://test/permanent-selfie.jpg');
  assert.equal(upload.data.selfieFileId,latest.data.test.selfieFileId);
  const created=await f.call('createSingleTryOn',{testId:upload.data.testId,productId:'lip-1',idempotencyKey:'request-1'});
  assert.equal(created.data.beforeImage,latest.data.test.selfieFileId);
  assert.equal(created.data.product.productImage,'cloud://test/product.jpg');
  const first=await f.call('processSingleTryOn',{jobId:created.data.jobId});
  assert.equal(first.data.status,'running');
  assert.equal(first.data.resultImage,'');
  const completed=await f.call('processSingleTryOn',{jobId:created.data.jobId});
  assert.equal(completed.code,0);
  assert.equal(completed.data.status,'succeeded');
  assert.equal(completed.data.resultImage,'cloud://test/result.jpg');
  assert.equal(completed.data.beforeImage,latest.data.test.selfieFileId);
  await f.call('processSingleTryOn',{jobId:created.data.jobId});
  assert.equal(f.calls.filter(x=>x.includes('Submit')).length,1);
});

test('another user cannot retrieve or process the selfie or single-image task', async()=>{
  const f=fixture();
  const upload=await f.call('uploadSingleSelfie',{tempFileID:'cloud://test/temporary.jpg'});
  const created=await f.call('createSingleTryOn',{testId:upload.data.testId,productId:'lip-1',idempotencyKey:'owned-request'});
  f.deps.wxContext={OPENID:'other-user'};
  assert.equal((await f.call('getLatestTryOnTest',{testId:upload.data.testId})).data.test,null);
  assert.equal((await f.call('getSingleTryOn',{jobId:created.data.jobId})).code,'RESOURCE_NOT_FOUND');
  assert.equal((await f.call('processSingleTryOn',{jobId:created.data.jobId})).code,'RESOURCE_NOT_FOUND');
  assert.equal(f.calls.length,0);
});
