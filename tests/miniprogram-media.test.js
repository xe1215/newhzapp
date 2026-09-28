const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  resolveCloudFile,
  resolveCloudFileList,
  resolveMediaSource,
} = require("../miniprogram/utils/media");

async function run() {
  let calls = 0;
  const emptyList = await resolveCloudFileList([null, "", false], "Look", () => {
    calls += 1;
    return Promise.resolve({ fileList: [] });
  });
  assert.deepStrictEqual(emptyList, []);
  assert.strictEqual(calls, 0);

  const resolvedList = await resolveCloudFileList(
    ["cloud://first", null, "cloud://second", "cloud://third"],
    "",
    (fileList) => {
      assert.deepStrictEqual(fileList, [
        "cloud://first",
        "cloud://second",
        "cloud://third",
      ]);
      return Promise.resolve({
        fileList: [
          { tempFileURL: "https://temp/first", fileID: "cloud://returned-first" },
          { fileID: "cloud://returned-second" },
          {},
        ],
      });
    }
  );
  assert.deepStrictEqual(resolvedList, [
    { fileID: "cloud://first", url: "https://temp/first", title: "Item 1" },
    { fileID: "cloud://second", url: "cloud://returned-second", title: "Item 2" },
    { fileID: "cloud://third", url: "cloud://third", title: "Item 3" },
  ]);

  const listError = new Error("list resolution failed");
  await assert.rejects(
    resolveCloudFileList(["cloud://first"], "Look", () => Promise.reject(listError)),
    (error) => error === listError
  );

  calls = 0;
  assert.strictEqual(
    await resolveCloudFile("", () => {
      calls += 1;
      return Promise.resolve({ fileList: [] });
    }),
    ""
  );
  assert.strictEqual(calls, 0);

  assert.strictEqual(
    await resolveCloudFile("cloud://original", (fileList) => {
      assert.deepStrictEqual(fileList, ["cloud://original"]);
      return Promise.resolve({ fileList: [{ tempFileURL: "https://temp/original" }] });
    }),
    "https://temp/original"
  );
  assert.strictEqual(
    await resolveCloudFile("cloud://missing", () => Promise.resolve({ fileList: [] })),
    ""
  );
  assert.strictEqual(
    await resolveCloudFile("cloud://failed", () => Promise.reject(new Error("failed"))),
    ""
  );

  calls = 0;
  assert.strictEqual(
    await resolveMediaSource("https://cdn/product.png", () => {
      calls += 1;
      return Promise.resolve({ fileList: [] });
    }),
    "https://cdn/product.png"
  );
  assert.strictEqual(calls, 0);
  assert.strictEqual(await resolveMediaSource(null), "");
  assert.strictEqual(
    await resolveMediaSource("cloud://product", () =>
      Promise.resolve({ fileList: [{ tempFileURL: "https://temp/product" }] })
    ),
    "https://temp/product"
  );

  const previousWx = global.wx;
  let defaultAdapterInput = null;
  global.wx = {
    cloud: {
      getTempFileURL({ fileList }) {
        defaultAdapterInput = fileList;
        return Promise.resolve({ fileList: [{ tempFileURL: "https://temp/default" }] });
      },
    },
  };
  try {
    assert.deepStrictEqual(await resolveCloudFileList(["cloud://default"], "Look"), [
      { fileID: "cloud://default", url: "https://temp/default", title: "Look 1" },
    ]);
    assert.deepStrictEqual(defaultAdapterInput, ["cloud://default"]);
    assert.strictEqual(await resolveCloudFile("cloud://default-single"), "https://temp/default");
    assert.deepStrictEqual(defaultAdapterInput, ["cloud://default-single"]);
  } finally {
    global.wx = previousWx;
  }

  const pagesRoot = path.join(__dirname, "..", "miniprogram", "pages");
  const pageScripts = fs
    .readdirSync(pagesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(pagesRoot, entry.name, "index.js"))
    .filter((filePath) => fs.existsSync(filePath));
  pageScripts.forEach((filePath) => {
    assert.doesNotMatch(
      fs.readFileSync(filePath, "utf8"),
      /getTempFileURL/,
      `${path.relative(pagesRoot, filePath)} should resolve media through utils/media`
    );
  });
}

run()
  .then(() => console.log("ok - miniprogram media URL resolution"))
  .catch((error) => {
    console.error("not ok - miniprogram media URL resolution");
    console.error(error);
    process.exitCode = 1;
  });
