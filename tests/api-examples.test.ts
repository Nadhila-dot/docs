import { expect, test } from 'bun:test';
import { parse } from 'yaml';
import { compile } from '@mdx-js/mdx';
import { examples, requestExamples, sample, type Operation, type Parameter } from '../scripts/lib/api-examples';

const spec = parse(await Bun.file('public/openapi/openapi.yaml').text());
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

for (const [endpoint, pathItem] of Object.entries(spec.paths) as [string, Record<string, Operation> & { parameters?: Parameter[] }][]) {
  for (const [method, raw] of Object.entries(pathItem)) {
    if (!['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(method)) continue;
    const operation = raw as Operation;
    test(`${method.toUpperCase()} ${endpoint}: generated fetch examples send the documented request`, async () => {
      const items = examples(method, endpoint, operation, pathItem.parameters);
      expect(items.map(item => item.label)).toEqual(['cURL', 'JavaScript', 'TypeScript', 'Python', 'Go', 'Rust']);
      for (const language of ['js', 'ts']) {
        const code = items.find(item => item.language === language)!.code;
        const compiled = new Bun.Transpiler({ loader: language as 'js' | 'ts', target: 'bun' }).transformSync(code);
        let called = false;
        await new AsyncFunction('fetch', 'process', 'console', compiled)(async (url: string, init: RequestInit) => {
          called = true;
          expect(url).toStartWith('https://ctrlpanel.hosting.gg/api/');
          expect(url).not.toMatch(/[{}]/);
          expect(init.method).toBe(method.toUpperCase());
          expect(new Headers(init.headers).get('Authorization')).toBe('Bearer test-token');
          const content = operation.requestBody?.content['application/json'];
          if (content) expect(JSON.parse(init.body as string)).toEqual(content.example ?? sample(content.schema));
          else expect(init.body).toBeUndefined();
          return new Response('', { status: 200 });
        }, { env: { CTRLPANEL_API_TOKEN: 'test-token' } }, { log() {} });
        expect(called).toBe(true);
      }
      expect(items[0]!.code).not.toContain('\n+');
      expect(items[0]!.code).not.toContain('@request.json');
      const markdown = requestExamples(method, endpoint, operation, pathItem.parameters);
      expect(markdown.match(/<Tab value=/g)?.length).toBe(6);
      await compile(markdown);
    });
  }
}

test('fetch examples handle empty 204 responses and report HTTP failures', async () => {
  const code = examples('delete', '/api/users/{id}', { operationId: 'delete' })[1]!.code;
  const run = new AsyncFunction('fetch', 'process', 'console', code);
  const process = { env: { CTRLPANEL_API_TOKEN: 'test-token' } };
  await run(async () => new Response(null, { status: 204 }), process, { log() {} });
  await expect(run(async () => new Response('Denied', { status: 403 }), process, { log() {} })).rejects.toThrow('HTTP 403: Denied');
  await expect(run(() => { throw new Error('Must not send a request'); }, { env: {} }, { log() {} })).rejects.toThrow('Set CTRLPANEL_API_TOKEN');
});

test('required query parameters are encoded and JSON values retain their types', () => {
  const operation = { operationId: 'query', parameters: [{ name: 'filter[name]', in: 'query', required: true, example: 'John Doe' }] };
  expect(examples('get', '/api/users', operation)[0]!.code).toContain('filter%5Bname%5D=John+Doe');
  expect(sample({ type: 'object', properties: { enabled: { example: false }, count: { example: 0 }, ids: { example: [16] } } })).toEqual({ enabled: false, count: 0, ids: [16] });
});
