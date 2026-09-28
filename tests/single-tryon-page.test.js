const assert = require('node:assert/strict');
const {test} = require('node:test');
const {createDesignPage} = require('../miniprogram/ui/design-page');
const flush = () => new Promise(resolve => setImmediate(resolve));
function mount(kind) {
  const page=createDesignPage(kind);page.data=JSON.parse(JSON.stringify(page.data));
  page.setData=patch=>Object.assign(page.data,patch);return page;
}
function environment(process) {
  const product={_id:'real-lip-1',status:'active',brand:'Brand',productName:'Velvet',shadeCode:'01',productImage:'cloud://test/product.jpg'};
  const actions=[];
  global.wx={getWindowInfo:()=>({windowWidth:375,windowHeight:760,screenHeight:760,statusBarHeight:36}),showToast(){},
    cloud:{database:()=>({collection:()=>({doc:()=>({get:async()=>({data:product})}),where:()=>({get:async()=>({data:[product]})})})}),
      getTempFileURL:async({fileList})=>({fileList:fileList.map(id=>({tempFileURL:'https://example.invalid/'+id.split('/').pop()}))}),
      callFunction:async({data})=>{
        actions.push(data);
        if(data.action==='getLatestTryOnTest')return {result:{code:0,data:{test:{testId:'selfie-1',selfieFileId:'cloud://test/original.jpg'}}}};
        if(data.action==='createSingleTryOn')return {result:{code:0,data:{jobId:'job-1',status:'queued',beforeImage:'cloud://test/original.jpg'}}};
        return process(data);
      },
    }};
  return actions;
}

test('original and product photo are visible while real generation is pending, then show its result', async()=>{
  let finish;
  const actions=environment(()=>new Promise(resolve=>{finish=resolve;}));
  const page=mount('tryon');page.onLoad({productId:'real-lip-1'});
  await flush();
  assert.equal(page.data.beforeImageUrl,'https://example.invalid/original.jpg');
  assert.equal(page.data.product.imageUrl,'https://example.invalid/product.jpg');
  assert.equal(page.data.status,'running');
  assert.equal(page.data.showGeneratingPage,true);
  assert.equal(page.data.showComparison,false);
  assert.equal(actions.find(x=>x.action==='createSingleTryOn').data.productId,'real-lip-1');
  finish({result:{code:0,data:{jobId:'job-1',status:'succeeded',beforeImage:'cloud://test/original.jpg',resultImage:'cloud://test/result.jpg'}}});
  await flush();
  assert.equal(page.data.resultImageUrl,'https://example.invalid/result.jpg');
  assert.equal(page.data.status,'succeeded');
  assert.equal(page.data.showGeneratingPage,false);
  assert.equal(page.data.showComparison,true);
  page.onUnload();
});

test('provider failure preserves original and retry invokes the actual same job', async()=>{
  const actions=environment(async(data)=>({result:data.action==='retrySingleTryOn'
    ? {code:0,data:{jobId:'job-1',status:'succeeded',resultImage:'cloud://test/result.jpg',beforeImage:'cloud://test/original.jpg'}}
    : {code:'IMAGE_PROVIDER_FAILED',data:{jobId:'job-1',status:'failed',beforeImage:'cloud://test/original.jpg',errorCode:'IMAGE_PROVIDER_FAILED'}}}));
  const page=mount('tryon');page.onLoad({productId:'real-lip-1'});await flush();
  assert.equal(page.data.status,'failed');
  assert.equal(page.data.showGeneratingPage,true);
  assert.equal(page.data.showComparison,false);
  assert.equal(page.data.beforeImageUrl,'https://example.invalid/original.jpg');
  await page.retry();
  assert.equal(actions.find(x=>x.action==='retrySingleTryOn').data.jobId,'job-1');
  assert.equal(page.data.status,'succeeded');page.onUnload();
});

test('comparison slider remains draggable after the comparison view appears', ()=>{
  const page=mount('tryon');
  page._compareRect={left:0,width:375};
  page.data.sheetExpanded=false;page.data.dragging=false;page.data.slider=50;
  page.onCompareStart({touches:[{clientX:300}]});
  assert.equal(page.data.slider,80);
  page.onCompareEnd();
});

test('recommendation uses real active product ids and backend product images', async()=>{
  environment(async()=>({result:{code:0}}));
  const page=mount('recommend');page.onLoad({});page.onShow();await flush();
  assert.equal(page.data.recommendations.length,1);
  assert.equal(page.data.recommendations[0].productId,'real-lip-1');
  assert.equal(page.data.recommendations[0].product.imageUrl,'https://example.invalid/product.jpg');
});

test('catalog read failure is visible and does not show demonstration products', async()=>{
  environment(async()=>({result:{code:0}}));
  const messages=[];
  global.wx.showToast=options=>messages.push(options.title);
  global.wx.cloud.database=()=>({collection:()=>({where:()=>({get:async()=>{throw new Error('permission denied');}})})});
  const page=mount('recommend');page.onLoad({});await flush();
  assert.deepEqual(page.data.recommendations,[]);
  assert.ok(messages.some(message=>message.includes('商品加载失败')));
});

test('missing or inaccessible selfie returns to photo selection with the selected product', async()=>{
  for (const missing of [true,false]) {
    const actions=environment(async()=>({result:{code:0}}));
    const redirects=[];
    global.wx.redirectTo=options=>redirects.push(options.url);
    if (missing) global.wx.cloud.callFunction=async({data})=>{
      actions.push(data);
      return {result:{code:0,data:{test:null}}};
    };
    else global.wx.getImageInfo=options=>options.fail({errMsg:'file unavailable'});
    const page=mount('tryon');page.onLoad({productId:'real-lip-1'});await flush();
    assert.deepEqual(redirects,['/pages/fit/index?tryOnProductId=real-lip-1']);
    assert.equal(actions.some(action=>action.action==='createSingleTryOn'),false);
    page.onUnload();
  }
});
