const cloud = require("wx-server-sdk");
const crypto = require("crypto");
const https = require("https");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const RECOMMENDATION_LIMIT = 3;
const IMAGE_COUNT = 3;
const ROLE_LABELS = {
  best_match: "最适合你",
  daily_safe: "日常不出错",
  style_boost: "风格加分款",
};
const TEXTURE_PROMPTS = {
  matte:
    "哑光质地，显色均匀，反光弱，唇纹仍然可见。不要磨平唇纹，不要产生粉墙感或厚重遮盖感。",
  glossy:
    "水光质地，颜色半透明，唇面有湿润光泽，但高光必须贴合原本唇部结构和光照方向。可以轻微增强原有反射，但不要新增夸张白色亮斑。",
  velvet:
    "丝绒质地，中等显色，光泽柔和扩散，保留唇纹和唇部体积。效果应柔和高级，不要过度磨皮或模糊。",
  stain:
    "染色质地，颜色像渗入唇部表层，边缘自然柔和，无明显油亮高光。保留原唇纹、原明暗和自然渐变。",
};
const TRYON_NEGATIVE_PROMPT =
  "不要缩放，不要裁剪，不要旋转，不要平移，不要重新构图，不要改变人脸大小，不要改变人物位置，不要改变拍摄角度，不要镜头校正，不要美颜，不要磨皮，不要换脸，不要改变脸型，不要改变肤色，不要改变光照，不要改变阴影，不要改变曝光，不要改变白平衡，不要改变背景，不要改变衣服，不要改变头发，不要改变眼睛，不要改变眉毛，不要改变鼻子，不要改变牙齿，不要改变舌头，不要改变表情，不要改变唇形，不要改变唇线，不要改变嘴角，不要改变唇峰，不要改变唇厚，不要让口红溢出唇部，不要污染牙齿，不要污染舌头，不要污染皮肤，不要污染鼻子，不要污染下巴，不要平涂，不要油漆感，不要塑料膜感，不要模糊唇纹，不要重建嘴唇纹理，不要生成随机AI模特，不要添加文字，不要添加水印，不要添加边框，不要添加贴纸，不要添加伪影。";
const DEFAULT_REFERENCE_STRENGTH = 85;
const JIMENG_DEFAULT_HOST = "visual.volcengineapi.com";
const JIMENG_DEFAULT_REGION = "cn-north-1";
const JIMENG_DEFAULT_SERVICE = "cv";
const JIMENG_DEFAULT_VERSION = "2022-08-31";
const JIMENG_DEFAULT_SUBMIT_ACTION = "CVSync2AsyncSubmitTask";
const JIMENG_DEFAULT_GET_RESULT_ACTION = "CVSync2AsyncGetResult";
const JIMENG_DEFAULT_MODEL = "jimeng_seedream46_cvtob";
const JIMENG_DEFAULT_MAX_POLLS = 30;
const JIMENG_DEFAULT_POLL_INTERVAL_MS = 2000;
const JIMENG_DEFAULT_HTTP_MAX_RETRIES = 3;
const JIMENG_DEFAULT_HTTP_RETRY_DELAY_MS = 3000;
const JIMENG_DEFAULT_TASK_STALE_MS = 20 * 60 * 1000;
const WATERMARK_INSTRUCTION =
  "水印版本要求：生成正常试色图本体时不要在画面内生成文字或装饰。水印由程序后处理添加，不要让模型生成水印。";
const CLEAN_IMAGE_INSTRUCTION =
  "无水印版本要求：图像中不得出现任何文字、水印、logo、边框、贴纸或说明。";
const JIMENG_PROMPT_LIMIT = 800;
const PREVIEW_WATERMARK_TEXT = "PREVIEW";
const DEFAULT_PROVIDER_TIMEOUT_MS = 30000;

function ok(data) {
  return {
    code: 0,
    message: "ok",
    data: data || null,
  };
}

function fail(code, message, data) {
  return {
    code: code || -1,
    message: message || "error",
    data: data || null,
  };
}

function unsupported(action) {
  return {
    code: "INVALID_ACTION",
    message: `Unsupported action: ${action || "unknown"}`,
    data: null,
  };
}

