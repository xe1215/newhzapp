const assert = require("assert");
const fs = require("fs");
const path = require("path");

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
}

const home = read("miniprogram/pages/home/index.wxml");
const homeScript = read("miniprogram/pages/home/index.js");
const homeStyle = read("miniprogram/pages/home/index.wxss");
assert.match(home, /class="start-ticket"/);
assert.match(home, /class="hero-stack"/);
assert.match(home, /bindtap="openLatestPreview"/);
assert.match(home, /wx:for="\{\{homeDeck\}\}"/);
assert.match(home, /class="hero-card-flow \{\{deckMotion\}\}"/);
assert.match(home, /stackSlot/);
assert.doesNotMatch(home, /bindtouchmove="onDeckTouchMove"/);
assert.match(homeScript, /startDeckFlow/);
assert.match(homeStyle, /height:\s*252rpx/);

const reports = read("miniprogram/pages/my-reports/index.wxml");
const reportsScript = read("miniprogram/pages/my-reports/index.js");
const reportsStyle = read("miniprogram/pages/my-reports/index.wxss");
assert.match(reports, /class="page page-dark reports-page"/);
assert.match(reports, /class="report-cover \{\{item.stackSlot\}\} pressable"/);
assert.match(reportsScript, /startDeckFlow/);
assert.match(reportsStyle, /height:\s*376rpx/);

const detail = read("miniprogram/pages/report/index.wxml");
assert.match(detail, /class="comparison-stage"/);
assert.match(detail, /class="comparison-divider"/);
assert.match(detail, /class="report-sheet"/);
assert.match(detail, /(?:bind|catch)touchmove="onSheetTouchMove"/);
assert.match(detail, /bindtouchmove="onSliderTouchMove"/);
assert.match(detail, /class="product-hero[^\"]*"/);
assert.match(detail, /class="detail-tabs"/);
assert.match(detail, /色彩说明/);
assert.match(detail, /适合场景/);
assert.match(detail, /穿搭建议/);

const shared = read("miniprogram/pages/shared.wxss");
assert.match(shared, /background:\s*#f4f0e7/);
assert.match(shared, /height:\s*140rpx/);

const upload = read("miniprogram/pages/upload/index.js");
const uploadView = read("miniprogram/pages/upload/index.wxml");
const uploadStyle = read("miniprogram/pages/upload/index.wxss");
assert.match(upload, /chooseSelfie\("camera"\)/);
assert.match(upload, /chooseSelfie\("album"\)/);
assert.match(uploadView, /bindtap="chooseCamera"/);
assert.match(uploadView, /bindtap="chooseAlbum"/);
assert.match(uploadStyle, /flex:\s*1 1 0/);
assert.match(uploadStyle, /min-width:\s*0/);

const generating = read("miniprogram/pages/generating/index.js");
const preview = read("miniprogram/pages/preview/index.js");
const previewView = read("miniprogram/pages/preview/index.wxml");
const previewStyle = read("miniprogram/pages/preview/index.wxss");
assert.match(generating, /setStorageSync\("newhzLatestPreview"/);
assert.match(preview, /setStorageSync\("newhzLatestPreview"/);
assert.match(preview, /buildPreviewCards/);
assert.match(preview, /onPreviewTouchEnd/);
assert.match(preview, /onPreviewTouchMove/);
assert.match(preview, /onPreviewTouchCancel/);
assert.match(preview, /velocity >= 0\.65/);
assert.match(previewView, /previewDragRotation/);
assert.match(previewView, /bindtouchcancel="onPreviewTouchCancel"/);
assert.doesNotMatch(preview, /wx\.previewImage/);
assert.match(preview, /locked=1/);
assert.match(preview, /recommendationIndex=\$\{index\}/);
assert.match(previewStyle, /preview-card-breathe/);
assert.match(previewStyle, /watermark-scan/);
assert.match(previewView, /class="preview-stack/);
assert.match(previewView, /item\.active && previewDragging/);
assert.match(previewView, /preview-card-motion/);
assert.match(previewStyle, /fan-front/);

const mockup = read("frontend-effect-mockups/newhz-ui-mockups.html");
assert.match(mockup, /id="preview-screen"/);
assert.match(mockup, /data-prototype-target="preview-screen"/);
assert.match(mockup, /data-prototype-target="report-detail-screen"/);
assert.match(mockup, /showScreen\(targets\[index\]\)/);

const reportScript = read("miniprogram/pages/report/index.js");
const reportView = read("miniprogram/pages/report/index.wxml");
assert.match(reportScript, /loadLockedPreview/);
assert.match(reportScript, /reportService\.getPreview/);
assert.match(reportScript, /onLockedSheetTouchEnd/);
assert.match(reportView, /class="locked-viewport"/);
assert.match(reportView, /onLockedSheetTouchStart/);
assert.match(reportView, /¥5\.99 解锁完整报告/);

const historyScript = read("miniprogram/pages/report-history/index.js");
const appConfig = JSON.parse(read("miniprogram/app.json"));
const myScript = read("miniprogram/pages/my/index.js");
assert.ok(appConfig.pages.includes("pages/report-history/index"));
assert.match(historyScript, /listMyReports/);
assert.match(historyScript, /pages\/my-reports\/index\?testId=/);
assert.match(myScript, /openReportHistory/);
assert.match(reportsScript, /mapReportPresentation/);
assert.match(reportsScript, /selectedReport/);
assert.match(reportsScript, /recommendationIndex/);
