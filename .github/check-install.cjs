const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');

async function main() {
  const baseURL = process.env.SHELTER_TEST_URL;
  assert.ok(baseURL && process.env.ADMIN_PASSWORD, 'Run against a fresh test installation.');
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_EXECUTABLE,
    headless: true,
  });
  try {
    const page = await browser.newPage({ baseURL });
    const api = page.request;
    const catalog = await (await api.get('/api/catalog')).json();
    assert.equal(catalog.length, 36);
    for (const animal of catalog) {
      const cover = await api.get('/' + animal.pictureURL.replace(/^\/+/, ''));
      assert.equal(cover.status(), 200);
      assert.match(cover.headers()['content-type'], /^image\//);
    }

    await page.goto('/catalog');
    const animalLink = page.locator('a.catalog-detail').first();
    await animalLink.waitFor();
    const href = await animalLink.getAttribute('href');
    const animal = catalog.find(row => href === '/catalog/' + row.animalID);
    assert.ok(animal);
    await page.locator('a.catalog-detail[href="' + href + '"]').click();
    await page.waitForURL(new URL(href, baseURL).href);
    const title = page.locator('h1').filter({ hasText: animal.animalName });
    await title.waitFor();
    assert.equal((await title.textContent()).trim(), animal.animalName + '。');
    const detail = await (await api.get('/api' + href)).json();
    assert.ok(detail.description && detail.restrictions);
    const posts = await (await api.get('/api/community/posts')).json();
    assert.equal(posts.total, 20);

    await page.goto('/');
    await page.getByPlaceholder('请输入管理员账号').fill('admin');
    await page.getByPlaceholder('请输入密码').fill(process.env.ADMIN_PASSWORD);
    await page.getByRole('button', { name: '登录工作台' }).click();
    await page.locator('#admin-sidebar').waitFor();
    assert.equal((await (await api.get('/api/session')).json()).role, 'admin');

    const before = await (await api.get('/api/admin/backups')).json();
    assert.equal(before.encryption.ready, true);
    if (process.env.CHECK_RESTART === '1') {
      assert.equal(before.items.length, 1, 'previous backup survives restart');
    } else {
      const created = await api.post('/api/admin/backups', { timeout: 120000 });
      assert.equal(created.status(), 201, await created.text());
      const { id, encrypted } = await created.json();
      assert.equal(encrypted, true);
      const verified = await api.post('/api/admin/backups/' + id + '/verify', { timeout: 120000 });
      assert.equal(verified.status(), 200, await verified.text());
      assert.equal((await verified.json()).ok, true);
    }
    console.log('Browser catalog, animal detail, 36 images, 20 community posts, admin login and encrypted backup passed.');
  } finally {
    await browser.close();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