function getRuntime(deps) {
  return {
    db: deps && deps.db ? deps.db : cloud.database(),
    wxContext: deps && deps.wxContext ? deps.wxContext : cloud.getWXContext(),
    now: deps && deps.now ? deps.now : () => new Date(),
    env: deps && deps.env ? deps.env : process.env,
    durationMs: deps && deps.durationMs ? deps.durationMs : (start) => Date.now() - start,
    sleep:
      deps && deps.sleep
        ? deps.sleep
        : (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    httpRequest: deps && deps.httpRequest ? deps.httpRequest : httpRequest,
    getTempFileURL:
      deps && deps.getTempFileURL
        ? deps.getTempFileURL
        : async (fileID) => {
            const result = await cloud.getTempFileURL({
              fileList: [fileID],
            });
            const file = result.fileList && result.fileList[0];
            return file && (file.tempFileURL || file.download_url || file.url);
          },
    uploadFileFromUrl:
      deps && deps.uploadFileFromUrl
        ? deps.uploadFileFromUrl
        : async ({ url, cloudPath }) => {
            const fileContent = await downloadUrl(url);
            const upload = await cloud.uploadFile({
              cloudPath,
              fileContent,
            });
            return upload.fileID;
          },
    createWatermarkedFile:
      deps && deps.createWatermarkedFile
        ? deps.createWatermarkedFile
        : async ({ sourceFileId, cloudPath, watermarkText }) => {
            const download = await cloud.downloadFile({ fileID: sourceFileId });
            const fileContent = await applyVisibleWatermark(
              download.fileContent,
              watermarkText || PREVIEW_WATERMARK_TEXT
            );
            const upload = await cloud.uploadFile({
              cloudPath,
              fileContent,
            });
            return upload.fileID;
          },
    id:
      deps && deps.id
        ? deps.id
        : () => `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    moveFile:
      deps && deps.moveFile
        ? deps.moveFile
        : async ({ from, to }) => {
            const download = await cloud.downloadFile({ fileID: from });
            const upload = await cloud.uploadFile({
              cloudPath: to,
              fileContent: download.fileContent,
            });
            await cloud.deleteFile({ fileList: [from] });
            return upload;
          },
    deleteFile:
      deps && deps.deleteFile
        ? deps.deleteFile
        : async (fileID) => {
            if (!fileID) {
              return;
            }

            await cloud.deleteFile({ fileList: [fileID] });
          },
  };
}

function getProviderConfig(env) {
  const source = env || {};
  const parsedTimeoutMs = Number(source.IMAGE_PROVIDER_TIMEOUT_MS);
  const timeoutMs =
    Number.isFinite(parsedTimeoutMs) && parsedTimeoutMs > 0
      ? parsedTimeoutMs
      : DEFAULT_PROVIDER_TIMEOUT_MS;

  return {
    provider: source.IMAGE_PROVIDER || "mock",
    model: source.IMAGE_PROVIDER_MODEL || "mock-tryon-v1",
    apiKey: source.IMAGE_PROVIDER_API_KEY || "",
    jimeng: {
      accessKeyId: source.JIMENG_ACCESS_KEY_ID || source.VOLC_ACCESS_KEY_ID || "",
      secretAccessKey:
        source.JIMENG_SECRET_ACCESS_KEY || source.VOLC_SECRET_ACCESS_KEY || "",
      sessionToken: source.JIMENG_SESSION_TOKEN || source.VOLC_SESSION_TOKEN || "",
      host: source.JIMENG_API_HOST || JIMENG_DEFAULT_HOST,
      region: source.JIMENG_REGION || JIMENG_DEFAULT_REGION,
      service: source.JIMENG_SERVICE || JIMENG_DEFAULT_SERVICE,
      version: source.JIMENG_VERSION || JIMENG_DEFAULT_VERSION,
      submitAction: source.JIMENG_SUBMIT_ACTION || JIMENG_DEFAULT_SUBMIT_ACTION,
      getResultAction:
        source.JIMENG_GET_RESULT_ACTION || JIMENG_DEFAULT_GET_RESULT_ACTION,
      reqKey: source.JIMENG_REQ_KEY || source.IMAGE_PROVIDER_MODEL || JIMENG_DEFAULT_MODEL,
      maxPolls: Number(source.JIMENG_MAX_POLLS || JIMENG_DEFAULT_MAX_POLLS),
      pollIntervalMs: Number(
        source.JIMENG_POLL_INTERVAL_MS || JIMENG_DEFAULT_POLL_INTERVAL_MS
      ),
      httpMaxRetries: Number(
        source.JIMENG_HTTP_MAX_RETRIES || JIMENG_DEFAULT_HTTP_MAX_RETRIES
      ),
      httpRetryDelayMs: Number(
        source.JIMENG_HTTP_RETRY_DELAY_MS || JIMENG_DEFAULT_HTTP_RETRY_DELAY_MS
      ),
      taskStaleMs: Number(source.JIMENG_TASK_STALE_MS || JIMENG_DEFAULT_TASK_STALE_MS),
      outputPrefix: source.JIMENG_OUTPUT_PREFIX || "tryon-results",
    },
    promptVersion: source.TRYON_PROMPT_VERSION || "local-v1",
    prompt:
      source.TRYON_PROMPT ||
      "以上传的参考图片为唯一且绝对的基准，进行 1:1 像素级精确复刻，仅修改嘴唇颜色和质地。",
    negativePrompt:
      source.TRYON_NEGATIVE_PROMPT ||
      TRYON_NEGATIVE_PROMPT,
    timeoutMs,
    referenceStrength: Number(
      source.IMAGE_PROVIDER_REFERENCE_STRENGTH || DEFAULT_REFERENCE_STRENGTH
    ),
  };
}

function resolveRoleLabel(recommendation, index) {
  if (recommendation.role && ROLE_LABELS[recommendation.role]) {
    return ROLE_LABELS[recommendation.role];
  }

  return ["最适合你", "日常不出错", "风格加分款"][index] || `推荐 ${index + 1}`;
}

function resolveTextureKey(recommendation) {
  const texture = recommendation.texture || recommendation.textureLabel || "velvet";
  const normalized = String(texture).toLowerCase();

  if (TEXTURE_PROMPTS[normalized]) {
    return normalized;
  }

  if (texture === "哑光") {
    return "matte";
  }

  if (texture === "水光") {
    return "glossy";
  }

  if (texture === "丝绒") {
    return "velvet";
  }

  if (texture === "染色") {
    return "stain";
  }

  return "velvet";
}

function resolveTextureLabel(textureKey, recommendation) {
  if (recommendation.textureLabel) {
    return recommendation.textureLabel;
  }

  return {
    matte: "哑光",
    glossy: "水光",
    velvet: "丝绒",
    stain: "染色",
  }[textureKey];
}

function getCompactTexturePrompt(textureKey) {
  return {
    matte: "哑光，显色均匀，反光弱，唇纹可见",
    glossy: "水光，半透明湿润光泽，沿用原高光方向",
    velvet: "丝绒，中等反光，柔和扩散，保留唇部体积",
    stain: "染色，像渗入唇部表层，边缘自然柔和",
  }[textureKey];
}

function buildJimengApiPrompt(recommendation, index, config, kind) {
  const textureKey = resolveTextureKey(recommendation);
  const textureLabel = resolveTextureLabel(textureKey, recommendation);
  const role = resolveRoleLabel(recommendation, index);
  const versionLabel = kind === "watermark" ? "水印版" : "无水印版";
  const brandShade = [recommendation.brand, recommendation.shadeCode]
    .filter(Boolean)
    .join(" ");
  const prompt = [
    `【${versionLabel}口红试色】参考图为唯一基准，参考强度${config.referenceStrength}，保持原尺寸、构图、人像比例、主体位置、拍摄角度、背景、衣物、发型、五官、表情、皮肤纹理、光照、阴影、曝光和白平衡不变。`,
    `仅修改嘴唇颜色和质地：${role}；口红${recommendation.shadeName || ""}；品牌色号${brandShade || "无"}；颜色${recommendation.colorHex || ""}；质地${textureLabel}。`,
    "上下唇唇红区域内自然上色，保留唇形、唇线、唇峰、唇厚、嘴角、开合程度、唇纹、原高光和原阴影；用正片叠底/柔光融合原唇色，唇缘1-2像素轻微羽化，不溢出皮肤、牙齿或舌头。",
    `质地表现：${getCompactTexturePrompt(textureKey)}。效果像真实涂抹口红，不要重新生成人像。`,
    "禁止缩放/裁剪/旋转/平移；禁止改变脸型肤色和任何唇外像素；禁止平涂、塑料膜感、油漆感、磨皮、模糊、锐化；禁止文字、水印、logo、边框、贴纸、伪影。",
  ].join("");

  if (prompt.length <= JIMENG_PROMPT_LIMIT) {
    return prompt;
  }

  return [
    `【${versionLabel}口红试色】参考图为唯一基准，参考强度${config.referenceStrength}，保持原尺寸、构图、人像比例、主体位置、背景、五官、表情、皮肤纹理、光影和曝光不变。`,
    `仅修改嘴唇颜色：${recommendation.shadeName || ""} ${recommendation.colorHex || ""}，质地${textureLabel}。`,
    "保留唇形、唇线、唇峰、唇厚、嘴角、唇纹、原高光和原阴影；正片叠底/柔光融合，唇缘1-2像素羽化，不溢出皮肤牙齿舌头。",
    "禁止缩放/裁剪/旋转/平移；禁止改变唇外像素；禁止平涂、塑料膜感、磨皮、模糊、文字、水印、logo、边框、伪影。",
  ].join("");
}

function buildTryOnPrompt(recommendation, index, config) {
  const textureKey = resolveTextureKey(recommendation);
  const textureLabel = resolveTextureLabel(textureKey, recommendation);
  const matched = recommendation.matchedPreferences || {};
  const role = resolveRoleLabel(recommendation, index);
  const prompt = `【核心指令】
以上传的参考图片为唯一且绝对的基准，进行“1:1 像素级精确复刻”。仅修改嘴唇颜色和质地，除此之外的所有内容必须与参考图完全一致，不得有任何改动。生成图像必须看起来像是在原始照片上直接涂抹了口红，而不是重新生成了一张新照片。参考强度为${config.referenceStrength}。

补充业务提示：
${config.prompt}

任务目标：
为微信小程序口红试色功能生成真实自然的口红试色图。图像模型只负责生成试色效果，不决定推荐结果。当前需要为同一张用户自拍一次生成 3 张不同口红颜色的试色图，每张图只对应一个推荐色号。

当前试色参数：
推荐角色：${role}
口红名称：${recommendation.shadeName || ""}
品牌色号：${recommendation.brand || ""} ${recommendation.shadeCode || ""}
颜色值：${recommendation.colorHex || ""}
质地：${textureLabel}
场景偏好：${matched.scene || ""}
风格偏好：${matched.style || ""}

【必须 100% 完全保留的所有细节，绝对不可更改】
整体：完全相同的尺寸、分辨率、构图、人像比例、拍摄角度、主体位置、相机参数。
面部：面部轮廓、所有皮肤纹理、毛孔、痣、斑点、痘印、皱纹、法令纹、泪沟、肤色、肤色不均。
五官：眼睛、眉毛、睫毛、鼻子、牙齿、舌头、耳朵形状。
表情：完全一致的面部表情、嘴角弧度、嘴唇开合程度。
发型：头发颜色、发型、每一根发丝的位置、毛流感、头发的光泽和阴影。
身体：颈部线条、肩膀形状、锁骨、所有可见的身体部位。
衣物：所有衣物的款式、颜色、纹理、褶皱、扣子、装饰细节。
环境：完整的背景、背景虚化程度、所有背景物体的位置和颜色。
光影：完全相同的光照方向、光照强度、所有阴影的形状、位置和浓度、高光的位置和强度。
画质：完全相同的噪点分布、整体曝光、白平衡、对比度、饱和度、锐度、胶片感。

唯一允许修改：
将上下唇全部唇红区域的颜色修改为：${recommendation.shadeName || ""} / ${recommendation.colorHex || ""}；颜色值：${recommendation.colorHex || ""}；口红质地：${textureLabel}。

唇部真实感要求：
完整保留原嘴唇的所有形态：唇形、唇线、唇厚、唇峰结构、嘴角形状、嘴唇开合程度。
完整保留原嘴唇的所有纹理：唇纹、嘴唇皮肤质感，不得平滑、模糊或重构。
完整保留原嘴唇的所有光影：原高光的位置、形状与强度，原阴影的位置和浓度，只改变漫反射颜色。
颜色融合方式：新颜色必须使用正片叠底模式与原唇色自然融合，而非不透明填充，保留唇部自然的体积过渡和唇内侧由深到浅的渐变。
唇缘处理：在唇红与皮肤交界处做 1-2 像素的最小化羽化，确保颜色过渡自然，无色块溢出至唇周皮肤，且羽化区域不改变原皮肤纹理。
最终效果：如同在原始嘴唇上真实涂抹了指定质地的口红，没有任何违和感。

质地要求：
${TEXTURE_PROMPTS[textureKey]}

输出要求：
输出完整图像，尺寸、比例和构图必须与参考图一致。图像中不要添加任何文字、标签、品牌、色号、价格、推荐理由、边框、贴纸或额外装饰。`;

  return {
    role,
    prompt,
    cleanPrompt: `${prompt}\n${CLEAN_IMAGE_INSTRUCTION}`,
    watermarkedPrompt: `${prompt}\n${WATERMARK_INSTRUCTION}`,
    cleanApiPrompt: buildJimengApiPrompt(recommendation, index, config, "clean"),
    watermarkedApiPrompt: buildJimengApiPrompt(recommendation, index, config, "watermark"),
    negativePrompt: `${TRYON_NEGATIVE_PROMPT}\n${config.negativePrompt || ""}`,
    referenceStrength: config.referenceStrength,
  };
}

function buildTryOnPrompts(recommendations, config) {
  return recommendations.map((recommendation, index) =>
    buildTryOnPrompt(recommendation, index, config)
  );
}

function safeJsonParse(value) {
  if (!value || typeof value !== "string") {
    return {};
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return {};
  }
}

function parseJsonObject(value) {
  if (!value || typeof value !== "string") {
    return value;
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : value;
  } catch (error) {
    return value;
  }
}

function normalizeProvider(provider) {
  return String(provider || "").toLowerCase();
}

function createProviderError(code, message, retryable, details) {
  const error = new Error(message);
  error.code = code;
  error.retryable = retryable !== false;
  if (details) {
    error.details = details;
  }
  return error;
}

function compactDiagnosticValue(value, depth) {
  if (depth > 3) {
    return "[depth-limit]";
  }

  const parsed = parseJsonObject(value);
  if (typeof parsed === "string") {
    return parsed.length > 500 ? `${parsed.slice(0, 500)}...` : parsed;
  }

  if (Array.isArray(parsed)) {
    return parsed.slice(0, 5).map((item) => compactDiagnosticValue(item, depth + 1));
  }

  if (!parsed || typeof parsed !== "object") {
    return parsed;
  }

  return Object.keys(parsed)
    .slice(0, 20)
    .reduce((memo, key) => {
      memo[key] = compactDiagnosticValue(parsed[key], depth + 1);
      return memo;
    }, {});
}

function createJimengResponseDiagnostic(response) {
  return {
    responseKeys: response && typeof response === "object" ? Object.keys(response).slice(0, 30) : [],
    response: compactDiagnosticValue(response, 0),
  };
}

function createJimengHttpDiagnostic(response, action, attempt) {
  return {
    action,
    attempt,
    statusCode: response.statusCode,
    headers: compactDiagnosticValue(response.headers || {}, 0),
    body: compactDiagnosticValue(response.json && Object.keys(response.json).length > 0 ? response.json : response.body, 0),
  };
}

function isRetryableJimengHttpStatus(statusCode) {
  return statusCode === 429 || statusCode === 408 || statusCode >= 500;
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hmac(key, value, encoding) {
  return crypto.createHmac("sha256", key).update(value).digest(encoding);
}

function toAmzDate(date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function encodeQuery(params) {
  return Object.keys(params)
    .sort()
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join("&");
}

function createVolcAuthorization({ method, host, path, query, body, config, now }) {
  const amzDate = toAmzDate(now);
  const shortDate = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(body);
  const headers = {
    "content-type": "application/json",
    host,
    "x-content-sha256": payloadHash,
    "x-date": amzDate,
  };

  if (config.jimeng.sessionToken) {
    headers["x-security-token"] = config.jimeng.sessionToken;
  }

  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((key) => `${key}:${headers[key]}\n`)
    .join("");
  const canonicalRequest = [
    method,
    path,
    encodeQuery(query),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const credentialScope = `${shortDate}/${config.jimeng.region}/${config.jimeng.service}/request`;
  const stringToSign = [
    "HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const kDate = hmac(Buffer.from(config.jimeng.secretAccessKey, "utf8"), shortDate);
  const kRegion = hmac(kDate, config.jimeng.region);
  const kService = hmac(kRegion, config.jimeng.service);
  const kSigning = hmac(kService, "request");
  const signature = hmac(kSigning, stringToSign, "hex");

  return {
    headers: {
      ...headers,
      Authorization: `HMAC-SHA256 Credential=${config.jimeng.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  };
}

function httpRequest(options, body) {
  return new Promise((resolve, reject) => {
    const request = https.request(options, (response) => {
      const chunks = [];

      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve({
          statusCode: response.statusCode,
          headers: response.headers,
          body: text,
          json: safeJsonParse(text),
        });
      });
    });

    request.on("error", reject);
    request.write(body);
    request.end();
  });
}

