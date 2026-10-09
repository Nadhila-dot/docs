import { parse } from 'yaml';
import { requestExamples, type Operation, type Parameter } from './lib/api-examples';

const spec = parse(await Bun.file('public/openapi/openapi.yaml').text());
const server = spec.servers[0];
const base = server.url.replace(/\{([^}]+)\}/g, (_: string, key: string) => server.variables[key].default);
let count = 0;
for (const [endpoint, pathItem] of Object.entries(spec.paths) as [string, Record<string, Operation> & { parameters?: Parameter[] }][]) {
  for (const [method, operation] of Object.entries(pathItem)) {
    if (!['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(method)) continue;
    const op = operation as Operation;
    const slug = (op.summary || op.operationId).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const file = `content/docs/api/${slug}.mdx`;
    const before = await Bun.file(file).text();
    const region = /(?<=## Request\n\n)[\s\S]*?(?=\n(?:### |## Responses))/;
    if (!region.test(before)) throw new Error(`Missing request section: ${file}`);
    const after = before.replace(region, () => requestExamples(method, endpoint, op, pathItem.parameters, base) + '\n');
    if (before !== after) {
      if (Bun.argv.includes('--check')) throw new Error(`Outdated generated examples: ${file}`);
      await Bun.write(file, after);
    }
    count++;
  }
}
console.log(`Generated or verified request examples in six languages for ${count} API endpoints.`);
