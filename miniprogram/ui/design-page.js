// Local-only prototype interactions. Keep state across the nine-page mock journey.
const routes = {home:'discover',fit:'fit',mine:'mine',analyzing:'analyzing',profile:'beauty-profile','edit-profile':'edit-profile',product:'product-detail',recommend:'recommend',tryon:'single-tryon'};
const shades = [
  {code:'P01',name:'蜜桃泥',color:'#E8A8A0',full:'奶雾蜜桃',desc:'清甜少女粉调'},
  {code:'P02',name:'豆沙泥',color:'#C4938A',full:'奶杏粉豆沙',desc:'低饱和的柔和粉调'},
  {code:'P03',name:'草莓泥',color:'#D46060',full:'鲜榨草莓红',desc:'显白提气色的红调'},
  {code:'P04',name:'红棕泥',color:'#965450',full:'焦糖红棕泥',desc:'秋冬氛围感红棕调'}
];
const products = [
  {id:'mock-jd-p02',brand:'JUDYDOLL 橘朵',name:'小奶泥唇泥',series:'小奶泥唇泥',finish:'柔雾',scene:'日常通勤',shade:shades[1]},
  {id:'mock-mac-316',brand:'M·A·C 魅可',name:'轻尤雾弹唇膏',series:'轻尤雾弹唇膏',finish:'柔雾',scene:'日常通勤',shade:{code:'316',name:'雾辣椒',color:'#A8443C',full:'柔和砖红',desc:'浓郁的暖红调'}},
  {id:'mock-ysl-12',brand:'YSL 圣罗兰',name:'圆管口红',series:'圆管口红',finish:'水润',scene:'日常约会',shade:{code:'#12',name:'奶茶棕',color:'#C49A7E',full:'温柔奶茶棕',desc:'柔和自然的暖棕调'}},
  {id:'mock-into-em08',brand:'INTO YOU',name:'经典女主角唇泥',series:'经典女主角唇泥',finish:'柔雾',scene:'日常通勤',shade:{code:'EM08',name:'赤陶土色',color:'#B5605A',full:'赤陶红棕',desc:'偏暖的柔和红棕'}}
];
const optionLabels=[['白皙','自然','小麦'],['偏冷','中性','偏暖'],['温柔','自然','清冷','明艳'],['日常','通勤','约会','聚会']];
const session={choices:[[false,true,false],[true,false,false],[true,true,false,false],[true,true,false,false]],fields:['自然偏暖','偏椭圆','温柔 · 自然','日常 · 通勤'],tryOnHistory:[],selfieAvailable:false};
const { createBeautyProfile, applyProfileOverride, confirmBeautyProfile, cancelBeautyProfile, PROFILE_ENUMS } = require('./beauty-profile-model.js');
const { recommendProducts } = require('./recommendation-model.js');
const { getProduct, listProducts, resolveProductImage } = require('../services/products.js');
session.profile = createBeautyProfile({
  skinTone: '自然', undertone: '偏暖', faceShape: '偏椭圆', styles: ['温柔', '自然'],
  scenes: ['日常', '通勤'], colorFamilies: ['豆沙', '奶茶', '暖玫瑰', '柔和红棕']
});
products[0].tags={colorFamily:['豆沙'],undertone:['偏暖'],finish:['柔雾'],scenes:['日常','通勤'],styles:['温柔','自然'],isActive:true};
products[1].tags={colorFamily:['正红'],undertone:['偏暖'],finish:['柔雾'],scenes:['约会'],styles:['显气色'],isActive:true};
products[2].tags={colorFamily:['奶茶'],undertone:['偏暖'],finish:['水光'],scenes:['日常','约会'],styles:['自然'],isActive:true};
products[3].tags={colorFamily:['柔和红棕'],undertone:['偏暖'],finish:['柔雾'],scenes:['通勤'],styles:['自然','复古'],isActive:true};
const clone = v => JSON.parse(JSON.stringify(v));
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
function analysisSteps(active) {
  return ['肤色分析','冷暖分析','面部特征分析','唇部特征分析','风格匹配','推荐匹配'].map((name,i)=>({name,state:i<active?'done':i===active?'active':'pending',status:i<active?'已完成':i===active?'进行中':'等待中'}));
}
function profileFields(profile) {
  const p=profile.confirmedProfile||{};
  return [
    `${(p.skinTone||[])[0]||''}${(p.undertone||[])[0]||''}`,
    (p.faceShape||[])[0]||'偏椭圆',
    (p.styles||[]).join(' · ')||'温柔 · 自然',
    (p.scenes||[]).join(' · ')||'日常 · 通勤'
  ];
}
function profileChoices(profile) {
  const p=profile.confirmedProfile||{};
  return [
    PROFILE_ENUMS.skinTone.map(v=>(p.skinTone||[]).includes(v)),
    PROFILE_ENUMS.undertone.map(v=>(p.undertone||[]).includes(v)),
    PROFILE_ENUMS.styles.map(v=>(p.styles||[]).includes(v)),
    PROFILE_ENUMS.scenes.map(v=>(p.scenes||[]).includes(v))
  ];
}
function recommendationView(excluded, catalog) {
  const source = catalog || products;
  return recommendProducts(source,session.profile,excluded).map(item=>({
    ...item,
    productIndex: source.findIndex(product=>product.id===item.productId),
    brand:item.product.brand,name:item.product.name,shade:item.product.shade
  }));
}
function relatedProducts(product, allProducts) {
  if (!product) return [];
  const list = Array.isArray(allProducts) ? allProducts : products;
  const explicit = product.seriesExplicit !== false && (product.series || product.seriesName || product.productSeries);
  return list.filter(item => {
    if (!item || item.id === product.id) return false;
    const itemExplicit = item.seriesExplicit !== false && (item.series || item.seriesName || item.productSeries);
    if (explicit && itemExplicit) return itemExplicit === explicit;
    return item.brand && product.brand && item.brand === product.brand && item.name && product.name && item.name === product.name;
  });
}
function mineHistory() {
  return clone(session.tryOnHistory.filter(item=>!item.deletedAt).sort((a,b)=>b.createdAt-a.createdAt));
}
function createDesignPage(kind) {
  return {
    ...require('./single-tryon-flow'),
    data:{mock:true,kind,statusBarHeight:36,category:'全部',products:clone(products),relatedProducts:[],choices:clone(session.choices),profileFields:profileFields(session.profile),recommendations:recommendationView(),product:clone(products[0]),shade:clone(shades[1]),sheetExpanded:false,sheetHeight:130,dragging:false,slider:50,status:'succeeded',showGeneratingPage:false,showComparison:true,failed:false,steps:analysisSteps(3),tryOnHistory:mineHistory(),visibleTryOnHistory:[],mineFeedback:'',mineError:'',showAllTryOns:false,selfieAvailable:session.selfieAvailable,historyUnavailable:false,creditBalance:0,showCreditSheet:false},
    onLoad(query) {
      query=query||{};
      const info=wx.getWindowInfo?wx.getWindowInfo():wx.getSystemInfoSync();
      this._unit=info.windowWidth/375;
      this._safeBottom=info.safeArea?Math.max(0,info.screenHeight-info.safeArea.bottom):0;
      this._maxSheet=info.windowHeight-(info.statusBarHeight||0)-52*this._unit;
      this._collapsed=130*this._unit+this._safeBottom;
      this._expanded=Math.min(380*this._unit+this._safeBottom,this._maxSheet);
      const product=products.find(p=>p.id===query.productId)||products[0];
      const shade=product===products[0]?(shades.find(s=>s.code===query.shade)||product.shade):product.shade;
      this.setData({statusBarHeight:info.statusBarHeight||0,product:clone(product),shade:clone(shade),relatedProducts:clone(relatedProducts(product, products)),sheetHeight:this._collapsed});
      this.refreshCreditBalance();
      if(kind==='tryon' && wx.cloud && typeof wx.cloud.callFunction==='function')return this.loadLiveTryOn(query);
      if(kind==='fit')this._tryOnProductId=query.tryOnProductId || '';
      if (kind === 'analyzing') {
        const image = query.image || '';
        const fileId = query.fileId || '';
        const { resolveMediaSource } = require('../utils/media.js');
        resolveMediaSource(image || fileId).then((url) => this.setData({ analysisImageUrl: url }));
      }
      if (kind === 'home' || kind === 'product' || kind === 'recommend') {
        if(wx.cloud)this.setData({products:[],recommendations:kind==='recommend'?[]:this.data.recommendations});
        listProducts().then((remoteProducts) => {
          return Promise.all(remoteProducts.map((item) => resolveProductImage(item))).then((items) => {
            this.setData({ products: items });
            if(kind==='recommend')this.setData({recommendations:recommendationView([],items)});
            if (kind === 'product') this.setData({ relatedProducts: clone(relatedProducts(this.data.product, items)) });
          });
        }).catch(() => {
          if (!this._disposed) wx.showToast({title:'商品加载失败，请重新进入页面',icon:'none'});
        });
      }
      if (kind === 'tryon') {
        const resultImage = query.resultImage || '';
        const beforeImage = query.beforeImage || '';
        const { resolveMediaSource } = require('../utils/media.js');
        Promise.all([resolveMediaSource(resultImage), resolveMediaSource(beforeImage)]).then(([resultImageUrl, beforeImageUrl]) => {
          this.setData({ resultImageUrl, beforeImageUrl });
        });
        if (query.testId && query.idempotencyKey && !query.productId) {
          this._startSingleTryOn(query.testId, query.idempotencyKey, product.id);
        }
      }
      if (query.productId) {
        getProduct(query.productId).then((remote) => {
          if (!remote || !remote.id) {
            if (kind === 'tryon' && !query.testId) this._startLatestSelfieTryOn(product.id);
            return;
          }
          return resolveProductImage(remote).then((withImage) => {
            const nextShade = withImage.shade && withImage.shade.code === (query.shade || withImage.shade.code)
              ? withImage.shade
              : (withImage.shade || shade);
            this.setData({ product: withImage, shade: nextShade, relatedProducts: clone(relatedProducts(withImage, this.data.products)) });
            if (kind === 'tryon' && query.testId && query.idempotencyKey) {
              this._startSingleTryOn(query.testId, query.idempotencyKey, withImage.id);
            } else if (kind === 'tryon' && !query.testId) {
              this._startLatestSelfieTryOn(withImage.id);
            }
            return listProducts().then((items) => items.length
              ? Promise.all(items.map((item) => resolveProductImage(item))).then((resolved) => this.setData({ relatedProducts: clone(relatedProducts(withImage, resolved)) }))
              : null);
          });
        }).catch(() => {});
      } else if (kind === 'tryon' && !query.testId) {
        this._startLatestSelfieTryOn(product.id);
      }
      this._simulateFail=query.mockFailure==='1';
      if(kind==='analyzing')this.startAnalysis();
      if(kind==='tryon'&&this._simulateFail)this.setData({status:'failed'});
      if(kind==='tryon'){
        this._historyId=query.historyId||'';
        const existing=session.tryOnHistory.find(item=>item.id===this._historyId&&!item.deletedAt);
        if(this._historyId&&!existing)this.setData({historyUnavailable:true});
        if(!this._historyId&&!this._simulateFail){
          const item={id:'mock-tryon-'+(session.tryOnHistory.length+1),productId:product.id,product:clone(product),shade:clone(shade),resultImage:'',status:'succeeded',createdAt:Date.now(),deletedAt:''};
          session.tryOnHistory.push(item);
        }
      }
    },
    onShow() {
      this.refreshCreditBalance();
      if(this._liveTryOn){this._tryOnPaused=false;if(this._jobId&&this.data.status==='running')this.scheduleTryOnPoll();}
      if(kind==='profile'||kind==='recommend')this.setData({profileFields:profileFields(session.profile),recommendationTags:session.profile.confirmedProfile.colorFamilies||[],recommendations:recommendationView([],wx.cloud?this.data.products:products)});
      if(kind==='edit-profile')this.setData({choices:profileChoices(session.profile),profileFields:profileFields(session.profile)});
      if(kind==='mine'){
        const history=mineHistory();
        this.setData({tryOnHistory:history,visibleTryOnHistory:this.data.showAllTryOns?history:history.slice(0,1),selfieAvailable:session.selfieAvailable});
      }
      if(kind==='tryon'&&this._historyId&&!session.tryOnHistory.some(item=>item.id===this._historyId&&!item.deletedAt))this.setData({historyUnavailable:true});
    },
    onReady() {
      if(kind!=='tryon')return;
      this.refreshCompareRect();
      this.createSelectorQuery().select('#sheetMeasure').boundingClientRect(rect=>{
        if(rect&&rect.height){this._expanded=Math.min(this._maxSheet,Math.max(this._collapsed,rect.height+18*this._unit+this._safeBottom));}
      }).exec();
    },
    refreshCompareRect() {
      if(kind!=='tryon' || typeof this.createSelectorQuery!=='function')return;
      this.createSelectorQuery().select('#baSlider').boundingClientRect(rect=>{this._compareRect=rect;}).exec();
    },
    onHide(){if(this._liveTryOn){this._tryOnPaused=true;clearTimeout(this._tryOnTimer);}},
    onUnload(){this._disposed=true;clearTimeout(this._timer);clearTimeout(this._tryOnTimer);},
    refreshCreditBalance() {
      if (!wx.cloud || typeof wx.cloud.callFunction !== 'function') return;
      const { getCreditBalance } = require('../services/credits');
      getCreditBalance().then((response) => {
        const result = response && response.result ? response.result : response;
        if (result && result.code === 0 && result.data) this.setData({ creditBalance: Number(result.data.balance) || 0 });
      }).catch(() => {});
    },
    onCreditClose() {
      this.setData({ showCreditSheet: false });
    },
    onCreditPurchase() {
      wx.showToast({ title: '支付暂未开通', icon: 'none' });
    },
    _startSingleTryOn(testId, idempotencyKey, productId) {
      const { createSingleTryOn, processSingleTryOn } = require('../services/test.js');
      const unwrap = (value) => value && value.result ? value.result : value;
      createSingleTryOn({ testId, productId, idempotencyKey })
        .then((created) => unwrap(created))
        .then((created) => {
          if (!created || !created.data || !created.data.jobId) throw new Error('TRYON_CREATE_FAILED');
          return processSingleTryOn({ jobId: created.data.jobId });
        })
        .then((processed) => {
          const payload = unwrap(processed);
          const job = payload && payload.data;
          if (!job) return;
          const { resolveMediaSource } = require('../utils/media.js');
          return Promise.all([resolveMediaSource(job.resultImage), resolveMediaSource(job.beforeImage)]).then(([resultImageUrl, beforeImageUrl]) => {
            this.setData({ resultImageUrl, beforeImageUrl, status: job.status });
          });
        })
        .catch(() => this.setData({ status: 'failed', failed: true }));
    },
    _startLatestSelfieTryOn(productId) {
      const { getLatestTryOnTest } = require('../services/test.js');
      getLatestTryOnTest().then((test) => {
        if (!test || !test.testId) return;
        const key = 'tryon-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
        const { resolveMediaSource } = require('../utils/media.js');
        resolveMediaSource(test.selfieFileId || test.selfieImage || '').then((url) => {
          if (url) this.setData({ beforeImageUrl: url, selfieAvailable: true });
        });
        this._startSingleTryOn(test.testId, key, productId);
      }).catch(() => {});
    },
    onAction(e) {
      const d=e.currentTarget.dataset;
      if(d.action==='back')return wx.navigateBack({delta:1,fail:()=>wx.reLaunch({url:'/pages/fit/index'})});
      if(kind==='mine'&&d.action==='showAllTryOns'){
        const showAll=!this.data.showAllTryOns;
        return this.setData({showAllTryOns:showAll,visibleTryOnHistory:showAll?this.data.tryOnHistory:this.data.tryOnHistory.slice(0,1)});
      }
      if(kind==='mine'&&d.action==='openTryOnHistory'){
        const item=session.tryOnHistory.find(value=>value.id===d.id&&!value.deletedAt);
        if(!item)return this.setData({mineError:'没有权限查看该试色记录，或记录已删除'});
        return wx.navigateTo({url:'/pages/single-tryon/index?productId='+encodeURIComponent(item.productId)+'&shade='+encodeURIComponent(item.shade.code)+'&historyId='+encodeURIComponent(item.id)});
      }
      if(kind==='mine'&&d.action==='deleteTryOn'){
        const item=session.tryOnHistory.find(value=>value.id===d.id&&!value.deletedAt);
        if(!item)return this.setData({mineError:'没有权限删除该试色记录，或记录已删除'});
        try{
          if(this._deleteTryOn)this._deleteTryOn(item);
          item.deletedAt=Date.now();
          const history=mineHistory();
          return this.setData({tryOnHistory:history,visibleTryOnHistory:this.data.showAllTryOns?history:history.slice(0,1),mineError:'',mineFeedback:'试色记录已删除'});
        }catch(error){return this.setData({mineError:'删除失败，请重试',mineFeedback:''});}
      }
      if(kind==='mine'&&d.action==='deleteSelfie'){
        if(!session.selfieAvailable)return this.setData({mineError:'暂无可删除的自拍'});
        try{
          if(this._deleteSelfie)this._deleteSelfie();
          session.selfieAvailable=false;
          return this.setData({selfieAvailable:false,mineError:'',mineFeedback:'自拍已删除'});
        }catch(error){return this.setData({mineError:'删除自拍失败，请重试',mineFeedback:''});}
      }
      if(d.action==='showToast')return wx.showToast({title:d.target,icon:'none'});
      if(d.action==='openCredits')return this.setData({showCreditSheet:true});
      if (kind === 'fit' && (d.action === 'uploadSelfie' || d.action === 'takeSelfie')) {
        return this.chooseSingleSelfie(d.action === 'takeSelfie');
      }
      if(d.action==='switchTab')return this.setData({category:d.target});
      if(d.action==='selectChip'){
        const group=Number(d.group),index=Number(d.index), choices=clone(this.data.choices);
        if(!choices[group]||index<0||index>=choices[group].length)return;
        choices[group]=choices[group].map((v,i)=>group<2?i===index:(i===index?!v:v));
        return this.setData({choices});
      }
      if(d.action==='selectFaceShape'){
        const values=PROFILE_ENUMS.faceShape;
        const current=this.data.profileFields[1]||values[1];
        const next=values[(values.indexOf(current)+1)%values.length];
        return this.setData({profileFields:[this.data.profileFields[0],next,this.data.profileFields[2],this.data.profileFields[3]]});
      }
      if(d.action==='selectProductShade'){
        const shade=shades.find(s=>s.code===d.code);
        if(shade)this.setData({shade:clone(shade)});
        return;
      }
      if(d.action==='selectRelatedProduct'){
        const target = (this.data.relatedProducts || []).find(item => item.id === d.productId);
        if (!target) return;
        return wx.navigateTo({url:'/pages/product-detail/index?productId='+encodeURIComponent(target.id)+'&shade='+encodeURIComponent(target.shade && target.shade.code || '')});
      }
      if(d.action==='refreshRecommendations'){
        const excluded=(this.data.recommendations||[]).map(item=>item.productId);
        return this.setData({recommendations:recommendationView(excluded.slice(0,1),wx.cloud?this.data.products:products)});
      }
      if(d.action==='navigateTo'||d.action==='switchMainTab'){
        if(kind==='edit-profile'&&d.target==='recommend'){
          let next=clone(session.profile);
          const values=this.data.choices.map((group,g)=>optionLabels[g].filter((_,i)=>group[i]));
          next=applyProfileOverride(next,'skinTone',values[0]);
          next=applyProfileOverride(next,'undertone',values[1]);
          next=applyProfileOverride(next,'styles',values[2]);
          next=applyProfileOverride(next,'scenes',values[3]);
          next=applyProfileOverride(next,'faceShape',this.data.profileFields[1]);
          session.profile=confirmBeautyProfile(next);
          session.choices=profileChoices(session.profile);
          session.fields=profileFields(session.profile);
        }
        let target=d.target;
        if(!routes[target])return;
        let suffix='';
        if(target==='tryon'||target==='product'){
          const p=d.productId
            ? (this.data.products||[]).find(item=>item.id===d.productId) || products.find(item=>item.id===d.productId)
            : (d.product!==undefined?products[Number(d.product)]:this.data.product);
          if(!p)return;
          if(target==='tryon' && Number(this.data.creditBalance || 0) < 1){
            this.setData({showCreditSheet:true});
            return wx.showToast({title:'积分不足，请先购买积分',icon:'none'});
          }
          const shade=kind==='product'?this.data.shade:p.shade;
          suffix='?productId='+encodeURIComponent(p.id)+'&shade='+encodeURIComponent(shade.code);
        }
        const url='/pages/'+routes[target]+'/index'+suffix;
        return ['home','fit','mine'].includes(target)?wx.reLaunch({url}):wx.navigateTo({url});
      }
    },
    chooseSingleSelfie(useCamera) {
      const sourceType = useCamera ? ['camera'] : ['album', 'camera'];
      const pickImage = (done) => {
        if (typeof wx.chooseImage !== 'function') return wx.showToast({ title: '无法打开相册或相机', icon: 'none' });
        wx.chooseImage({ count: 1, sourceType, success: done, fail: () => wx.showToast({ title: '无法打开相册或相机', icon: 'none' }) });
      };
      const choose = (done) => {
        if (typeof wx.chooseMedia !== 'function') return pickImage(done);
        wx.chooseMedia({ count: 1, mediaType: ['image'], sourceType, success: done, fail: () => pickImage(done) });
      };
      choose((res) => {
        const file = (res.tempFiles && res.tempFiles[0]) || (res.tempFilePaths && { tempFilePath: res.tempFilePaths[0] });
        if (!file || !file.tempFilePath || !wx.cloud || typeof wx.cloud.uploadFile !== 'function') {
          return wx.showToast({ title: '无法读取照片', icon: 'none' });
        }
        wx.showLoading({ title: '上传中', mask: true });
        const path = `selfie-upload/${Date.now()}.jpg`;
        wx.cloud.uploadFile({ cloudPath: path, filePath: file.tempFilePath })
          .then((uploaded) => {
            const { uploadSingleSelfie } = require('../services/test.js');
            return uploadSingleSelfie({ tempFileID: uploaded.fileID }).then((response) => ({ response, uploaded }));
          })
          .then(({ response, uploaded }) => {
            const result = response && response.result ? response.result : response;
            if (!result || result.code !== 0) throw new Error('SELFIE_UPLOAD_FAILED');
            session.selfieAvailable = true;
            this.setData({ selfieAvailable: true });
            wx.hideLoading();
            if (this._tryOnProductId && result.data && result.data.testId) {
              return wx.navigateTo({url:'/pages/single-tryon/index?productId='+encodeURIComponent(this._tryOnProductId)+'&testId='+encodeURIComponent(result.data.testId)});
            }
            const fileId = result.data && result.data.selfieFileId || '';
            const image = file.tempFilePath || '';
            return wx.navigateTo({ url: '/pages/analyzing/index?image=' + encodeURIComponent(image) + '&fileId=' + encodeURIComponent(fileId) });
          })
          .catch(() => {
            wx.hideLoading();
            wx.showToast({ title: '照片上传失败，请重试', icon: 'none' });
          });
      });
    },
    startAnalysis(){
      clearTimeout(this._timer);this.setData({failed:false,steps:analysisSteps(0)});
      let active=0;
      const tick=()=>{
        if(this._simulateFail){this.setData({failed:true});return;}
        active++;this.setData({steps:analysisSteps(active)});
        if(active===6){this._timer=setTimeout(()=>wx.redirectTo({url:'/pages/beauty-profile/index'}),600);return;}
        this._timer=setTimeout(tick,1000);
      };
      this._timer=setTimeout(tick,1000);
    },
    retry(){if(this._liveTryOn)return this.retryLiveTryOn();this._simulateFail=false;if(kind==='analyzing')return this.startAnalysis();this.setData({status:'succeeded'});},
    onProductImageError(){this.setData({'product.imageUrl':'/images/default-goods-image.png'});},
    onCompareStart(e){
      if(this.data.sheetExpanded||this.data.dragging)return;
      this._comparing=true;this.onCompareMove(e);
    },
    onCompareMove(e){
      if(!this._comparing||this.data.sheetExpanded||this.data.dragging||!this._compareRect)return;
      const touch=e.touches&&e.touches[0];
      if(touch)this.setData({slider:clamp((touch.clientX-this._compareRect.left)/this._compareRect.width*100,1,99)});
    },
    onCompareEnd(){this._comparing=false;},
    onSheetTouchStart(e){
      const touch=e.touches&&e.touches[0];if(!touch)return;
      this._comparing=false;this._sheetGesture={x:touch.clientX,y:touch.clientY,height:this.data.sheetHeight,moved:false};
    },
    onSheetTouchMove(e){
      const g=this._sheetGesture,t=e.touches&&e.touches[0];if(!g||!t)return;
      const dy=g.y-t.clientY,dx=g.x-t.clientX;
      if(!g.moved&&Math.abs(dx)>Math.abs(dy))return;
      if(Math.abs(dy)>5)g.moved=true;
      if(g.moved)this.setData({dragging:true,sheetHeight:clamp(g.height+dy,this._collapsed,this._expanded)});
    },
    onSheetTouchEnd(){
      const g=this._sheetGesture;if(!g)return;
      const expanded=g.moved?this.data.sheetHeight>(this._collapsed+this._expanded)/2:!this.data.sheetExpanded;
      this._sheetGesture=null;
      this.setData({dragging:false,sheetExpanded:expanded,sheetHeight:expanded?this._expanded:this._collapsed});
    },
    onSheetCancel(){this._sheetGesture=null;this.setData({dragging:false,sheetHeight:this.data.sheetExpanded?this._expanded:this._collapsed});}
  };
}
module.exports={createDesignPage};