function downloadUrl(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(
            createProviderError(
              "IMAGE_DOWNLOAD_FAILED",
              `Image download failed with status ${response.statusCode}`,
              true
            )
          );
          response.resume();
          return;
        }

        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => resolve(Buffer.concat(chunks)));
      })
      .on("error", reject);
  });
}

async function applyVisibleWatermark(fileContent, watermarkText) {
  let Jimp;

  try {
    Jimp = require("jimp");
  } catch (error) {
    throw createProviderError(
      "WATERMARK_DEPENDENCY_MISSING",
      "Package jimp is required to create local watermarked preview images",
      false
    );
  }

  const image = await Jimp.read(fileContent);
  const font = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
  const text = watermarkText || PREVIEW_WATERMARK_TEXT;
  const padding = Math.max(16, Math.round(image.bitmap.width * 0.03));
  const textWidth = Jimp.measureText(font, text);
  const textHeight = Jimp.measureTextHeight(font, text, textWidth);
  const boxWidth = textWidth + padding * 2;
  const boxHeight = textHeight + padding;
  const boxX = Math.max(0, image.bitmap.width - boxWidth - padding);
  const boxY = Math.max(0, image.bitmap.height - boxHeight - padding);
  const overlay = new Jimp(boxWidth, boxHeight, 0x00000066);

  image.composite(overlay, boxX, boxY);
  image.print(font, boxX + padding, boxY + Math.round(padding / 2), text);

  return image.quality(90).getBufferAsync(Jimp.MIME_JPEG);
}

