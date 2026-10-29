// Generates the README project mockups in ../assets.
//   node mockups.mjs              -> regenerate every mockup
//   node mockups.mjs glacierguard -> regenerate only the named slug(s)
// Desktop mockups screenshot the live site, so re-run after a redesign.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../assets/', import.meta.url));

const desktops = [
  // wait = ms to idle after load; raise it for sites whose content streams in late.
  { slug: 'campus-sibling', url: 'https://campussibling-wnfeccgs.onslate.in', wait: 6000 },
  { slug: 'sentinalai', url: 'https://sentinalai.dev', wait: 5000 },
  // Satellite map tiles arrive well after 'load'.
  { slug: 'glacierguard', url: 'https://glacierguard.lathiaayush.com', wait: 15000 },
  { slug: 'aarambhsat', url: 'https://aarambhsat.lathiaayush.com', wait: 5000 },
  // press = key to send after load, e.g. to skip an intro animation.
  { slug: 'bridgesentry', url: 'https://bridgesentry.vercel.app', wait: 6000, press: 'Space' },
];

// Pulled from the app's public repo instead of a local path so this runs on any machine.
const RAW = 'https://raw.githubusercontent.com/lathi-aayush/install-word-workout-generator-app/main/docs/screenshots/V2.0.0%20ui/';
const phones = [
  {
    slug: 'word-workout',
    shots: ['start-session-plan-selected.png', 'today-dashboard.png', 'history-achievements.png'].map((f) => RAW + f),
  },
];

// Canvas is 1600x1000 so the image stays sharp on retina when GitHub shrinks it to ~half width.
const W = 1600, H = 1000;
const VIEWPORT = { width: 1440, height: 900 };

// Soft multi-blob gradient in the spirit of recent macOS wallpapers, built in CSS
// so no copyrighted wallpaper image ships with the repo.
const wallpaper = `
  background:
    radial-gradient(60% 80% at 15% 20%, #7c5cff 0%, transparent 60%),
    radial-gradient(55% 70% at 85% 15%, #ff7ab6 0%, transparent 60%),
    radial-gradient(70% 80% at 80% 95%, #ffb35c 0%, transparent 60%),
    radial-gradient(60% 70% at 10% 95%, #3fb5ff 0%, transparent 60%),
    #2b1d5c;`;

const page = (body) => `<!doctype html><html><head><style>
  * { box-sizing: border-box; margin: 0; }
  body { width: ${W}px; height: ${H}px; ${wallpaper} display: flex; align-items: center;
         justify-content: center; font-family: -apple-system, 'Segoe UI', sans-serif; overflow: hidden; }
</style></head><body>${body}</body></html>`;

function desktopHtml(shotB64, url) {
  const host = new URL(url).host;
  return page(`
  <div style="width:1360px;border-radius:14px;overflow:hidden;background:#1e1e22;
              box-shadow:0 40px 90px rgba(0,0,0,.45),0 0 0 1px rgba(255,255,255,.12);">
    <div style="height:44px;display:flex;align-items:center;padding:0 18px;background:#2a2a2f;position:relative;">
      <span style="width:13px;height:13px;border-radius:50%;background:#ff5f57;margin-right:8px"></span>
      <span style="width:13px;height:13px;border-radius:50%;background:#febc2e;margin-right:8px"></span>
      <span style="width:13px;height:13px;border-radius:50%;background:#28c840"></span>
      <div style="position:absolute;left:50%;transform:translateX(-50%);padding:5px 90px;border-radius:7px;
                  background:#3a3a40;color:#c9c9cf;font-size:14px;">${host}</div>
    </div>
    <img src="data:image/jpeg;base64,${shotB64}" style="display:block;width:1360px;height:850px;object-fit:cover;object-position:top">
  </div>`);
}

function phoneHtml(shotsB64) {
  // The source screenshots are already store-style cards (device + caption on teal),
  // so they get no extra bezel; wrapping them in a phone frame looked like a phone in a phone.
  // Middle card is raised and larger so the trio reads as one composition, not a grid.
  const card = (b64, scale, lift) => `
    <img src="data:image/png;base64,${b64}"
         style="width:360px;height:800px;margin:0 22px;border-radius:30px;display:block;
                transform:translateY(${lift}px) scale(${scale});
                box-shadow:0 35px 80px rgba(0,0,0,.45),0 0 0 1px rgba(255,255,255,.15);">`;
  return page(card(shotsB64[0], 0.92, 30) + card(shotsB64[1], 1.06, -10) + card(shotsB64[2], 0.92, 30));
}

async function render(browser, html, slug) {
  const p = await browser.newPage({ viewport: { width: W, height: H } });
  await p.setContent(html, { waitUntil: 'load' });
  // JPEG keeps each mockup a few hundred KB; PNG of a gradient wallpaper is several MB.
  await writeFile(OUT + slug + '.jpg', await p.screenshot({ type: 'jpeg', quality: 85 }));
  await p.close();
  console.log('wrote assets/' + slug + '.jpg');
}

async function main() {
  const only = process.argv.slice(2);
  const want = (s) => only.length === 0 || only.includes(s);
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();

  for (const { slug, url, wait, press } of desktops.filter((d) => want(d.slug))) {
    const p = await browser.newPage({ viewport: VIEWPORT });
    try {
      // 'networkidle' never settles on sites with live sockets/maps, so wait for load
      // and then give intro animations and lazy content time to finish.
      await p.goto(url, { waitUntil: 'load', timeout: 60000 });
      if (press) {
        await p.waitForTimeout(1500);
        await p.keyboard.press(press);
      }
      // Lazy-loaded images (e.g. listing photos) only fetch once scrolled into view,
      // so sweep down the page and back before taking the above-the-fold shot.
      for (let y = 0; y <= 3000; y += 600) {
        await p.mouse.wheel(0, 600);
        await p.waitForTimeout(250);
      }
      await p.evaluate(() => window.scrollTo(0, 0));
      await p.waitForTimeout(wait);
      const shot = await p.screenshot({ type: 'jpeg', quality: 92 });
      await render(browser, desktopHtml(shot.toString('base64'), url), slug);
    } catch (e) {
      console.error(`FAILED ${slug} (${url}): ${e.message}`);
    } finally {
      await p.close();
    }
  }

  for (const { slug, shots } of phones.filter((d) => want(d.slug))) {
    const b64 = await Promise.all(
      shots.map(async (u) => Buffer.from(await (await fetch(u)).arrayBuffer()).toString('base64')),
    );
    await render(browser, phoneHtml(b64), slug);
  }

  await browser.close();
}

main();
