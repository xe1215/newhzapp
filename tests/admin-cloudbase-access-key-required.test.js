const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function test(name, fn) {
  Promise.resolve()
    .then(fn)
    .then(() => console.log(`ok - ${name}`))
    .catch((error) => {
      console.error(`not ok - ${name}`);
      console.error(error);
      process.exitCode = 1;
    });
}

test("admin cloud runtime requires an explicit CloudBase access key instead of anonymous browser auth fallback", () => {
  const apiSource = readText("admin/src/lib/admin-api.js");
  const envExample = readText("admin/.env.example");

  assert.match(apiSource, /VITE_CLOUDBASE_ACCESS_KEY/);
  assert.match(apiSource, /CloudBase Web access key is required for the developer console/i);
  assert.doesNotMatch(apiSource, /signInAnonymously/);
  assert.match(envExample, /VITE_CLOUDBASE_ACCESS_KEY=/);
});

test("admin cloud runtime signs in with CloudBase username and password before invoking the protected admin function", () => {
  const apiSource = readText("admin/src/lib/admin-api.js");

  assert.match(apiSource, /auth\.signInWithPassword\s*\(\s*\{/);
  assert.match(apiSource, /session\.user\s*&&\s*session\.user\.is_anonymous/);
});

test("admin overview module uses the 仪表盘 wording and avoids leftover English labels in the shell", () => {
  const appSource = readText("admin/src/App.jsx");
  const constantsSource = readText("cloudfunctions/admin/constants.js");

  assert.match(appSource, /运营仪表盘/);
  assert.match(constantsSource, /运营仪表盘/);
  assert.doesNotMatch(appSource, /label="Username"|label="Password"|Enter developer username|Enter developer password/);
  assert.doesNotMatch(appSource, /Visits|Tests created|Generation success|Paid orders|Revenue|Report views|Share visits/);
});
