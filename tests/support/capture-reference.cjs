// Reference-only screenshots and layout measurements; never edits the design HTML.
const fs = require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/20021/.codex/skills/develop-web-game/node_modules/playwright');
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  await page.goto('file:///D:/index_embed.html');
  const ids=['home','fit','mine','analyzing','profile','edit-profile','product','recommend','tryon'];
  fs.mkdirSync('output/playwright',{recursive:true});
  const measurements={};
  for(const id of ids){
    const phone=page.locator('#phone-'+id);
    await phone.screenshot({path:'output/playwright/reference-'+id+'.png'});
    measurements[id]=await phone.evaluate(root=>Array.from(root.querySelectorAll('[class]')).map(el=>{
      const r=el.getBoundingClientRect(),s=getComputedStyle(el);
      return {selector:el.className,width:r.width,height:r.height,fontSize:s.fontSize,color:s.color};
    }));
  }
  fs.writeFileSync('output/playwright/reference-layout.json',JSON.stringify(measurements,null,2));
  await page.locator('#sheetHandle').click();
  await page.waitForTimeout(400);
  await page.locator('#phone-tryon').screenshot({path:'output/playwright/reference-tryon-expanded.png'});
  console.log(await page.locator('#sheetExpanded').evaluate(el=>({gallery:el.querySelector('.sheet-gallery').getBoundingClientRect().toJSON(),container:el.getBoundingClientRect().toJSON()})));
  await browser.close();
  console.log('Captured all nine reference pages.');
})();
