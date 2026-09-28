// One-off reference migration helper. Prints files; the caller reviews/applies the patch.
// Source stays outside the repository. No photos are copied into the application.
const fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/20021/.codex/skills/develop-web-game/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto('http://127.0.0.1:8766/index_embed.html');
  const files = await page.evaluate(() => {
    const files = {};
    const mapping = {home:'discover',fit:'fit',mine:'mine',analyzing:'analyzing',profile:'beauty-profile','edit-profile':'edit-profile',product:'product-detail',recommend:'recommend',tryon:'single-tryon'};
    const unit = s => s.replace(/(-?\d*\.?\d+)px\b/g, (_, n) => Number(n)*2+'rpx');
    const escape = s => s.replace(/&/g,'&amp;').replace(/"/g,'&quot;');
    const tagMap = {div:'view',span:'text',a:'text',p:'view',h2:'view',h3:'view',h4:'view',img:'view',svg:'image',br:'view'};
    const vars = Object.fromEntries([...document.styleSheets[0].cssRules[0].style].filter(s=>s.startsWith('--')).map(s=>[s,document.styleSheets[0].cssRules[0].style.getPropertyValue(s).trim()]));
    const resolve = s => s.replace(/var\((--[\w-]+)\)/g,(_,v)=>vars[v]||'initial');
    const css = [...document.querySelectorAll('style')].map(s=>s.textContent).join('\n');
    // Preserve the reference cascade, including its final Sheet overrides.
    let converted = unit(resolve(css.replace(/\/\*[\s\S]*?\*\//g,'')));
    converted = converted.replace(/(^|[\s>,])img(?=[\s.#:{>])/gm,'$1.media').replace(/(^|[\s>,])svg(?=[\s.#:{>])/gm,'$1.ui-icon');
    for (const [old,next] of Object.entries(tagMap)) {
      if (old==='img'||old==='svg'||old==='br') continue;
      converted=converted.replace(new RegExp('(^|[\\s>,])'+old+'(?=[\\s.#:{>])','gm'),'$1'+(old[0]==='h'||old==='p'?'.html-'+old:next));
    }
    converted=converted.replace(/:root/g,'page').replace(/\bbody\s*\{/g,'page {').replace(/\*\s*\{/g,'view, text, button, image, scroll-view {');
    files['miniprogram/pages/design-shared.wxss'] = '/* Reference: D:/index_embed.html, 375px baseline; 1px = 2rpx. */\n'+converted+`\n
page { display:block; background:#FFFEFB; font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Helvetica Neue","Microsoft YaHei",sans-serif; font-size:32rpx; line-height:normal; }
button { margin:0; line-height:normal; font-family:inherit; font-weight:400; background:transparent; }
button::after { border:0; }
.phone { width:100%; height:100vh; border-radius:0; box-shadow:none; }
.safe-top { flex-shrink:0; }
.phone-content { height:0; min-height:0; box-sizing:border-box; }
.nav-bar { min-height:104rpx; }
.nav-actions { visibility:hidden; flex-shrink:0; }
.bottom-nav { padding-bottom:max(40rpx,env(safe-area-inset-bottom)); }
.media { display:block; background:#F5EBE7; }
.product-img { width:100%; aspect-ratio:1; }
.ui-icon { display:inline-block; flex-shrink:0; vertical-align:middle; }
.html-br { display:block; height:0; }
.tryon-page { justify-content:flex-end; }
#phone-tryon .nav-bar { top:var(--status-top); }
#phone-tryon .bottom-sheet { height:auto; flex-shrink:0; }
#phone-tryon .sheet-expanded { max-height:none; height:auto; overflow:visible; }
#phone-tryon .sheet-gallery { width:calc(100% + 80rpx); }
.sheet-measure { position:absolute; left:0; right:0; top:0; visibility:hidden; pointer-events:none; }
#phone-tryon .sheet-measure .sheet-expanded { display:block; }
.sheet-scroll { height:calc(100% - 36rpx); }
.ba-before-wrap,.ba-divider { pointer-events:none; }
.mock-error { padding:24rpx 40rpx; color:#966B5B; background:#FFFEFB; }
`;
    let iconIndex=0;
    for(const [id,dir] of Object.entries(mapping)) {
      const phone=document.querySelector('#phone-'+id);
      const chipGroups=[...phone.querySelectorAll('.chip-row')];
      const productCards=[...phone.querySelectorAll('.product-card')];
      const recCards=[...phone.querySelectorAll('.rec-card')];
      function serialize(el,depth=0) {
        if(el.nodeType===3) return el.textContent.trim()?el.textContent.trim().replace(/&/g,'&amp;').replace(/</g,'&lt;'):'';
        if(el.nodeType!==1 || el.classList.contains('status-bar')) return '';
        const old=el.tagName.toLowerCase();
        let tag=tagMap[old]||old, classes=el.getAttribute('class')||'', attrs={}, content=null;
        if(['h2','h3','h4','p'].includes(old)) classes+=' html-'+old;
        if(old==='br') classes+=' html-br';
        if(old==='img') classes+=' media';
        if(el.id) attrs.id=el.id;
        if(el.hasAttribute('style')) attrs.style=unit(resolve(el.getAttribute('style')));
        if(el===phone) {classes+=' design-page '+(id==='tryon'?'tryon-page':'');attrs.style='--status-top:{{statusBarHeight}}px';}
        if(classes.includes('phone-content')) {tag='scroll-view';attrs['scroll-y']='true';}
        if(old==='svg') {
          const style=getComputedStyle(el);
          const svg=el.outerHTML.replace(/currentColor/g,style.color).replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" ');
          const filename='reference-'+(++iconIndex)+'.svg';
          files['miniprogram/images/ui/'+filename]=svg;
          classes='ui-icon';attrs.src='/images/ui/'+filename;attrs.mode='aspectFit';
          attrs.style=unit('width:'+style.width+';height:'+style.height);content='';
        }
        const click=el.getAttribute('onclick');
        if(click) {
          attrs.bindtap='onAction';
          const call=click.match(/^(\w+)\(/);attrs['data-action']=call?call[1]:'';
          const arg=click.match(/'([^']*)'/);if(arg)attrs['data-target']=arg[1];
          if(el.classList.contains('back-btn'))attrs['data-action']='back';
          if(el.classList.contains('product-card'))attrs['data-product']=productCards.indexOf(el);
          if(el.classList.contains('rec-card'))attrs['data-product']=recCards.indexOf(el)===0?3:0;
          if(id==='recommend' && el.classList.contains('btn-primary'))attrs['data-product']=3;
          if(el.classList.contains('category-tab')) {attrs['data-target']=el.textContent;classes="category-tab {{category === '"+el.textContent.trim()+"' ? 'active' : ''}}";}
          if(el.classList.contains('chip')) {
            const group=chipGroups.indexOf(el.parentElement), index=[...el.parentElement.children].indexOf(el);
            attrs['data-group']=group;attrs['data-index']=index;
            classes="chip {{choices["+group+"]["+index+"] ? 'selected' : ''}}";
          }
          if(el.classList.contains('shade-option')) {attrs['data-code']=el.dataset.shade;classes="shade-option {{shade.code === '"+el.dataset.shade+"' ? 'selected' : ''}}";}
        }
        if(id==='product') {
          const bindings={productName:'product.name',productShade:"shade.code + ' · ' + shade.name",shadeName:'shade.full',shadeDesc:'shade.desc'};
          if(bindings[el.id]) content='{{'+bindings[el.id]+'}}';
          if(el.id==='shadeCircle') attrs.style='background:{{shade.color}}';
          if(classes==='product-detail-brand')content='{{product.brand}}';
          if(classes==='shade-option-check')return '';
        }
        if(id==='analyzing' && classes.includes('analysis-step') && !classes.includes('analysis-steps')) {
          const index=[...el.parentElement.children].indexOf(el);
          classes='analysis-step {{steps['+index+'].state}}';
        }
        if(id==='analyzing' && classes==='step-status') {const index=[...el.parentElement.parentElement.children].indexOf(el.parentElement);content='{{steps['+index+'].status}}';}
        if(id==='profile' && classes==='field-value')content='{{profileFields['+[...phone.querySelectorAll('.field-value')].indexOf(el)+']}}';
        if(id==='profile' && classes==='profile-card-title')content='{{profileFields[2]}}';
        if(id==='tryon') {
          if(el.id==='tryonImageArea') {classes="tryon-image-area {{sheetExpanded ? 'collapsed' : ''}}";attrs.style='flex:1 1 auto';}
          if(el.id==='baSlider') {attrs.catchtouchstart='onCompareStart';attrs.catchtouchmove='onCompareMove';attrs.bindtouchend='onCompareEnd';attrs.bindtouchcancel='onCompareEnd';}
          if(el.id==='baBeforeWrap')attrs.style='width:{{slider}}%';
          if(el.id==='baDivider')attrs.style='left:{{slider}}%';
          if(el.id==='bottomSheet') {classes="bottom-sheet {{sheetExpanded ? 'expanded' : ''}} {{dragging ? 'dragging' : ''}}";attrs.style='height:{{sheetHeight}}px';}
          if(['sheetHandle','sheetCollapsed'].includes(el.id)) {attrs.bindtouchstart='onSheetTouchStart';attrs.catchtouchmove='onSheetTouchMove';attrs.bindtouchend='onSheetTouchEnd';attrs.bindtouchcancel='onSheetCancel';}
          if(el.id==='sheetExpanded') {tag='scroll-view';attrs['scroll-y']='true';attrs.style='height:calc(100% - 36rpx)';}
          if(['tryon-product-brand','sheet-brand'].includes(classes))content='{{product.brand}}';
          if(['sheet-title','sheet-product-name'].includes(classes))content='{{product.name}}';
          if(classes==='sheet-shade-desc')content="{{shade.full}} · {{product.finish}}质地";
          if(classes==='shade-card-name')content='{{shade.full}}';
          if(classes==='shade-card-code'||(old==='span'&&el.textContent==='P02 · 豆沙泥'))content="{{shade.code}} · {{shade.name}}";
          if(['tryon-color-dot','sheet-big-color-dot','shade-card-circle'].includes(classes))attrs.style='background:{{shade.color}}';
          if(old==='span'&&el.textContent==='柔雾 · 日常通勤')content='{{product.finish}} · {{product.scene}}';
        }
        if(classes.trim())attrs.class=classes.trim();
        if(content===null) content=old==='img'?'':Array.from(el.childNodes).map(n=>serialize(n,depth+1)).join('\n');
        if(el===phone&&id!=='tryon')content='<view class="safe-top" style="height:{{statusBarHeight}}px"></view>\n'+content;
        const attr=Object.entries(attrs).map(([k,v])=>k+'="'+escape(String(v))+'"').join(' ');
        return '<'+tag+(attr?' '+attr:'')+'>'+content+'</'+tag+'>';
      }
      let wxml=serialize(phone);
      // Group related content without changing the source hierarchy or layout.
      wxml=wxml.replace(/>\s*\n\s*</g,'>\n<');
      files['miniprogram/pages/'+dir+'/index.wxml']=wxml+'\n';
      files['miniprogram/pages/'+dir+'/index.wxss']='@import "../design-shared.wxss";\n';
      files['miniprogram/pages/'+dir+'/index.json']=JSON.stringify({navigationStyle:'custom',navigationBarTextStyle:id==='tryon'?'white':'black',disableScroll:true,usingComponents:{}},null,2)+'\n';
      files['miniprogram/pages/'+dir+'/index.js']="// Local mock UI; no backend or payment requests.\nconst { createDesignPage } = require('../../ui/design-page');\nPage(createDesignPage('"+id+"'));\n";
    }
    return files;
  });
  await browser.close();
  const previous = Object.fromEntries(Object.keys(files).map(p=>[p,fs.existsSync(p)?fs.readFileSync(p,'utf8'):null]));
  process.stdout.write(JSON.stringify({files,previous}));
})();