function createImageFileId(reportId, recommendation, kind) {
  return `cloud://tryon/${reportId}/${recommendation.rank}-${recommendation.lipstickId}-${kind}.jpg`;
}

function createMockProvider(config) {
  return {
    async generate(input) {
      if (config.provider === "mock-fail") {
        const error = new Error("Mock provider failed");
        error.code = "IMAGE_PROVIDER_FAILED";
        error.retryable = true;
        throw error;
      }

      if (config.provider !== "mock") {
        const error = new Error(
          `Provider ${config.provider} is not implemented in code yet`
        );
        error.code = "IMAGE_PROVIDER_NOT_CONFIGURED";
        error.retryable = false;
        throw error;
      }

      const previewImages = input.recommendations.map((recommendation) =>
        createImageFileId(input.reportId, recommendation, "watermark")
      );
      const paidImages = input.recommendations.map((recommendation) =>
        createImageFileId(input.reportId, recommendation, "clean")
      );
      const prompts = buildTryOnPrompts(input.recommendations, config);

      return {
        done: true,
        job: null,
        generated: {
          provider: config.provider,
          model: config.model,
          promptVersion: config.promptVersion,
          prompts,
          previewImages,
          paidImages,
          imageFileIds: [...previewImages, ...paidImages],
        },
      };
    },
  };
}

function ensureJimengCredentials(config) {
  if (!config.jimeng.accessKeyId || !config.jimeng.secretAccessKey) {
    throw createProviderError(
      "JIMENG_CREDENTIALS_REQUIRED",
      "JIMENG_ACCESS_KEY_ID and JIMENG_SECRET_ACCESS_KEY are required",
      false
    );
  }
}

async function callJimengApi(runtime, config, action, payload) {
  ensureJimengCredentials(config);

  const method = "POST";
  const path = "/";
  const host = config.jimeng.host;
  const query = {
    Action: action,
    Version: config.jimeng.version,
  };
  const body = JSON.stringify(payload);
  const authorization = createVolcAuthorization({
    method,
    host,
    path,
    query,
    body,
    config,
    now: runtime.now(),
  });
  const maxAttempts = Math.max(1, Number(config.jimeng.httpMaxRetries || 0) + 1);
  let lastResponse = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await runtime.httpRequest(
      {
        method,
        hostname: host,
        path: `${path}?${encodeQuery(query)}`,
        headers: {
          ...authorization.headers,
          "content-length": Buffer.byteLength(body),
        },
        timeout: config.timeoutMs,
      },
      body
    );
    lastResponse = response;

    if (response.statusCode >= 200 && response.statusCode < 300) {
      if (response.json && response.json.ResponseMetadata && response.json.ResponseMetadata.Error) {
        const apiError = response.json.ResponseMetadata.Error;
        throw createProviderError(
          apiError.Code || "JIMENG_API_ERROR",
          apiError.Message || "Jimeng API returned an error",
          true,
          createJimengHttpDiagnostic(response, action, attempt)
        );
      }

      return response.json || {};
    }

    if (isRetryableJimengHttpStatus(response.statusCode) && attempt < maxAttempts) {
      await runtime.sleep(config.jimeng.httpRetryDelayMs * attempt);
      continue;
    }

    break;
  }

  throw createProviderError(
    "JIMENG_HTTP_ERROR",
    `Jimeng API returned HTTP ${lastResponse.statusCode}`,
    true,
    createJimengHttpDiagnostic(lastResponse, action, maxAttempts)
  );
}

function getResponseRoot(response) {
  const parsed = parseJsonObject(response);
  if (!parsed || typeof parsed !== "object") {
    return {};
  }

  return parseJsonObject(parsed.Result || parsed.result || parsed.data || parsed);
}

function pickNestedValue(source, paths) {
  const queue = [source];
  const seen = new Set();

  while (queue.length > 0) {
    const current = parseJsonObject(queue.shift());
    if (!current || typeof current !== "object" || seen.has(current)) {
      continue;
    }

    seen.add(current);

    for (const path of paths) {
      let value = current;
      for (const key of path) {
        value = value && parseJsonObject(value[key]);
      }

      if (typeof value === "string" || typeof value === "number") {
        return String(value);
      }
    }

    for (const value of Object.values(current)) {
      if (value && typeof value === "object") {
        queue.push(value);
      }
    }
  }

  return "";
}

