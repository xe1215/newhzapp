function createJimengProvider(deps) {
  const {
    runtime,
    config,
    buildTryOnPrompts,
    ensureJimengCredentials,
    callJimengApi,
    resolveTaskId,
    resolveImageUrls,
    resolveTaskStatus,
    createJimengResponseDiagnostic,
    createJimengTaskCheckSummary,
    createProviderError,
    assertJimengTaskFresh,
    previewWatermarkText,
  } = deps;

  function createResultCloudPath(input, recommendation, kind) {
    return `${input.reportId}/${recommendation.rank}-${recommendation.lipstickId}-${kind}.jpg`;
  }

  async function createWatermarkedPreview(input, completedImage) {
    return runtime.createWatermarkedFile({
      sourceFileId: completedImage.fileId,
      cloudPath: `${config.jimeng.outputPrefix}/${createResultCloudPath(
        input,
        completedImage.recommendation,
        "watermark"
      )}`,
      watermarkText: previewWatermarkText,
    });
  }

  async function finalizeJimengImages(input, completedImages) {
    const orderedImages = [...completedImages]
      .sort((a, b) => a.index - b.index)
      .map((item) => ({
        ...item,
        recommendation: item.recommendation || input.recommendations[item.index],
      }));
    const paidImages = orderedImages.map((item) => item.fileId);
    const previewImages = [];

    for (const image of orderedImages) {
      previewImages.push(await createWatermarkedPreview(input, image));
    }

    return {
      previewImages,
      paidImages,
      imageFileIds: [...previewImages, ...paidImages],
    };
  }

  async function submitJimengTask(input, promptBundle, kind) {
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

  async function checkJimengTaskResult(taskId) {
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

  async function continueJimengGeneration(input, prompts, existingJob) {
    const timestamp = runtime.now().toISOString();
    const job = normalizeJimengJob(existingJob, prompts);

    if (!job.startedAt) {
      job.startedAt = timestamp;
    }

    job.updatedAt = timestamp;
    job.promptVersion = config.promptVersion;

    if (job.currentIndex >= input.recommendations.length) {
      const images = await finalizeJimengImages(input, job.completedImages);
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
      const taskId = await submitJimengTask(input, promptBundle, "clean");

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

    const taskCheck = await checkJimengTaskResult(job.currentTask.taskId);
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
      const images = await finalizeJimengImages(input, job.completedImages);

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
    const nextTaskId = await submitJimengTask(input, nextPromptBundle, "clean");

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

  return {
    async generate(input) {
      ensureJimengCredentials(config);

      const prompts = buildTryOnPrompts(input.recommendations, config);
      return continueJimengGeneration(input, prompts, input.existingJob);
    },
  };
}

module.exports = {
  createJimengProvider,
};
