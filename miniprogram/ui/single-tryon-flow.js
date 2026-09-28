const service = require('../services/test');
const {getProduct, resolveProductImage} = require('../services/products');
const {resolveMediaSource} = require('../utils/media');

function payload(value) { return value && value.result ? value.result : value; }
function error(code) { return Object.assign(new Error(code), {code}); }
function usableImage(url) {
  if (!url) return Promise.resolve(false);
  if (typeof wx.getImageInfo !== 'function') return Promise.resolve(true);
  return new Promise(resolve=>wx.getImageInfo({src:url,success:()=>resolve(true),fail:()=>resolve(false)}));
}
function messageFor(code) {
  return ({PRODUCT_UNAVAILABLE:'商品已下架或暂不可用，请重新选择',SELFIE_REQUIRED:'请先上传自拍',
    SELFIE_UNAVAILABLE:'原图加载失败，请重新选择照片',TRYON_TIMEOUT:'生成超时，请重试',
    RESULT_IMAGE_UNAVAILABLE:'试色图片加载失败，点击重新加载',LOGIN_REQUIRED:'暂时无法获取登录状态，请重试',
    INSUFFICIENT_CREDITS:'试色次数不足',TRYON_CONCURRENT_LIMIT:'已有试色任务正在进行，请稍后重试',
  })[code] || '试色暂未完成，请重试';
}
module.exports = {
  noop(){},
  async loadLiveTryOn(query) {
    this._liveTryOn=true;this._disposed=false;this._tryOnQuery=query;
    this.setData({status:'loading',failed:false,resultImageUrl:'',beforeImageUrl:'',showGeneratingPage:true,showComparison:false,tryOnMessage:'正在加载自拍和商品…'});
    try {
      if (query.historyId && !query.jobId) throw error('RESOURCE_NOT_FOUND');
      if (query.jobId) {
        const response=payload(await service.getSingleTryOn({jobId:query.jobId}));
        if (!response || response.code !== 0 || !response.data) throw error(response && response.code);
        this._jobId=query.jobId;
        const product=await getProduct(response.data.productId);
        if(product) this.setData({product:await resolveProductImage(product),shade:product.shade});
        await this.acceptTryOnJob(response.data);
        if (response.data.status==='running'||response.data.status==='queued') this.scheduleTryOnPoll();
        return;
      }
      const product=await getProduct(query.productId);
      if (!product || !product.id || product.id.indexOf('mock-')===0) throw error('PRODUCT_UNAVAILABLE');
      const resolved=await resolveProductImage(product);
      if(this._disposed)return;
      this.setData({product:resolved,shade:product.shade});
      const selfie=await service.getLatestTryOnTest(query.testId ? {testId:query.testId} : {});
      if (!selfie || !selfie.testId || !selfie.selfieFileId) {
        return wx.redirectTo({url:'/pages/fit/index?tryOnProductId='+encodeURIComponent(product.id)});
      }
      const original=await resolveMediaSource(selfie.selfieFileId);
      if (!await usableImage(original)) {
        return wx.redirectTo({url:'/pages/fit/index?tryOnProductId='+encodeURIComponent(product.id)});
      }
      if(this._disposed)return;
      this._selfie=selfie;
      this.setData({beforeImageUrl:original,status:'running',showGeneratingPage:true,showComparison:false,tryOnMessage:'正在生成试色图…'});
      this._createKey=query.idempotencyKey || 'tryon-'+Date.now()+'-'+Math.random().toString(36).slice(2,10);
      await this.createLiveTryOn();
    } catch(e) {this.failLiveTryOn(e);}
  },
  async createLiveTryOn() {
    const response=payload(await service.createSingleTryOn({testId:this._selfie.testId,productId:this.data.product.id,idempotencyKey:this._createKey}));
    if (!response || response.code!==0 || !response.data || !response.data.jobId) {
      if (response && response.code === 'INSUFFICIENT_CREDITS') {
        if (typeof this.refreshCreditBalance === 'function') this.refreshCreditBalance();
        this.setData({status:'failed',showGeneratingPage:true,showComparison:false,failed:true,tryOnMessage:'积分不足，请先购买积分'});
        return;
      }
      throw error(response && response.code);
    }
    this._jobId=response.data.jobId;
    await this.acceptTryOnJob(response.data);
    if(this.data.status!=='succeeded'&&!this._disposed) await this.pollLiveTryOn(false);
  },
  async acceptTryOnJob(job) {
    if(this._disposed)return;
    this._lastJob=job;
    if (job.beforeImage && !this.data.beforeImageUrl) {
      const original=await resolveMediaSource(job.beforeImage);
      if(this._disposed)return;
      if(!original)throw error('SELFIE_UNAVAILABLE');
      this.setData({beforeImageUrl:original});
    }
    if(job.status==='succeeded'){
      const url=await resolveMediaSource(job.resultImage || job.afterImage);
      if(!url || !await usableImage(url))throw error('RESULT_IMAGE_UNAVAILABLE');
      if(this._disposed)return;
      this.setData({resultImageUrl:url,status:'succeeded',showGeneratingPage:false,showComparison:true,failed:false,tryOnMessage:''},()=>{
        if(typeof this.refreshCompareRect==='function')this.refreshCompareRect();
      });
    }else if(['failed','timeout'].includes(job.status)){
      this.failLiveTryOn(error(job.errorCode||'IMAGE_PROVIDER_FAILED'));
    }else{
      this.setData({status:'running',showGeneratingPage:true,showComparison:false,failed:false,tryOnMessage:'正在生成试色图…'});
    }
  },
  async pollLiveTryOn(retry) {
    if(this._disposed || this._pollBusy)return;
    this._pollBusy=true;
    try {
      const result=payload(await (retry ? service.retrySingleTryOn({jobId:this._jobId,idempotencyKey:'retry-'+Date.now()}) : service.processSingleTryOn({jobId:this._jobId})));
      if(result && result.data && result.data.jobId)await this.acceptTryOnJob(result.data);
      if(!result || result.code!==0)throw error(result && result.code);
      if(!result.data || !result.data.jobId)throw error('TRYON_INVALID_RESPONSE');
      if(this.data.status==='running')this.scheduleTryOnPoll();
    }catch(e){this.failLiveTryOn(e);}finally{this._pollBusy=false;}
  },
  scheduleTryOnPoll(){
    clearTimeout(this._tryOnTimer);
    if(!this._disposed&&!this._tryOnPaused)this._tryOnTimer=setTimeout(()=>this.pollLiveTryOn(false),2500);
  },
  failLiveTryOn(e){
    clearTimeout(this._tryOnTimer);
    if(!this._disposed)this.setData({status:'failed',showGeneratingPage:true,showComparison:false,failed:true,tryOnMessage:messageFor(e && e.code)});
  },
  async retryLiveTryOn(){
    if(this._pollBusy)return;
    this.setData({status:'running',showGeneratingPage:true,showComparison:false,failed:false,tryOnMessage:'正在重试…'});
    try{
      if(this._lastJob && this._lastJob.status==='succeeded')return await this.acceptTryOnJob(this._lastJob);
      if(this._jobId)return await this.pollLiveTryOn(Boolean(this._lastJob && ['failed','timeout'].includes(this._lastJob.status)));
      if(this._selfie)return await this.createLiveTryOn();
      return await this.loadLiveTryOn(this._tryOnQuery || {});
    }catch(e){this.failLiveTryOn(e);}
  },
  onBeforeImageError(){this.setData({beforeImageUrl:''});this.failLiveTryOn(error('SELFIE_UNAVAILABLE'));},
  onAfterImageError(){this.setData({resultImageUrl:''});this.failLiveTryOn(error('RESULT_IMAGE_UNAVAILABLE'));},
};
