const crypto = require("crypto");
const https = require("https");

function createJimengHelpers(deps) {
  const {
    roleLabels,
    texturePrompts,
    tryonNegativePrompt,
    defaultReferenceStrength,
    jimengPromptLimit,
    previewWatermarkText,
    watermarkInstruction,
    cleanImageInstruction,
    createProviderError,
    ensureJimengCredentials,
  } = deps;

  function resolveRoleLabel(recommendation, index) {
    if (recommendation.role && roleLabels[recommendation.role]) {
      return roleLabels[recommendation.role];
    }

    return ["最适合你", "日常不出错", "风格加分款"][index] || `推荐 ${index + 1}`;
  }

  function resolveTextureKey(recommendation) {
    const texture = recommendation.texture || recommendation.textureLabel || "velvet";
    const normalized = String(texture).toLowerCase();

    if (texturePrompts[normalized]) {
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

    if (prompt.length <= jimengPromptLimit) {
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
${texturePrompts[textureKey]}

输出要求：
输出完整图像，尺寸、比例和构图必须与参考图一致。图像中不要添加任何文字、标签、品牌、色号、价格、推荐理由、边框、贴纸或额外装饰。`;

    return {
      role,
      prompt,
      cleanPrompt: `${prompt}\n${cleanImageInstruction}`,
      watermarkedPrompt: `${prompt}\n${watermarkInstruction}`,
      cleanApiPrompt: buildJimengApiPrompt(recommendation, index, config, "clean"),
      watermarkedApiPrompt: buildJimengApiPrompt(
        recommendation,
        index,
        config,
        "watermark"
      ),
      negativePrompt: `${tryonNegativePrompt}\n${config.negativePrompt || ""}`,
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
      responseKeys:
        response && typeof response === "object" ? Object.keys(response).slice(0, 30) : [],
      response: compactDiagnosticValue(response, 0),
    };
  }

  function createJimengHttpDiagnostic(response, action, attempt) {
    return {
      action,
      attempt,
      statusCode: response.statusCode,
      headers: compactDiagnosticValue(response.headers || {}, 0),
      body: compactDiagnosticValue(
        response.json && Object.keys(response.json).length > 0 ? response.json : response.body,
        0
      ),
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
    const text = watermarkText || previewWatermarkText;
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

  function callJimengApi(runtime, config, action, payload) {
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

    return (async () => {
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
    })();
  }

  return {
    buildTryOnPrompts,
    buildTryOnPrompt,
    safeJsonParse,
    parseJsonObject,
    compactDiagnosticValue,
    createJimengResponseDiagnostic,
    createJimengHttpDiagnostic,
    isRetryableJimengHttpStatus,
    httpRequest,
    downloadUrl,
    applyVisibleWatermark,
    callJimengApi,
    resolveTaskId,
    resolveImageUrls,
    resolveTaskStatus,
    createJimengTaskCheckSummary,
    assertJimengTaskFresh,
  };
}

module.exports = {
  createJimengHelpers,
};