function resolveTaskId(response) {
  return pickNestedValue(getResponseRoot(response), [
    ["task_id"],
    ["taskId"],
    ["taskID"],
    ["data", "task_id"],
    ["data", "taskId"],
    ["data", "taskID"],
    ["task", "id"],
    ["task", "task_id"],
    ["task", "taskId"],
  ]);
}

function resolveImageUrls(response) {
  const result = getResponseRoot(response);
  const candidates = [
    result.image_urls,
    result.imageUrls,
    result.urls,
    result.images,
    result.output,
    result.outputs,
    result.data,
    result.data && result.data.image_urls,
    result.data && result.data.imageUrls,
    result.data && result.data.urls,
    result.data && result.data.images,
    result.data && result.data.output,
    result.data && result.data.outputs,
  ];

  for (const candidate of candidates) {
    const parsed = parseJsonObject(candidate);
    if (!parsed) {
      continue;
    }

    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => {
          if (typeof item === "string") {
            return item;
          }

          const parsedItem = parseJsonObject(item);
          return parsedItem && (parsedItem.url || parsedItem.image_url || parsedItem.imageUrl);
        })
        .filter(Boolean);
    }

    if (typeof parsed === "string") {
      return [parsed];
    }
  }

  const nestedImageUrl = pickNestedValue(result, [
    ["url"],
    ["image_url"],
    ["imageUrl"],
    ["data", "url"],
    ["data", "image_url"],
    ["data", "imageUrl"],
  ]);

  return nestedImageUrl ? [nestedImageUrl] : [];
}

function resolveTaskStatus(response) {
  const result = getResponseRoot(response);
  return pickNestedValue(result, [
    ["status"],
    ["task_status"],
    ["taskStatus"],
    ["data", "status"],
    ["data", "task_status"],
    ["data", "taskStatus"],
  ]).toLowerCase();
}

function createJimengTaskCheckSummary(taskId, response, imageUrls, checkedAt) {
  const result = getResponseRoot(response);
  return {
    taskId,
    checkedAt,
    status: resolveTaskStatus(response) || "",
    code: pickNestedValue(result, [
      ["code"],
      ["status_code"],
      ["statusCode"],
      ["data", "code"],
      ["data", "status_code"],
      ["data", "statusCode"],
    ]),
    message: pickNestedValue(result, [
      ["message"],
      ["msg"],
      ["data", "message"],
      ["data", "msg"],
    ]).slice(0, 200),
    requestId: pickNestedValue(result, [
      ["request_id"],
      ["requestId"],
      ["RequestId"],
      ["data", "request_id"],
      ["data", "requestId"],
      ["data", "RequestId"],
    ]),
    imageUrlCount: imageUrls.length,
  };
}

function getIsoAgeMs(nowIso, pastIso) {
  const nowTime = Date.parse(nowIso);
  const pastTime = Date.parse(pastIso || "");
  if (!Number.isFinite(nowTime) || !Number.isFinite(pastTime)) {
    return 0;
  }

  return Math.max(0, nowTime - pastTime);
}

function assertJimengTaskFresh(config, task, checkedAt) {
  const staleMs = Number(config.jimeng.taskStaleMs || 0);
  if (!staleMs || !task || !task.submittedAt) {
    return;
  }

  const ageMs = getIsoAgeMs(checkedAt, task.submittedAt);
  if (ageMs <= staleMs) {
    return;
  }

  throw createProviderError(
    "JIMENG_TASK_STALE",
    `Jimeng task ${task.taskId} stayed unfinished for ${Math.round(ageMs / 1000)} seconds`,
    true,
    {
      taskId: task.taskId,
      submittedAt: task.submittedAt,
      checkedAt,
      ageMs,
      staleMs,
    }
  );
}

async function submitJimengTask(runtime, config, input, promptBundle, kind) {
  const referenceUrl = await runtime.getTempFileURL(input.selfieFileId);

  if (!referenceUrl) {
    throw createProviderError(
      "SELFIE_TEMP_URL_FAILED",
      "Failed to create a temporary URL for selfie",
      true
    );
  }

  const prompt =
    kind === "watermark"
      ? promptBundle.watermarkedApiPrompt || promptBundle.watermarkedPrompt
      : promptBundle.cleanApiPrompt || promptBundle.cleanPrompt;
  const payload = {
    req_key: config.jimeng.reqKey,
    prompt,
    image_urls: [referenceUrl],
    return_url: true,
    logo_info: {
      add_logo: kind === "watermark",
    },
    req_json: JSON.stringify({
      return_url: true,
      logo_info: {
        add_logo: kind === "watermark",
      },
      reference_strength: config.referenceStrength,
    }),
  };
  const response = await callJimengApi(
    runtime,
    config,
    config.jimeng.submitAction,
    payload
  );
  const taskId = resolveTaskId(response);

  if (!taskId) {
    throw createProviderError(
      "JIMENG_TASK_ID_MISSING",
      "Jimeng submit response did not include task id",
      true,
      createJimengResponseDiagnostic(response)
    );
  }

  return taskId;
}

async function pollJimengResult(runtime, config, taskId) {
  for (let index = 0; index < config.jimeng.maxPolls; index += 1) {
    const response = await callJimengApi(
      runtime,
      config,
      config.jimeng.getResultAction,
      {
        req_key: config.jimeng.reqKey,
        task_id: taskId,
        req_json: JSON.stringify({
          return_url: true,
        }),
      }
    );
    const imageUrls = resolveImageUrls(response);

    if (imageUrls.length > 0) {
      return imageUrls[0];
    }

    const status = resolveTaskStatus(response);
    if (["failed", "fail", "error", "cancelled", "canceled"].includes(status)) {
      throw createProviderError(
        "JIMENG_TASK_FAILED",
        `Jimeng task ${taskId} failed`,
        true
      );
    }

    await runtime.sleep(config.jimeng.pollIntervalMs);
  }

  throw createProviderError(
    "JIMENG_TASK_TIMEOUT",
    `Jimeng task ${taskId} did not finish before timeout`,
    true
  );
}

function createResultCloudPath(input, recommendation, kind) {
  return `${input.reportId}/${recommendation.rank}-${recommendation.lipstickId}-${kind}.jpg`;
}

async function createWatermarkedPreview(runtime, config, input, completedImage) {
  return runtime.createWatermarkedFile({
    sourceFileId: completedImage.fileId,
    cloudPath: `${config.jimeng.outputPrefix}/${createResultCloudPath(
      input,
      completedImage.recommendation,
      "watermark"
    )}`,
    watermarkText: PREVIEW_WATERMARK_TEXT,
  });
}

