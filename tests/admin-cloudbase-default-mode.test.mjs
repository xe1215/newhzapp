import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

globalThis.window = {
  location: {
    hostname: "127.0.0.1",
  },
  sessionStorage: {
    getItem() {
      return "";
    },
    setItem() {},
    removeItem() {},
  },
};

const moduleUrl = pathToFileURL(path.resolve("admin/src/lib/admin-api.js")).href;
const adminApi = await import(moduleUrl);
const runtimeDebug = adminApi.getAdminRuntimeDebug();

assert.equal(runtimeDebug.previewEnabled, false);
assert.equal(runtimeDebug.isPreviewMode, false);

console.log("ok - admin defaults to CloudBase mode unless preview is explicitly enabled");
