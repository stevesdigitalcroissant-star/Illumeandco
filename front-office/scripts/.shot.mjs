import { chromium } from "playwright";
const [,, ...paths] = process.argv;
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();
await page.goto("http://localhost:3000/login");
await page.fill('input[name=email]', "demo@frontoffice.dev");
await page.fill('input[name=password]', "demo-front-office");
await page.click('button[type=submit]');
await page.waitForURL("**/app", { timeout: 30000 });
for (const p of paths) {
  await page.goto("http://localhost:3000" + p, { waitUntil: "networkidle" });
  const name = p.replace(/\W+/g, "_") || "root";
  await page.screenshot({ path: `/tmp/claude-0/shots/${name}.png`, fullPage: true });
  console.log("shot", p);
}
await browser.close();
