interface MarkdownRendererProps {
  markdown: string;
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function basicMarkdownToHtml(md: string): string {
  const lines = md.split(/\r?\n/);
  const chunks: string[] = [];
  let listBuffer: string[] = [];

  function flushList() {
    if (listBuffer.length) {
      chunks.push(`<ul>${listBuffer.join("")}</ul>`);
      listBuffer = [];
    }
  }

  for (const rawLine of lines) {
    const line = rawLine || "";
    if (/^###\s+/.test(line)) {
      flushList();
      chunks.push(`<h3>${escapeHtml(line.replace(/^###\s+/, ""))}</h3>`);
      continue;
    }
    if (/^##\s+/.test(line)) {
      flushList();
      chunks.push(`<h2>${escapeHtml(line.replace(/^##\s+/, ""))}</h2>`);
      continue;
    }
    if (/^#\s+/.test(line)) {
      flushList();
      chunks.push(`<h1>${escapeHtml(line.replace(/^#\s+/, ""))}</h1>`);
      continue;
    }
    if (/^\s*-\s+/.test(line)) {
      const item = escapeHtml(line.replace(/^\s*-\s+/, ""));
      listBuffer.push(`<li>${item}</li>`);
      continue;
    }
    if (!line.trim()) {
      flushList();
      chunks.push("<br />");
      continue;
    }
    flushList();
    let escaped = escapeHtml(line);
    escaped = escaped.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    escaped = escaped.replace(/_(.+?)_/g, "<em>$1</em>");
    escaped = escaped.replace(/`([^`]+)`/g, "<code>$1</code>");
    chunks.push(`<p>${escaped}</p>`);
  }
  flushList();
  return chunks.join("\n");
}

export default function MarkdownRenderer({ markdown }: MarkdownRendererProps) {
  const html = basicMarkdownToHtml(markdown || "");
  return <div className="markdown-preview-content" dangerouslySetInnerHTML={{ __html: html }} />;
}
