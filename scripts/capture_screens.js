// scripts/capture_screens.js
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  const chromeProcess = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
    "--headless=new",
    "--disable-gpu",
    "--remote-debugging-port=9222",
    "--no-first-run",
    "--no-default-browser-check"
  ], { stdio: "ignore" });

  try {
    let connected = false;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch("http://127.0.0.1:9222/json/version");
        if (res.ok) {
          connected = true;
          break;
        }
      } catch (e) {}
      await sleep(200);
    }
    if (!connected) throw new Error("Chrome did not start debugging port");

    const filePath = path.resolve(__dirname, "../index.html");
    const targetUrl = `file://${filePath}`;
    
    const newPageRes = await fetch("http://127.0.0.1:9222/json/new?" + encodeURIComponent(targetUrl), { method: "PUT" });
    const target = await newPageRes.json();
    const ws = new WebSocket(target.webSocketDebuggerUrl);

    let id = 1;
    const pending = new Map();
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.id && pending.has(data.id)) {
        pending.get(data.id)(data);
        pending.delete(data.id);
      }
    };

    await new Promise(r => ws.onopen = r);

    const send = (method, params = {}) => {
      return new Promise((resolve) => {
        const msgId = id++;
        pending.set(msgId, resolve);
        ws.send(JSON.stringify({ id: msgId, method, params }));
      });
    };

    await send("Page.enable");
    await send("Runtime.enable");
    await sleep(600);

    async function capture(filename, width, height, isMobile) {
      await send("Emulation.setDeviceMetricsOverride", {
        width,
        height,
        deviceScaleFactor: 2,
        mobile: isMobile
      });
      await send("Emulation.setTouchEmulationEnabled", { enabled: isMobile });
      await sleep(300);

      const res = await send("Page.captureScreenshot", { format: "png" });
      if (res.result && res.result.data) {
        fs.writeFileSync(filename, Buffer.from(res.result.data, "base64"));
        console.log(`Saved ${filename} (${width}x${height})`);
      } else {
        console.error(`Failed to capture ${filename}`, res);
      }
    }

    async function evaluate(expression) {
      return await send("Runtime.evaluate", { expression, returnByValue: true });
    }

    // 1. Mobile Feed
    console.log("1. Capturing Mobile Feed...");
    await evaluate(`window.app.switchTab("inbox"); window.app.closeDrawer();`);
    await capture("mobile-feed.png", 393, 852, true);

    // 2. Open First Deal Drawer on Mobile
    console.log("2. Capturing Mobile Drawer...");
    await evaluate(`window.app.openDrawer(window.app.filteredDeals[0].id);`);
    await sleep(400);
    await capture("mobile-drawer.png", 393, 852, true);

    // 3. Mobile Fast Triage Tab
    console.log("3. Capturing Mobile Fast Triage...");
    await evaluate(`window.app.closeDrawer(); window.app.switchTab("triage");`);
    await sleep(300);
    await capture("mobile-triage.png", 393, 852, true);

    // 4. Mobile Pipeline Kanban Tab
    console.log("4. Capturing Mobile Pipeline Kanban...");
    await evaluate(`window.app.switchTab("pipeline");`);
    await sleep(300);
    await capture("mobile-pipeline.png", 393, 852, true);

    // 5. Mobile Buyers CRM Tab
    console.log("5. Capturing Mobile Buyers CRM...");
    await evaluate(`window.app.switchTab("buyers");`);
    await sleep(300);
    await capture("mobile-buyers.png", 393, 852, true);

    // 6. Desktop Feed
    console.log("6. Capturing Desktop Feed...");
    await evaluate(`window.app.switchTab("inbox"); window.app.closeDrawer();`);
    await capture("desktop-feed.png", 1440, 900, false);

    // 7. Desktop with Detail Drawer open
    console.log("7. Capturing Desktop with Detail Drawer open...");
    await evaluate(`window.app.openDrawer(window.app.filteredDeals[0].id);`);
    await sleep(400);
    await capture("desktop-detail.png", 1440, 900, false);

    // 8. Desktop Pipeline Kanban
    console.log("8. Capturing Desktop Pipeline Kanban...");
    await evaluate(`window.app.closeDrawer(); window.app.switchTab("pipeline");`);
    await sleep(300);
    await capture("desktop-pipeline.png", 1440, 900, false);

    ws.close();
    console.log("All screenshots captured successfully!");
  } finally {
    chromeProcess.kill();
  }
}

run().catch(err => {
  console.error("Error capturing screens:", err);
  process.exit(1);
});
