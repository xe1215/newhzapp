const assert = require('node:assert/strict');
const { test } = require('node:test');
const { EventEmitter } = require('node:events');
const Module = require('node:module');
const https = require('node:https');
const crypto = require('node:crypto');
const originalLoad = Module._load;
Module._load = function (name, parent, main) {
  if (name === 'wx-server-sdk') return {};
  return originalLoad.call(this, name, parent, main);
};
const { buildRuntime } = require('../cloudfunctions/test/test-core');
Module._load = originalLoad;
const { createSingleImageProvider } = require('../cloudfunctions/test/single-image-provider');

test('production runtime sends a real transport request and saves exactly one generated image', async () => {
  const request = https.request;
  const submitted = [];
  https.request = (options, callback) => {
    const req = new EventEmitter();
    req.setTimeout = () => req;
    req.write = body => submitted.push(JSON.parse(body));
    req.end = () => {
      const res = new EventEmitter(); res.statusCode = 200; res.headers = {};
      callback(res);
      process.nextTick(() => {
        res.emit('data', Buffer.from(JSON.stringify({code:10000, data:{image_urls:['https://example.invalid/result.jpg']}})));
        res.emit('end');
      });
    };
    return req;
  };
  try {
    const saved = [];
    const runtime = buildRuntime({db:{},wxContext:{OPENID:'test-user'},
      env:{JIMENG_ACCESS_KEY_ID:'test-key',JIMENG_SECRET_ACCESS_KEY:'test-secret'},
      getTempFileURL:async()=> 'https://example.invalid/original.jpg',
      uploadFileFromUrl:async input => { saved.push(input); return 'cloud://test/result.jpg'; },
    }, {});
    const result = await createSingleImageProvider({runtime}).generate({jobId:'job-1',selfieFileId:'cloud://test/original.jpg',product:{brand:'Test',shadeCode:'01',colorHex:'#a34455',texture:'丝绒'}});
    assert.equal(result.resultImage,'cloud://test/result.jpg');
    assert.equal(result.imageCount,1);
    assert.equal(saved.length,1);
    assert.deepEqual(submitted[0].image_urls,['https://example.invalid/original.jpg']);
    assert.match(submitted[0].prompt, /丝绒/);
  } finally { https.request = request; }
});

test('an asynchronous Jimeng task is resumed with a fresh valid signature and one array result', async () => {
  const key = 'test-key', secret = 'test-secret';
  const seen = [];
  const runtime = {env:{JIMENG_ACCESS_KEY_ID:key,JIMENG_SECRET_ACCESS_KEY:secret}, now:()=>new Date('2026-09-27T00:00:00Z'),
    getTempFileURL:async()=> 'https://example.invalid/selfie.jpg', uploadFileFromUrl:async()=> 'cloud://test/result.jpg',
    httpRequest:async(options,body)=>{
      const hash=crypto.createHash('sha256').update(body).digest('hex');
      assert.equal(options.headers['x-content-sha256'],hash);
      const headers=Object.keys(options.headers).filter(k=> !['Authorization','content-length'].includes(k)).sort();
      const canonical=headers.map(k=>`${k}:${options.headers[k]}\n`).join('');
      const query=options.path.split('?')[1];
      const scope='20260927/cn-north-1/cv/request';
      const request=['POST','/',query,canonical,headers.join(';'),hash].join('\n');
      const toSign=['HMAC-SHA256',options.headers['x-date'],scope,crypto.createHash('sha256').update(request).digest('hex')].join('\n');
      const hmac=(k,v)=>crypto.createHmac('sha256',k).update(v).digest();
      const signing=hmac(hmac(hmac(hmac(Buffer.from(secret),'20260927'),'cn-north-1'),'cv'),'request');
      const expected=crypto.createHmac('sha256',signing).update(toSign).digest('hex');
      assert.equal(options.headers.Authorization,`HMAC-SHA256 Credential=${key}/${scope}, SignedHeaders=${headers.join(';')}, Signature=${expected}`);
      seen.push(new URLSearchParams(query).get('Action'));
      if (seen.length > 1) assert.equal(JSON.parse(body).task_id,'18446744073709551615');
      return {statusCode:200,json:seen.length===1?{code:10000,data:{task_id:'18446744073709551615'}}:{code:10000,data:{status:'done',resp_data:JSON.stringify({image_urls:['https://example.invalid/result.jpg']})}}};
    }};
  const provider=createSingleImageProvider({runtime});
  const input={jobId:'job-1',selfieFileId:'cloud://test/selfie.jpg',product:{colorHex:'#aa1234'}};
  const started=await provider.generate(input);
  assert.equal(started.pending,true);
  assert.equal(started.providerTask,'18446744073709551615');
  const completed=await provider.generate({...input,providerTask:started.providerTask});
  assert.equal(completed.resultImage,'cloud://test/result.jpg');
  assert.deepEqual(seen,['CVSync2AsyncSubmitTask','CVSync2AsyncGetResult']);
});