async function finalizeJimengImages(runtime, config, input, completedImages) {
  const orderedImages = [...completedImages]
    .sort((a, b) => a.index - b.index)
    .map((item) => ({
      ...item,
      recommendation: item.recommendation || input.recommendations[item.index],
    }));
  const paidImages = orderedImages.map((item) => item.fileId);
  const previewImages = [];

  for (const image of orderedImages) {
    previewImages.push(await createWatermarkedPreview(runtime, config, input, image));
  }

  return {
    previewImages,
    paidImages,
    imageFileIds: [...previewImages, ...paidImages],
  };
}

async function uploadJimengTaskResult(runtime, config, input, task) {
  const imageUrl = await pollJimengResult(runtime, config, task.taskId);
  const fileId = await runtime.uploadFileFromUrl({
    url: imageUrl,
    cloudPath: `${config.jimeng.outputPrefix}/${createResultCloudPath(
      input,
      task.recommendation,
      task.kind
    )}`,
  });

  return {
    ...task,
    fileId,
  };
}

async function checkJimengTaskResult(runtime, config, taskId) {
  const checkedAt = runtime.now().toISOString();
  const response = await callJimengApi(
    runtime,
    config,
    config.jimeng.getResultAction,
    {
      req_key: config.jimeng.reqKey,
      task_id: taskId,
      req_json: JSON.stringify({
        return_url: true,
      }),
    }
  );
  const imageUrls = resolveImageUrls(response);
  const lastCheck = createJimengTaskCheckSummary(taskId, response, imageUrls, checkedAt);

  if (imageUrls.length > 0) {
    return {
      status: "done",
      imageUrl: imageUrls[0],
      lastCheck,
    };
  }

  const status = resolveTaskStatus(response);
  if (["failed", "fail", "error", "cancelled", "canceled"].includes(status)) {
    throw createProviderError(
      "JIMENG_TASK_FAILED",
      `Jimeng task ${taskId} failed`,
      true
    );
  }

  return {
    status: "running",
    lastCheck,
  };
}

function createEmptyJimengJob() {
  return {
    provider: "jimeng",
    promptVersion: "",
    startedAt: "",
    updatedAt: "",
    prompts: [],
    completedImages: [],
    currentIndex: 0,
    currentTask: null,
  };
}

function normalizeJimengJob(job, prompts) {
  const normalized = job && typeof job === "object" ? job : {};
  const completedImages = Array.isArray(normalized.completedImages)
    ? normalized.completedImages
    : [];

  return {
    ...createEmptyJimengJob(),
    ...normalized,
    prompts,
    completedImages,
    currentIndex: Number(normalized.currentIndex || completedImages.length || 0),
    currentTask:
      normalized.currentTask &&
      typeof normalized.currentTask === "object" &&
      normalized.currentTask.taskId
        ? normalized.currentTask
        : null,
  };
}

async function continueJimengGeneration(runtime, config, input, prompts, existingJob) {
  const timestamp = runtime.now().toISOString();
  const job = normalizeJimengJob(existingJob, prompts);

  if (!job.startedAt) {
    job.startedAt = timestamp;
  }

  job.updatedAt = timestamp;
  job.promptVersion = config.promptVersion;

  if (job.currentIndex >= input.recommendations.length) {
    const images = await finalizeJimengImages(runtime, config, input, job.completedImages);
    return {
      done: true,
      job: null,
      generated: {
        provider: config.provider,
        model: config.model,
        promptVersion: config.promptVersion,
        prompts,
        ...images,
      },
    };
  }

  if (!job.currentTask) {
    const recommendation = input.recommendations[job.currentIndex];
    const promptBundle = prompts[job.currentIndex];
    const taskId = await submitJimengTask(
      runtime,
      config,
      input,
      promptBundle,
      "clean"
    );

    job.currentTask = {
      index: job.currentIndex,
      kind: "clean",
      recommendation,
      taskId,
      submittedAt: timestamp,
    };

    return {
      done: false,
      job,
      progress: {
        status: "generating",
        completedCount: job.completedImages.length,
        totalCount: input.recommendations.length,
      },
    };
  }

  const taskCheck = await checkJimengTaskResult(runtime, config, job.currentTask.taskId);
  job.lastCheck = taskCheck.lastCheck;
  assertJimengTaskFresh(config, job.currentTask, timestamp);
  if (taskCheck.status !== "done") {
    return {
      done: false,
      job,
      progress: {
        status: "generating",
        completedCount: job.completedImages.length,
        totalCount: input.recommendations.length,
      },
    };
  }

  const fileId = await runtime.uploadFileFromUrl({
    url: taskCheck.imageUrl,
    cloudPath: `${config.jimeng.outputPrefix}/${createResultCloudPath(
      input,
      job.currentTask.recommendation,
      job.currentTask.kind
    )}`,
  });

  job.completedImages.push({
    index: job.currentTask.index,
    fileId,
    recommendation: job.currentTask.recommendation,
  });
  job.currentIndex = job.completedImages.length;
  job.currentTask = null;
  job.updatedAt = runtime.now().toISOString();

  if (job.currentIndex >= input.recommendations.length) {
    const images = await finalizeJimengImages(runtime, config, input, job.completedImages);

    return {
      done: true,
      job: null,
      generated: {
        provider: config.provider,
        model: config.model,
        promptVersion: config.promptVersion,
        prompts,
        ...images,
      },
    };
  }

  const nextRecommendation = input.recommendations[job.currentIndex];
  const nextPromptBundle = prompts[job.currentIndex];
  const nextTaskId = await submitJimengTask(
    runtime,
    config,
    input,
    nextPromptBundle,
    "clean"
  );

  job.currentTask = {
    index: job.currentIndex,
    kind: "clean",
    recommendation: nextRecommendation,
    taskId: nextTaskId,
    submittedAt: runtime.now().toISOString(),
  };

  return {
    done: false,
    job,
    progress: {
      status: "generating",
      completedCount: job.completedImages.length,
      totalCount: input.recommendations.length,
    },
  };
}

function createJimengProvider(config, runtime) {
  return {
    async generate(input) {
      ensureJimengCredentials(config);

      const prompts = buildTryOnPrompts(input.recommendations, config);
      return continueJimengGeneration(
        runtime,
        config,
        input,
        prompts,
        input.existingJob
      );
    },
  };
}

function createImageProvider(config, runtime) {
  if (normalizeProvider(config.provider) === "jimeng") {
    return createJimengProvider(config, runtime);
  }

  return createMockProvider(config);
}

function inspectSelfie(checks) {
  const normalized = checks || {};
  const reasons = [];

  if (normalized.contentSafe === false) {
    reasons.push("content_unsafe");
  }

  if (normalized.faceDetected === false) {
    reasons.push("face_missing");
  }

  if (normalized.lipsVisible === false) {
    reasons.push("lips_not_visible");
  }

  if (Number(normalized.blurScore || 0) > 0.7) {
    reasons.push("image_blurry");
  }

  if (Number(normalized.occlusionScore || 0) > 0.6) {
    reasons.push("face_occluded");
  }

  return {
    passed: reasons.length === 0,
    reasons,
    safetyStatus: reasons.includes("content_unsafe") ? "rejected" : "passed",
    qualityStatus: reasons.length > (reasons.includes("content_unsafe") ? 1 : 0) ? "rejected" : "passed",
  };
}

