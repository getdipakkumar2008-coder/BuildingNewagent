"use client";

import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import ReactMarkdown, { type Components, type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { Check, Copy } from "lucide-react";
import { splitBlocks } from "@/lib/markdown-blocks";

/**
 * Safety layers for model output (untrusted):
 *  1. react-markdown does NOT enable raw HTML (no rehype-raw): HTML in the text is shown as text.
 *  2. rehype-sanitize allow-list on top (defence in depth): images keep only their alt text (a remote
 *     image is an exfiltration channel) and only http/https/mailto link protocols are allowed.
 *  3. Our `a` component re-validates the URL and forces rel/target.
 * Highlighting runs AFTER sanitizing; its spans come from lowlight, not from the model.
 */
const sanitizeSchema = {
  ...defaultSchema,
  // <img> is kept ONLY so our placeholder can show the alt text; `src`/`srcset` are stripped, so no
  // URL ever reaches the DOM and nothing is fetched.
  attributes: { ...defaultSchema.attributes, img: ["alt"] },
  protocols: { ...defaultSchema.protocols, href: ["http", "https", "mailto"] },
};

const remarkPlugins = [remarkGfm];
const rehypePlugins = [
  [rehypeSanitize, sanitizeSchema],
  [rehypeHighlight, { detect: false, ignoreMissing: true }],
] as never;

const SAFE_HREF = /^(https?:|mailto:)/i;

type HastNode = {
  type?: string;
  value?: string;
  children?: HastNode[];
  properties?: Record<string, unknown>;
  tagName?: string;
};

function hastText(node: HastNode | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.value ?? "";
  return (node.children ?? []).map(hastText).join("");
}

function languageOf(node: HastNode | undefined): string | null {
  const code = node?.children?.find((c) => c.tagName === "code");
  const cls = code?.properties?.className;
  const list = Array.isArray(cls) ? cls : typeof cls === "string" ? cls.split(" ") : [];
  const hit = list.map(String).find((c) => c.startsWith("language-"));
  return hit ? hit.slice("language-".length) : null;
}

function CodeBlock({ node, children }: { node?: HastNode; children?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const lang = languageOf(node);
  const text = hastText(node).replace(/\n$/, "");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable (insecure context / denied): leave the button as-is */
    }
  }

  return (
    <div className="my-3 overflow-hidden rounded-ui border border-border bg-surface-2">
      <div className="flex items-center justify-between border-b border-border px-3 py-1 text-xs text-muted">
        <span>{lang ?? "text"}</span>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? "Copied" : "Copy code"}
          className="flex items-center gap-1 rounded px-2 py-1 hover:bg-surface"
        >
          {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {/* tabIndex: a horizontally scrollable region must be keyboard-focusable */}
      <pre tabIndex={0} aria-label="Code" className="overflow-x-auto p-3 text-sm leading-relaxed">
        {children}
      </pre>
    </div>
  );
}

type El<T extends keyof React.JSX.IntrinsicElements> = React.JSX.IntrinsicElements[T] & ExtraProps;

const heading = (level: 3 | 4 | 5 | 6, cls: string) =>
  function Heading({ children }: { children?: ReactNode }) {
    const Tag = `h${level}` as "h3";
    return <Tag className={cls}>{children}</Tag>;
  };

const components: Components = {
  // Message headings start at h3: the page has h1, and each message label is an h2.
  h1: heading(3, "mt-4 mb-2 text-xl font-semibold"),
  h2: heading(4, "mt-4 mb-2 text-lg font-semibold"),
  h3: heading(5, "mt-3 mb-1 text-base font-semibold"),
  h4: heading(6, "mt-3 mb-1 font-semibold"),
  h5: heading(6, "mt-3 mb-1 font-semibold"),
  h6: heading(6, "mt-3 mb-1 font-semibold"),
  p: ({ children }: El<"p">) => <p className="my-2 leading-relaxed">{children}</p>,
  ul: ({ children }: El<"ul">) => <ul className="my-2 list-disc pl-6">{children}</ul>,
  ol: ({ children, start }: El<"ol">) => (
    <ol start={start} className="my-2 list-decimal pl-6">
      {children}
    </ol>
  ),
  li: ({ children }: El<"li">) => <li className="my-1">{children}</li>,
  blockquote: ({ children }: El<"blockquote">) => (
    <blockquote className="my-2 border-l-4 border-border pl-3 text-muted">{children}</blockquote>
  ),
  hr: () => <hr className="my-4 border-border" />,
  table: ({ children }: El<"table">) => (
    <div className="my-3 overflow-x-auto" tabIndex={0} role="region" aria-label="Table">
      <table className="min-w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }: El<"th">) => (
    <th className="border border-border bg-surface-2 px-3 py-1 text-left font-semibold">
      {children}
    </th>
  ),
  td: ({ children }: El<"td">) => <td className="border border-border px-3 py-1">{children}</td>,
  a: ({ href, children }: El<"a">) =>
    href && SAFE_HREF.test(href) ? (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="text-brand underline"
      >
        {children}
      </a>
    ) : (
      <span>{children}</span> // unsafe or missing URL: keep the text, drop the link
    ),
  // No remote images: show the alt text instead of fetching anything.
  img: ({ alt }: El<"img">) => <span className="text-muted">[image{alt ? `: ${alt}` : ""}]</span>,
  pre: CodeBlock as unknown as Components["pre"],
  code: ({ className, children }: El<"code">) => (
    <code
      className={`${className ?? ""} ${className ? "" : "rounded bg-surface-2 px-1 py-0.5 text-[0.9em]"} font-mono`}
    >
      {children}
    </code>
  ),
};

type BlockProps = { text: string; onRender?: (text: string) => void };

/** One top-level block. Memoized: finished blocks never re-render while the tail streams. */
const Block = memo(function Block({ text, onRender }: BlockProps) {
  onRender?.(text);
  return (
    <ReactMarkdown
      remarkPlugins={remarkPlugins}
      rehypePlugins={rehypePlugins}
      components={components}
    >
      {text}
    </ReactMarkdown>
  );
});

/** `onBlockRender` exists so tests can assert which blocks actually re-render. */
export function Markdown({
  text,
  onBlockRender,
}: {
  text: string;
  onBlockRender?: (text: string) => void;
}) {
  const blocks = useMemo(() => splitBlocks(text), [text]);
  return (
    <div className="md break-words">
      {blocks.map((b, i) => (
        <Block key={i} text={b} onRender={onBlockRender} />
      ))}
    </div>
  );
}
