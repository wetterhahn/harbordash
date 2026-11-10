const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { once } = require("node:events");

test("server refreshes stored icons without browser requests", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "homebase-background-test-"));
  const artwork = Buffer.from([0, 0, 1, 0, 1, 0, 42]);
  let iconRequests = 0;
  let activeRequests = 0;
  let maxActiveRequests = 0;
  const fixture = http.createServer((req, res) => {
    if (req.url === "/brand.ico") {
      iconRequests += 1;
      activeRequests += 1;
      maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
      setTimeout(() => {
        activeRequests -= 1;
        res.writeHead(200, { "Content-Type": "image/x-icon" });
        res.end(artwork);
      }, 10);
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end('<link rel="icon" href="/brand.ico">');
    }
  });
  fixture.listen(0, "127.0.0.1");
  await once(fixture, "listening");
  const origin = `http://127.0.0.1:${fixture.address().port}`;
  const urls = ["a", "b", "fresh"].map((name) => `${origin}/${name}`);
  const cachePaths = urls.map((url) => path.join(directory, "favicons", crypto.createHash("sha256").update(url).digest("hex")));
  fs.mkdirSync(path.join(directory, "favicons"));
  cachePaths.forEach((cachePath, index) => {
    fs.writeFileSync(`${cachePath}.bin`, Buffer.from([0, 0, 1, 0, 1, 0, 9]));
    fs.writeFileSync(`${cachePath}.json`, JSON.stringify({ contentType: "image/x-icon", updatedAt: index === 2 ? Date.now() : 1, policyVersion: 2 }));
  });
  fs.writeFileSync(path.join(directory, "homebase.json"), JSON.stringify({
    schemaVersion: 5, setupComplete: true, activeProfileId: "test", admin: { allowedIps: [] },
    profiles: [{ id: "test", name: "Test", categories: [{ id: "links", name: "Links" }],
      links: urls.map((url, index) => ({ id: String(index), title: "Test", url, category: "Links" })) }]
  }));
  const child = spawn(process.execPath, [path.join(__dirname, "../server.js")], {
    env: { ...process.env, HOST: "127.0.0.1", PORT: "0", DATA_DIR: directory, ADMIN_PASSWORD: "test-password-only-12345", ALLOW_INSECURE_HTTP: "true", APP_ORIGIN: "" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  t.after(async () => {
    child.kill();
    if (child.exitCode === null) await once(child, "exit");
    await new Promise((resolve) => fixture.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  await new Promise((resolve, reject) => {
    child.stdout.on("data", (data) => { if (String(data).includes("HarborDash running")) resolve(); });
    child.once("error", reject);
    child.once("exit", (code) => reject(new Error(`server exited: ${code}`)));
  });
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline && !fs.readFileSync(`${cachePaths[1]}.bin`).equals(artwork)) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.deepEqual(fs.readFileSync(`${cachePaths[0]}.bin`), artwork);
  assert.deepEqual(fs.readFileSync(`${cachePaths[1]}.bin`), artwork);
  assert.equal(iconRequests, 2);
  assert.equal(maxActiveRequests, 1);
  assert.equal(fs.readFileSync(`${cachePaths[2]}.bin`).at(-1), 9);
});