function includesValue(values, expected) {
  if (!expected) {
    return false;
  }

  if (Array.isArray(values)) {
    return values.includes(expected);
  }

  return values === expected;
}

function getBudget(item) {
  return item.budgetRange || item.priceRange || "";
}

function scoreLipstick(item, preferences) {
  let score = Number(item.manualBoost || 0);

  if (includesValue(item.skinToneTags, preferences.skinTone)) {
    score += 100;
  }

  if (includesValue(item.sceneTags, preferences.scene)) {
    score += 20;
  }

  if (includesValue(item.styleTags, preferences.style)) {
    score += 10;
  }

  return score;
}

function toRecommendationSnapshot(item, rank, preferences) {
  return {
    rank,
    lipstickId: item._id,
    brand: item.brand || "",
    shadeName: item.shadeName || "",
    shadeCode: item.shadeCode || "",
    colorHex: item.colorHex || "",
    priceRange: item.priceRange || item.budgetRange || "",
    skinToneTags: item.skinToneTags || [],
    budgetRange: item.budgetRange || "",
    sceneTags: item.sceneTags || [],
    styleTags: item.styleTags || [],
    manualBoost: Number(item.manualBoost || 0),
    recommendationReason: item.recommendationReason || "",
    cautionNote: item.cautionNote || "",
    substitute: item.substitute || "",
    searchKeywords: item.searchKeywords || [],
    matchedPreferences: {
      skinTone: preferences.skinTone,
      budget: preferences.budget,
      scene: preferences.scene,
      style: preferences.style,
    },
  };
}

