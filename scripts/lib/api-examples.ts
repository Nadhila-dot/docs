export type Schema = { example?: unknown; default?: unknown; enum?: unknown[]; type?: string; properties?: Record<string, Schema>; items?: Schema; minimum?: number };
export type Parameter = { name: string; in: string; required?: boolean; example?: unknown; schema?: Schema };
export type Operation = { summary?: string; operationId: string; parameters?: Parameter[]; requestBody?: { content: Record<string, { example?: unknown; schema?: Schema }> } };

export function sample(schema: Schema = {}): unknown {
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (schema.enum?.length) return schema.enum[0];
  if (schema.properties) return Object.fromEntries(Object.entries(schema.properties).map(([key, value]) => [key, sample(value)]));
  if (schema.type === 'array') return [sample(schema.items)];
  if (schema.type === 'integer' || schema.type === 'number') return Math.max(1, schema.minimum ?? 1);
  if (schema.type === 'boolean') return false;
  return 'YOUR_VALUE';
}

export function examples(method: string, endpoint: string, operation: Operation, parameters: Parameter[] = [], base = 'https://ctrlpanel.hosting.gg') {
  method = method.toUpperCase();
  const params = [...parameters, ...(operation.parameters ?? [])];
  const route = endpoint.replace(/\{([^}]+)\}/g, (_, name: string) => {
    const param = params.find(p => p.in === 'path' && p.name === name);
    return encodeURIComponent(String(param?.example ?? (param?.schema ? sample(param.schema) : '1')));
  });
  const url = new URL(base + route);
  for (const p of params.filter(p => p.in === 'query' && p.required)) url.searchParams.set(p.name, String(p.example ?? sample(p.schema)));
  const content = operation.requestBody?.content;
  if (content && !content['application/json']) throw new Error(`Unsupported request content: ${operation.operationId}`);
  const body = content ? content['application/json']!.example ?? sample(content['application/json']!.schema) : undefined;
  const json = body === undefined ? undefined : JSON.stringify(body, null, 2);
  const compact = body === undefined ? undefined : JSON.stringify(body);
  const address = JSON.stringify(url.href);
  const curl = `curl --fail-with-body -X ${method} '${url.href}' \\\n  -H "Authorization: Bearer $CTRLPANEL_API_TOKEN" \\\n  -H 'Accept: application/json'${json ? ` \\\n  -H 'Content-Type: application/json' \\\n  --data-raw '${compact!.replaceAll("'", "'\\''")}'` : ''}`;
  const js = `const token = process.env.CTRLPANEL_API_TOKEN;
if (!token) throw new Error('Set CTRLPANEL_API_TOKEN first');

const response = await fetch(${address}, {
  method: '${method}',
  headers: {
    Authorization: \`Bearer \${token}\`,
    Accept: 'application/json',${json ? "\n    'Content-Type': 'application/json'," : ''}
  },${json ? `\n  body: JSON.stringify(${json.replaceAll('\n', '\n  ')}),` : ''}
});
const text = await response.text();
if (!response.ok) throw new Error(\`HTTP \${response.status}: \${text}\`);
console.log(text);`;
  const python = `# Install: pip install requests
import os
${json ? 'import json\n' : ''}import requests

token = os.environ['CTRLPANEL_API_TOKEN']
response = requests.request(
    '${method}',
    ${address},
    headers={
        'Authorization': f'Bearer {token}',
        'Accept': 'application/json',
    },${compact ? `\n    json=json.loads(${JSON.stringify(compact)}),` : ''}
    timeout=30,
)
response.raise_for_status()
print(response.text)`;
  const go = `package main

import (
    "fmt"
    "io"
    "net/http"
    "os"
    "time"${compact ? '\n    "strings"' : ''}
)

func main() {
    token := os.Getenv("CTRLPANEL_API_TOKEN")
    if token == "" { panic("Set CTRLPANEL_API_TOKEN first") }
    request, err := http.NewRequest("${method}", ${address}, ${compact ? `strings.NewReader(${JSON.stringify(compact)})` : 'nil'})
    if err != nil { panic(err) }
    request.Header.Set("Authorization", "Bearer " + token)
    request.Header.Set("Accept", "application/json")${compact ? '\n    request.Header.Set("Content-Type", "application/json")' : ''}
    client := &http.Client{Timeout: 30 * time.Second}
    response, err := client.Do(request)
    if err != nil { panic(err) }
    defer response.Body.Close()
    body, err := io.ReadAll(response.Body)
    if err != nil { panic(err) }
    if response.StatusCode < 200 || response.StatusCode >= 300 {
        panic(fmt.Sprintf("HTTP %d: %s", response.StatusCode, body))
    }
    fmt.Println(string(body))
}`;
  const rust = `// Dependencies:
// cargo add reqwest
// cargo add tokio --features macros,rt-multi-thread
use std::{env, time::Duration};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let token = env::var("CTRLPANEL_API_TOKEN")?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()?;
    let response = client
        .request(reqwest::Method::${method}, ${address})
        .bearer_auth(token)
        .header("Accept", "application/json")${compact ? `\n        .header("Content-Type", "application/json")\n        .body(${JSON.stringify(compact)})` : ''}
        .send()
        .await?;
    let status = response.status();
    let text = response.text().await?;
    if !status.is_success() {
        return Err(format!("HTTP {}: {}", status, text).into());
    }
    println!("{}", text);
    Ok(())
}`;
  return [
    { label: 'cURL', language: 'bash', code: curl },
    { label: 'JavaScript', language: 'js', code: js },
    { label: 'TypeScript', language: 'ts', code: js.replace('const token =', 'const token: string | undefined =') },
    { label: 'Python', language: 'python', code: python },
    { label: 'Go', language: 'go', code: go },
    { label: 'Rust', language: 'rust', code: rust },
  ];
}

export function requestExamples(method: string, endpoint: string, operation: Operation, parameters: Parameter[] = [], base?: string) {
  const items = examples(method, endpoint, operation, parameters, base);
  return `{/* api-examples:start */}\nSet \`CTRLPANEL_API_TOKEN\` in your environment before running an example. Path IDs are sample values; replace them with your own. Add optional query parameters from the table below when needed. JavaScript and TypeScript use the built-in fetch API in Bun or Node.js.\n\n<Tabs items={${JSON.stringify(items.map(item => item.label))}} groupId="api-language">\n${items.map(item => `<Tab value="${item.label.toLowerCase()}">\n\n\`\`\`${item.language}\n${item.code}\n\`\`\`\n\n</Tab>`).join('\n')}\n</Tabs>\n{/* api-examples:end */}`;
}
