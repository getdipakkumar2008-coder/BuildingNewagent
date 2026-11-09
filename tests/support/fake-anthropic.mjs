// Fake Anthropic Messages API (streaming) for tests. Speaks the documented SSE wire format.
// Prompt keywords in the LAST user message select behaviour:
//   SLOW            -> many deltas, 120ms apart (for stop tests)
//   FAIL_OVERLOADED -> message_start then an `overloaded_error` event
//   HTTP429         -> HTTP 429 JSON error before streaming
//   MARKDOWN        -> rich markdown (headings, lists, table, code in several languages)
//   XSS             -> hostile markdown/HTML the app must neutralise
//   ARTIFACT        -> an html artifact whose script tries to break out of the sandbox
//   SVGART          -> an svg artifact
// Anything else   -> thinking block + short text reply that echoes the prompt.
import http from "node:http";

function sse(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MARKDOWN_REPLY = `# Title heading

Some **bold** and *italic* text with \`inline code\` and a [safe link](https://example.com/docs).

- first item
- second item

1. one
2. two

> a quoted line

| Name | Value |
|------|-------|
| alpha | 1 |
| beta | 2 |

\`\`\`ts
const answer: number = 42;
function greet(name: string) {
  return \`hello \${name}\`;
}
\`\`\`

\`\`\`python
def add(a, b):
    return a + b
\`\`\`

Done.`;

const XSS_REPLY = `Here is some content.

<script>window.__pwned = 'script'</script>

<img src=x onerror="window.__pwned='img'">

[click me](javascript:window.__pwned='link')

![pixel](http://127.0.0.1:4010/tracking-pixel.png)

<iframe src="http://127.0.0.1:4010/framed"></iframe>

<svg onload="window.__pwned='svg'"><circle r="5"/></svg>

Safe ending.`;

const ARTIFACT_REPLY = `Here is a page:

\`\`\`html
<!doctype html>
<html><head><title>Probe Page</title></head>
<body>
<h1 id="hello">Hello artifact</h1>
<pre id="out">running</pre>
<script>
const out = [];
out.push('origin=' + window.origin);
try { out.push('cookie=' + (document.cookie === '' ? 'empty' : 'LEAK')); } catch (e) { out.push('cookie=blocked:' + e.name); }
try { out.push('localStorage=' + typeof localStorage.getItem('x')); } catch (e) { out.push('localStorage=blocked:' + e.name); }
try { out.push('parentDoc=' + typeof window.parent.document.title); } catch (e) { out.push('parentDoc=blocked:' + e.name); }
if (window.top !== window.self) { try { window.top.location.href = 'http://127.0.0.1:4010/navigated'; out.push('topNav=allowed'); } catch (e) { out.push('topNav=blocked:' + e.name); } } else { out.push('topNav=blocked:not-framed'); }
fetch('/api/conversations').then(r => out.push('fetch=allowed:' + r.status)).catch(() => out.push('fetch=blocked'))
  .finally(() => { document.getElementById('out').textContent = out.join('\\n'); document.body.dataset.done = '1'; });
</script>
</body></html>
\`\`\`

That is all.`;

const SVG_REPLY = `An image:

\`\`\`svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><title>Red Dot</title><circle cx="50" cy="50" r="40" fill="red"/></svg>
\`\`\`
`;

export async function startFakeAnthropic(port = 0) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    if (req.method !== "POST" || !req.url.startsWith("/v1/messages")) {
      res.writeHead(404).end();
      return;
    }
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw || "{}");
    requests.push({ headers: req.headers, body });

    const msgs = body.messages ?? [];
    const last = msgs[msgs.length - 1]?.content ?? "";
    // Content may be an array of blocks (attachments). Keywords and the echo use the TEXT blocks only;
    // non-text block types are reported separately so tests can see what reached the model.
    const textOf = (c) =>
      typeof c === "string" ? c : c.map((b) => (b.type === "text" ? b.text : "")).join(" ");
    const blockTypes = Array.isArray(last) ? last.map((b) => b.type) : [];
    const nonText = blockTypes.filter((t) => t !== "text");
    const prompt = textOf(last);

    if (prompt.includes("HTTP429")) {
      res.writeHead(429, { "content-type": "application/json", "retry-after": "1" });
      res.end(
        JSON.stringify({
          type: "error",
          error: { type: "rate_limit_error", message: "slow down" },
        }),
      );
      return;
    }

    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
    let aborted = false;
    res.on("close", () => (aborted = true));

    sse(res, "message_start", {
      type: "message_start",
      message: {
        id: "msg_fake",
        type: "message",
        role: "assistant",
        content: [],
        model: body.model,
        stop_reason: null,
        usage: { input_tokens: 25, output_tokens: 1 },
      },
    });

    if (prompt.includes("FAIL_OVERLOADED")) {
      sse(res, "error", {
        type: "error",
        error: { type: "overloaded_error", message: "Overloaded" },
      });
      res.end();
      return;
    }

    // Thinking block first (the app must ignore it).
    sse(res, "content_block_start", {
      type: "content_block_start",
      index: 0,
      content_block: { type: "thinking", thinking: "" },
    });
    sse(res, "content_block_delta", {
      type: "content_block_delta",
      index: 0,
      delta: { type: "thinking_delta", thinking: "private reasoning" },
    });
    sse(res, "content_block_delta", {
      type: "content_block_delta",
      index: 0,
      delta: { type: "signature_delta", signature: "sig" },
    });
    sse(res, "content_block_stop", { type: "content_block_stop", index: 0 });

    sse(res, "content_block_start", {
      type: "content_block_start",
      index: 1,
      content_block: { type: "text", text: "" },
    });
    sse(res, "ping", { type: "ping" });

    const chunked = (t) => t.match(/[\s\S]{1,7}/g);
    const scenario = prompt.includes("MARKDOWN")
      ? MARKDOWN_REPLY
      : prompt.includes("XSS")
        ? XSS_REPLY
        : prompt.includes("ARTIFACT")
          ? ARTIFACT_REPLY
          : prompt.includes("SVGART")
            ? SVG_REPLY
            : null;
    const words = prompt.includes("SLOW")
      ? Array.from({ length: 60 }, (_, i) => `word${i} `)
      : scenario
        ? chunked(scenario)
        : `Hello from the fake model. You said: ${prompt}${nonText.length ? ` [blocks: ${nonText.join(",")}]` : ""}`.split(
            /(?<= )/,
          );
    const delay = prompt.includes("SLOW") ? 120 : scenario ? 8 : 5;

    let emitted = 0;
    for (const w of words) {
      if (aborted) return;
      sse(res, "content_block_delta", {
        type: "content_block_delta",
        index: 1,
        delta: { type: "text_delta", text: w },
      });
      emitted += 1;
      await sleep(delay);
    }
    if (aborted) return;
    sse(res, "content_block_stop", { type: "content_block_stop", index: 1 });
    sse(res, "message_delta", {
      type: "message_delta",
      delta: { stop_reason: "end_turn", stop_sequence: null },
      usage: { output_tokens: emitted },
    });
    sse(res, "message_stop", { type: "message_stop" });
    res.end();
  });

  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  const { port: actual } = server.address();
  return {
    url: `http://127.0.0.1:${actual}`,
    requests,
    close: () =>
      new Promise((r) => {
        server.closeAllConnections?.();
        server.close(r);
      }),
  };
}

// CLI: `node tests/support/fake-anthropic.mjs 4010` (used by Playwright's webServer)
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const port = Number(process.argv[2] ?? 4010);
  const s = await startFakeAnthropic(port);
  console.log(`fake anthropic listening on ${s.url}`);
}
