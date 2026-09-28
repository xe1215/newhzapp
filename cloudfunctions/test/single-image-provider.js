const {callJimengApi, findValue, imageUrl, providerError} = require('./jimeng-api');

function createSingleImageProvider({runtime}) {
  const env = runtime.env || {};
  const reqKey = env.JIMENG_REQ_KEY || env.IMAGE_PROVIDER_MODEL || 'jimeng_seedream46_cvtob';
  return {
    async generate(input) {
      let response;
      if (input.providerTask) {
        response = await callJimengApi(runtime, env.JIMENG_GET_RESULT_ACTION || 'CVSync2AsyncGetResult', {
          req_key:reqKey,task_id:input.providerTask,req_json:JSON.stringify({return_url:true}),
        });
      } else {
        const referenceUrl = await runtime.getTempFileURL(input.selfieFileId);
        if (!referenceUrl) throw providerError('SELFIE_TEMP_URL_FAILED');
        const product = input.product || {};
        const prompt = [
          '参考图为唯一基准，只生成一张完整的口红试色照片。保持原尺寸、构图、人像比例、主体位置、背景、衣物、发型、五官、表情、肤色、皮肤纹理和光影不变。',
          `仅修改上下唇唇红区域的颜色和质地：${product.brand || ''} ${product.shadeCode || ''} ${product.shadeName || ''}，颜色${product.colorHex || ''}，质地${product.texture || product.finish || '自然'}。`,
          '保留原唇形、唇线、唇纹、高光和阴影，自然融合原唇色，唇缘轻微羽化，不溢出皮肤或牙齿。效果像真实涂抹口红，不要重新生成人像。',
          '禁止缩放、裁剪、旋转、平移、磨皮、改变唇外内容，禁止文字、水印、logo、边框或拼图。',
        ].join('');
        response = await callJimengApi(runtime, env.JIMENG_SUBMIT_ACTION || 'CVSync2AsyncSubmitTask', {
          req_key:reqKey,prompt,image_urls:[referenceUrl],return_url:true,
          req_json:JSON.stringify({return_url:true,logo_info:{add_logo:false},reference_strength:Number(env.IMAGE_PROVIDER_REFERENCE_STRENGTH || env.TRYON_REFERENCE_STRENGTH || 85)}),
        });
      }
      const url = imageUrl(response);
      if (url) {
        const resultImage = await runtime.uploadFileFromUrl({url,cloudPath:`tryon-single/${input.jobId}/result.jpg`});
        if (!resultImage) throw providerError('IMAGE_UPLOAD_FAILED');
        return {resultImage,imageCount:1};
      }
      const status = String(findValue(response,['status','task_status','taskStatus'])).toLowerCase();
      if (['failed','fail','error','cancelled','canceled','not_found','expired','done'].includes(status)) throw providerError('JIMENG_TASK_FAILED');
      const providerTask = input.providerTask || findValue(response,['task_id','taskId','taskID']);
      if (!providerTask) throw providerError('JIMENG_TASK_ID_MISSING');
      return {pending:true,providerTask:String(providerTask),imageCount:1};
    },
  };
}
module.exports = {createSingleImageProvider};
