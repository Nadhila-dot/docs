import { afterAll, beforeAll, expect, test } from 'bun:test';

const base = 'http://localhost:3000';
let server: ReturnType<typeof Bun.spawn>;

beforeAll(async () => {
  server = Bun.spawn(['bun', 'scripts/serve.ts'], { stdout: 'ignore', stderr: 'inherit' });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error('Static preview server exited before becoming ready');
    try {
      if ((await fetch(base)).ok) return;
    } catch {}
    await Bun.sleep(100);
  }
  throw new Error('Static preview server did not become ready');
}, 15_000);

afterAll(async () => {
  server?.kill();
  if (server) await server.exited;
});

for (const route of ['/', '/docs/getting-started/install/', '/docs/api/', '/blog/']) {
  test(`${route} serves rendered HTML and reachable scripts`, async () => {
    const response = await fetch(base + route);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toMatch(/<html\b/i);
    expect(html).toMatch(/<h1\b/i);
    const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(match => match[1]!);
    expect(scripts.length).toBeGreaterThan(0);
    for (const src of scripts) {
      if (!src.startsWith('/')) continue;
      const asset = await fetch(base + src);
      expect(asset.status).toBe(200);
      expect((await asset.text()).length).toBeGreaterThan(0);
    }
  });
}

test('static search endpoint serves a usable JSON index', async () => {
  const response = await fetch(base + '/api/search');
  expect(response.status).toBe(200);
  expect(JSON.stringify(await response.json()).length).toBeGreaterThan(100);
});

test('unknown routes return the rendered 404 page', async () => {
  const response = await fetch(base + '/this-route-does-not-exist-ci');
  expect(response.status).toBe(404);
  expect(await response.text()).toMatch(/<html\b/i);
});
