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
  let codeBlockBuffer: string[] = [];
  let inCodeBlock = false;
  let codeBlockLanguage = "";

  function flushList() {
    if (listBuffer.length) {
      chunks.push(`<ul>${listBuffer.join("")}</ul>`);
      listBuffer = [];
    }
  }

  function flushCodeBlock() {
    if (codeBlockBuffer.length) {
      const code = escapeHtml(codeBlockBuffer.join("\n"));
      chunks.push(`<pre><code${codeBlockLanguage ? ` class="language-${codeBlockLanguage}"` : ""}>${code}</code></pre>`);
      codeBlockBuffer = [];
      codeBlockLanguage = "";
      inCodeBlock = false;
    }
  }

  for (const rawLine of lines) {
    const line = rawLine || "";
    
    // Handle code blocks
    if (/^```/.test(line)) {
      if (inCodeBlock) {
        flushCodeBlock();
      } else {
        flushList();
        codeBlockLanguage = line.replace(/^```(\w+)?.*$/, "$1") || "";
        inCodeBlock = true;
      }
      continue;
    }
    
    if (inCodeBlock) {
      codeBlockBuffer.push(line);
      continue;
    }

    // Headers
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
    
    // Lists
    if (/^\s*[-*]\s+/.test(line)) {
      const item = escapeHtml(line.replace(/^\s*[-*]\s+/, ""));
      listBuffer.push(`<li>${item}</li>`);
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const item = escapeHtml(line.replace(/^\s*\d+\.\s+/, ""));
      listBuffer.push(`<li>${item}</li>`);
      continue;
    }
    
    // Empty lines
    if (!line.trim()) {
      flushList();
      chunks.push("<br />");
      continue;
    }
    
    flushList();
    let escaped = escapeHtml(line);
    
    // Bold and italic (order matters - do bold first)
    escaped = escaped.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    escaped = escaped.replace(/\*(.+?)\*/g, "<em>$1</em>");
    escaped = escaped.replace(/_(.+?)_/g, "<em>$1</em>");
    
    // Inline code
    escaped = escaped.replace(/`([^`]+)`/g, "<code>$1</code>");
    
    // Links
    escaped = escaped.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    
    // Citations [1], [2], etc.
    escaped = escaped.replace(/\[(\d+)\]/g, '<span class="citation">[$1]</span>');
    
    chunks.push(`<p>${escaped}</p>`);
  }
  
  flushList();
  flushCodeBlock();
  return chunks.join("\n");
}

export default function MarkdownRenderer({ markdown }: MarkdownRendererProps) {
  const html = basicMarkdownToHtml(markdown || "");
  return <div className="markdown-preview-content" dangerouslySetInnerHTML={{ __html: html }} />;
}
