import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("最小项目结构不包含自建运营后台目录", () => {
  const root = process.cwd();

  assert.equal(existsSync(resolve(root, "admin-web")), false);
  assert.equal(existsSync(resolve(root, "cloudfunctions", "admin")), false);
});

test("最小项目结构保留小程序、用户云函数、定时任务、图像服务和 shared", () => {
  const root = process.cwd();

  for (const path of [
    "miniprogram",
    "cloudfunctions/user",
    "cloudfunctions/scheduled",
    "image-service",
    "shared",
  ]) {
    assert.equal(existsSync(resolve(root, path)), true, `${path} should exist`);
  }
});