function rankLipsticks(lipsticks, preferences) {
  const ranked = lipsticks
    .filter((item) => item.status === "active")
    .filter((item) => includesValue(getBudget(item), preferences.budget))
    .map((item) => ({
      item,
      score: scoreLipstick(item, preferences),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return String(a.item._id).localeCompare(String(b.item._id));
    });
  const selected = [];
  const usedBrands = new Set();
  const usedColors = new Set();

  for (const entry of ranked) {
    const brandKey = String(entry.item.brand || "").trim().toLowerCase();
    const colorKey = String(entry.item.colorHex || "").trim().toLowerCase();

    if ((brandKey && usedBrands.has(brandKey)) || (colorKey && usedColors.has(colorKey))) {
      continue;
    }

    selected.push(entry);
    if (brandKey) {
      usedBrands.add(brandKey);
    }
    if (colorKey) {
      usedColors.add(colorKey);
    }

    if (selected.length >= RECOMMENDATION_LIMIT) {
      break;
    }
  }

  return selected
    .map((entry, index) =>
      toRecommendationSnapshot(entry.item, index + 1, preferences)
    );
}

function validatePreferences(data) {
  const preferences = data && data.preferences;

  if (!data || !data.testId || !preferences) {
    return null;
  }

  const required = ["skinTone", "budget", "scene", "style"];
  for (const field of required) {
    if (!preferences[field]) {
      return null;
    }
  }

  return {
    skinTone: preferences.skinTone,
    budget: preferences.budget,
    scene: preferences.scene,
    style: preferences.style,
  };
}

async function uploadSelfie(event, deps) {
  const data = (event && event.data) || {};
  const runtime = getRuntime(deps);
  const openid = runtime.wxContext && runtime.wxContext.OPENID;

  if (!openid) {
    return fail("LOGIN_REQUIRED", "OPENID is missing from WeChat context");
  }

  if (!data.tempFileID) {
    return fail("INVALID_PAYLOAD", "tempFileID is required");
  }

  const inspection = inspectSelfie(data.checks);

  if (!inspection.passed) {
    await runtime.deleteFile(data.tempFileID).catch(() => null);
    return fail("SELFIE_REJECTED", "Selfie did not pass safety or quality checks", {
      reasons: inspection.reasons,
      safetyStatus: inspection.safetyStatus,
      qualityStatus: inspection.qualityStatus,
    });
  }

  const nowDate = runtime.now();
  const now = nowDate.toISOString();
  const expiresAt = new Date(nowDate.getTime() + ONE_DAY_MS).toISOString();
  const testId = data.testId || runtime.id();
  const privatePath = `selfies/${openid}/${testId}/original.jpg`;
  const moved = await runtime.moveFile({
    from: data.tempFileID,
    to: privatePath,
  });
  const selfieFileId = moved.fileID;

  const testRecord = {
    _id: testId,
    openid,
    status: "selfie_uploaded",
    selfieFileId,
    safetyStatus: inspection.safetyStatus,
    qualityStatus: inspection.qualityStatus,
    generationStatus: "pending",
    previewRegenerateCount: 0,
    maxPreviewRegenerateCount: 3,
    activeReportId: "",
    createdAt: now,
    updatedAt: now,
    expiresAt,
  };

  await runtime.db.collection("try_on_tests").add({
    data: testRecord,
  });

  await runtime.db.collection("events").add({
    data: {
      type: "upload_selfie_success",
      openid,
      testId,
      selfieFileId,
      createdAt: now,
    },
  });

  return ok({
    testId,
    selfieFileId,
    safetyStatus: inspection.safetyStatus,
    qualityStatus: inspection.qualityStatus,
    expiresAt,
  });
}

async function submitPreferences(event, deps) {
  const data = (event && event.data) || {};
  const preferences = validatePreferences(data);
  const runtime = getRuntime(deps);
  const openid = runtime.wxContext && runtime.wxContext.OPENID;

  if (!openid) {
    return fail("LOGIN_REQUIRED", "OPENID is missing from WeChat context");
  }

  if (!preferences) {
    return fail("INVALID_PAYLOAD", "testId and complete preferences are required");
  }

  const now = runtime.now().toISOString();
  const lipsticksResult = await runtime.db
    .collection("lipsticks")
    .where({ status: "active" })
    .get();
  const recommendations = rankLipsticks(lipsticksResult.data || [], preferences);

  if (recommendations.length < RECOMMENDATION_LIMIT) {
    return fail("RECOMMENDATION_NOT_ENOUGH", "Not enough active lipsticks matched preferences", {
      recommendations,
    });
  }

  const reportPayload = {
    openid,
    testId: data.testId,
    version: 1,
    status: "active",
    snapshot: {
      preferences,
      recommendations,
      generatedAt: now,
    },
    previewImages: [],
    paidImages: [],
    shareCardImages: [],
    replacedByReportId: "",
    unlockedAt: "",
    expiresAt: "",
    deletedAt: "",
    createdAt: now,
  };
  const report = await runtime.db.collection("reports").add({
    data: reportPayload,
  });
  const reportId = report._id;

  await runtime.db.collection("try_on_tests").doc(data.testId).update({
    data: {
      preferences,
      status: "preferences_submitted",
      generationStatus: "recommendation_ready",
      activeReportId: reportId,
      updatedAt: now,
    },
  });

  await runtime.db.collection("events").add({
    data: {
      type: "preference_submit",
      openid,
      testId: data.testId,
      reportId,
      preferences,
      createdAt: now,
    },
  });

  return ok({
    testId: data.testId,
    reportId,
    recommendations,
  });
}

async function recordProviderRun(runtime, payload) {
  await runtime.db.collection("provider_runs").add({
    data: payload,
  });
}

async function recordGenerationEvent(runtime, payload) {
  await runtime.db.collection("events").add({
    data: payload,
  });
}

async function generateTryOnImages(event, deps) {
  const data = (event && event.data) || {};
  const runtime = getRuntime(deps);
  const openid = runtime.wxContext && runtime.wxContext.OPENID;

  if (!openid) {
    return fail("LOGIN_REQUIRED", "OPENID is missing from WeChat context");
  }

  if (!data.testId || !data.reportId) {
    return fail("INVALID_PAYLOAD", "testId and reportId are required");
  }

  const config = getProviderConfig(runtime.env);
  const retryIndex = Number(data.retryIndex || 0);
  const startedAt = Date.now();
  const now = runtime.now().toISOString();
  const testResult = await runtime.db
    .collection("try_on_tests")
    .doc(data.testId)
    .get();
  const reportResult = await runtime.db
    .collection("reports")
    .doc(data.reportId)
    .get();
  const testRecord = testResult.data || {};
  const reportRecord = reportResult.data || {};

  if (testRecord.openid !== openid || reportRecord.openid !== openid) {
    return fail("RESOURCE_NOT_FOUND", "Test or report does not belong to current user");
  }

  const recommendations =
    (reportRecord.snapshot && reportRecord.snapshot.recommendations) || [];

  if (recommendations.length !== IMAGE_COUNT) {
    return fail("INVALID_REPORT_SNAPSHOT", "Report snapshot must contain three recommendations");
  }

  const provider = createImageProvider(config, runtime);

  try {
    const generated = await provider.generate({
      testId: data.testId,
      reportId: data.reportId,
      selfieFileId: testRecord.selfieFileId,
      recommendations,
      prompt: config.prompt,
      negativePrompt: config.negativePrompt,
      timeoutMs: config.timeoutMs,
      existingJob: reportRecord.generationJob || null,
    });
    const durationMs = runtime.durationMs(startedAt);

    if (!generated.done) {
      await runtime.db.collection("reports").doc(data.reportId).update({
        data: {
          generationStatus: "generating",
          generationErrorCode: "",
          generationErrorMessage: "",
          generationJob: generated.job,
          updatedAt: now,
        },
      });

      await runtime.db.collection("try_on_tests").doc(data.testId).update({
        data: {
          generationStatus: "generating",
          updatedAt: now,
        },
      });

      return ok({
        testId: data.testId,
        reportId: data.reportId,
        provider: config.provider,
        status: generated.progress.status,
        completedCount: generated.progress.completedCount,
        totalCount: generated.progress.totalCount,
      });
    }

    await runtime.db.collection("reports").doc(data.reportId).update({
      data: {
        generationStatus: "success",
        generationErrorCode: "",
        generationErrorMessage: "",
        previewImages: generated.generated.previewImages,
        paidImages: generated.generated.paidImages,
        generationJob: null,
        updatedAt: now,
      },
    });

    await runtime.db.collection("try_on_tests").doc(data.testId).update({
      data: {
        generationStatus: "success",
        updatedAt: now,
      },
    });

    await recordProviderRun(runtime, {
      testId: data.testId,
      reportId: data.reportId,
      openid,
      provider: generated.generated.provider,
      model: generated.generated.model,
      promptVersion: generated.generated.promptVersion,
      status: "success",
      durationMs,
      retryIndex,
      timeoutMs: config.timeoutMs,
      errorCode: "",
      errorMessage: "",
      prompts: generated.generated.prompts,
      imageFileIds: generated.generated.imageFileIds,
      createdAt: now,
    });

    await recordGenerationEvent(runtime, {
      type: "generation_success",
      openid,
      testId: data.testId,
      reportId: data.reportId,
      provider: generated.generated.provider,
      imageFileIds: generated.generated.imageFileIds,
      createdAt: now,
    });

    return ok({
      testId: data.testId,
      reportId: data.reportId,
      provider: generated.generated.provider,
      status: "success",
      previewImages: generated.generated.previewImages,
      paidImages: generated.generated.paidImages,
    });
  } catch (error) {
    const durationMs = runtime.durationMs(startedAt);
    const errorCode = error.code || "IMAGE_PROVIDER_FAILED";
    const errorMessage = error.message || "Image provider failed";
    const retryable = error.retryable !== false;

    await runtime.db.collection("try_on_tests").doc(data.testId).update({
      data: {
        generationStatus: "failed",
        generationErrorCode: errorCode,
        updatedAt: now,
      },
    });

    await runtime.db.collection("reports").doc(data.reportId).update({
      data: {
        generationStatus: "failed",
        generationErrorCode: errorCode,
        generationErrorMessage: errorMessage,
        generationJob: reportRecord.generationJob || null,
        updatedAt: now,
      },
    });

    await recordProviderRun(runtime, {
      testId: data.testId,
      reportId: data.reportId,
      openid,
      provider: config.provider,
      model: config.model,
      promptVersion: config.promptVersion,
      status: "failed",
      durationMs,
      retryIndex,
      timeoutMs: config.timeoutMs,
      errorCode,
      errorMessage,
      errorDetails: error.details || null,
      prompts: [],
      imageFileIds: [],
      createdAt: now,
    });

    await recordGenerationEvent(runtime, {
      type: "generation_fail",
      openid,
      testId: data.testId,
      reportId: data.reportId,
      provider: config.provider,
      errorCode,
      errorMessage,
      retryable,
      createdAt: now,
    });

    return fail(errorCode, errorMessage, {
      retryable,
      retryIndex,
    });
  }
}

async function main(event, context, deps) {
  const action = event && event.action;

  if (action === "createTest") {
    return ok({ status: "draft" });
  }

  if (action === "uploadSelfie") {
    return await uploadSelfie(event, deps);
  }

  if (action === "submitPreferences") {
    return await submitPreferences(event, deps);
  }

  if (action === "regeneratePreview") {
    return ok({ status: "preview_refresh_queued" });
  }

  if (action === "generateTryOnImages") {
    return await generateTryOnImages(event, deps);
  }

  return unsupported(action);
}

exports.main = main;
exports.uploadSelfie = uploadSelfie;
exports.submitPreferences = submitPreferences;
exports.generateTryOnImages = generateTryOnImages;
exports.inspectSelfie = inspectSelfie;
exports.rankLipsticks = rankLipsticks;
exports.getProviderConfig = getProviderConfig;
exports.buildTryOnPrompts = buildTryOnPrompts;
