const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE = process.env.APP_URL || 'http://localhost:4200';
const API = process.env.API_URL || 'http://localhost:3001/api/v1';
const ROOT = path.resolve(__dirname, '..', 'docs', 'screenshots');
const AUTH_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dd-auth-'));
const PW = 'password123';

const VIEWPORTS = [
  { name: 'desktop', dir: ROOT, viewport: { width: 1440, height: 900 } },
  { name: 'mobile', dir: path.join(ROOT, 'mobile'), viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
];

const ROLES = {
  citizen: 'citizen1@email.com',
  admin: 'admin@city.gov',
  mayor: 'mayor@city.gov',
  dept: 'pw.head@city.gov',
  council: 'council1@city.gov',
  staff: 'staff1@city.gov',
  ward: 'wardrep1@city.gov',
  volunteer: 'volunteer1@email.com',
  auditor: 'auditor@city.gov',
  media: 'press@herald.com',
};

async function loginOnce(browser, role) {
  const stateFile = path.join(AUTH_DIR, role + '.json');
  if (fs.existsSync(stateFile)) return stateFile;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await page.fill('input[name="email"]', ROLES[role]);
  await page.fill('input[name="password"]', PW);
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => !location.pathname.startsWith('/login'), null, { timeout: 20000 });
  await page.waitForLoadState('networkidle');
  await ctx.storageState({ path: stateFile });
  await ctx.close();
  console.log('· authenticated', role);
  return stateFile;
}

async function capture(browser, vp) {
  fs.mkdirSync(vp.dir, { recursive: true });

  const shots = [];
  let page = null;
  let currentStateFile = null;
  async function closeCurrent() {
    if (!page) return;
    const ctx = page.context();
    // Persist rotated refresh cookie / new tokens back to the state file.
    if (currentStateFile) await ctx.storageState({ path: currentStateFile }).catch(() => {});
    await ctx.close();
    page = null;
    currentStateFile = null;
  }
  async function useRole(role) {
    await closeCurrent();
    currentStateFile = await loginOnce(browser, role);
    const ctx = await browser.newContext({
      storageState: currentStateFile,
      viewport: vp.viewport,
      deviceScaleFactor: vp.deviceScaleFactor || 1,
      isMobile: vp.isMobile || false,
      hasTouch: vp.hasTouch || false,
    });
    await ctx.grantPermissions(['geolocation']);
    ctx.setGeolocation({ latitude: 40.7128, longitude: -74.006 });
    page = await ctx.newPage();
  }

  async function goto(url, opts = {}) {
    await page.goto(BASE + url, { waitUntil: 'networkidle', ...opts });
  }
  async function shot(name, fullPage = false) {
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(vp.dir, name + '.png'), fullPage });
    shots.push(name);
    console.log('✓', vp.name, name);
  }

  // Public screens (no auth)
  const pubCtx = await browser.newContext({ viewport: vp.viewport, deviceScaleFactor: vp.deviceScaleFactor || 1, isMobile: vp.isMobile || false, hasTouch: vp.hasTouch || false });
  await closeCurrent();
  page = await pubCtx.newPage();
  await goto('/login');
  await shot('01-login');
  await goto('/portal');
  await shot('02-transparency-portal', true);
  await pubCtx.close();

  // Citizen
  await useRole('citizen');
  await goto('/citizen');
  await shot('03-citizen-dashboard', true);
  await goto('/issues/new');
  await shot('04-report-issue', true);
  await goto('/citizen/nearby', { waitUntil: 'load' });
  await page.waitForTimeout(5000); // leaflet tiles
  await shot('05-issue-map');
  await goto('/citizen/polls');
  await shot('19-polls', true);
  await goto('/citizen/forums');
  await shot('20-forums', true);
  await goto('/citizen/events');
  await shot('21-events', true);

  // Admin
  await useRole('admin');
  await goto('/admin');
  await shot('06-admin-dashboard', true);
  await goto('/issues');
  await shot('07-issue-tracker');
  await page.click('.issue-row, [class*="issue"] a, table tbody tr, a[href^="/issues/"]').catch(() => {});
  await page.waitForTimeout(1500);
  if (!/\/issues\/[0-9a-f-]+/.test(page.url())) {
    const first = await (await page.context().request.get(API + '/issues?limit=1')).json();
    await goto('/issues/' + first.data[0].id);
  }
  await shot('08-issue-detail', true);
  await goto('/admin/documents');
  await shot('09-legislation-kb', true);

  // Mayor
  await useRole('mayor');
  await goto('/mayor');
  await shot('10-mayor-dashboard', true);
  await goto('/mayor/analytics');
  await shot('18-analytics', true);

  // Remaining role dashboards
  await useRole('dept');
  await goto('/department');
  await shot('11-department-dashboard', true);

  await useRole('council');
  await goto('/council');
  await shot('12-council-dashboard', true);

  await useRole('staff');
  await goto('/staff');
  await shot('13-staff-dashboard', true);

  await useRole('ward');
  await goto('/ward');
  await shot('14-ward-dashboard', true);

  await useRole('volunteer');
  await goto('/volunteer');
  await shot('15-volunteer-dashboard', true);

  await useRole('auditor');
  await goto('/auditor');
  await shot('16-auditor-dashboard', true);
  await goto('/auditor/logs');
  await shot('22-audit-logs');

  await useRole('media');
  await goto('/media');
  await shot('17-media-dashboard', true);

  await closeCurrent();
  return shots.length;
}

(async () => {
  const browser = await chromium.launch();
  let total = 0;
  for (const vp of VIEWPORTS) total += await capture(browser, vp);
  await browser.close();
  fs.rmSync(AUTH_DIR, { recursive: true, force: true });
  console.log('Done:', total, 'screenshots in', ROOT);
})().catch((e) => { console.error(e); process.exit(1); });
