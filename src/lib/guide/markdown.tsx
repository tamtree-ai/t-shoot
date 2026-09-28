import { type ReactNode } from "react";

type Block =
  | { type: "h"; level: 1 | 2 | 3; text: string }
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "quote"; lines: string[] }
  | { type: "code"; text: string }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "hr" };

/** Turn the guide's markdown into the document. The dialect is the one these pages use. */
export function renderMarkdown(source: string): ReactNode {
  const blocks = parseBlocks(source.replace(/\r\n/g, "\n"));
  return blocks.map((block, i) => renderBlock(block, i));
}

function parseBlocks(source: string): Block[] {
  const lines = source.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.trim() === "") {
      i += 1;
      continue;
    }

    if (line.startsWith("```")) {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !(lines[i] ?? "").startsWith("```")) {
        body.push(lines[i] ?? "");
        i += 1;
      }
      i += 1;
      blocks.push({ type: "code", text: body.join("\n") });
      continue;
    }

    const heading = /^(#{1,3}) (.+)$/.exec(line);
    if (heading) {
      blocks.push({ type: "h", level: heading[1]!.length as 1 | 2 | 3, text: heading[2]! });
      i += 1;
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      blocks.push({ type: "hr" });
      i += 1;
      continue;
    }

    if (line.startsWith("> ")) {
      const quote: string[] = [];
      while (i < lines.length && (lines[i] ?? "").startsWith("> ")) {
        quote.push((lines[i] ?? "").slice(2));
        i += 1;
      }
      blocks.push({ type: "quote", lines: quote });
      continue;
    }

    if (line.startsWith("| ") && line.trimEnd().endsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && (lines[i] ?? "").startsWith("| ")) {
        const cells = splitRow(lines[i] ?? "");
        if (!cells.every((cell) => /^:?-+:?$/.test(cell))) rows.push(cells);
        i += 1;
      }
      const [headers, ...body] = rows;
      if (headers) blocks.push({ type: "table", headers, rows: body });
      continue;
    }

    if (line.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && (lines[i] ?? "").startsWith("- ")) {
        items.push((lines[i] ?? "").slice(2));
        i += 1;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    if (/^\d+\. /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(/^\d+\. /, ""));
        i += 1;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    const para: string[] = [line];
    i += 1;
    while (i < lines.length && (lines[i] ?? "").trim() !== "" && !startsBlock(lines[i] ?? "")) {
      para.push(lines[i] ?? "");
      i += 1;
    }
    blocks.push({ type: "p", text: para.join(" ") });
  }

  return blocks;
}

function startsBlock(line: string): boolean {
  return (
    line.startsWith("#") ||
    line.startsWith("```") ||
    line.startsWith("> ") ||
    line.startsWith("- ") ||
    line.startsWith("| ") ||
    /^\d+\. /.test(line) ||
    /^---+$/.test(line.trim())
  );
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function renderBlock(block: Block, key: number): ReactNode {
  switch (block.type) {
    case "h": {
      const Tag = `h${block.level}` as "h1" | "h2" | "h3";
      return <Tag key={key}>{inline(block.text)}</Tag>;
    }
    case "p":
      return <p key={key}>{inline(block.text)}</p>;
    case "ul":
      return (
        <ul key={key}>
          {block.items.map((item, i) => (
            <li key={i}>{inline(item)}</li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol key={key}>
          {block.items.map((item, i) => (
            <li key={i}>{inline(item)}</li>
          ))}
        </ol>
      );
    case "quote":
      return (
        <blockquote key={key}>
          {block.lines.map((line, i) => (
            <p key={i}>{inline(line)}</p>
          ))}
        </blockquote>
      );
    case "code":
      return (
        <pre key={key}>
          <code>{block.text}</code>
        </pre>
      );
    case "hr":
      return <hr key={key} />;
    case "table":
      return (
        <div key={key} className="table-wrap">
          <table>
            <thead>
              <tr>
                {block.headers.map((cell, i) => (
                  <th key={i}>{inline(cell)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c}>{inline(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

/** Link, bold, code, italic. A fresh RegExp per call, so lastIndex cannot leak. */
const TOKEN_SOURCE = String.raw`\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*` + "`([^`]+)`" + String.raw`|\*([^*]+)\*`;

function inline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(new RegExp(TOKEN_SOURCE, "g"))) {
    const index = match.index ?? 0;
    if (index > last) nodes.push(text.slice(last, index));
    const [, linkText, href, bold, code, italic] = match;
    if (linkText && href) {
      const safe = safeHref(href);
      nodes.push(safe ? <a key={index} href={safe}>{linkText}</a> : linkText);
    } else if (bold) {
      nodes.push(<strong key={index}>{bold}</strong>);
    } else if (code) {
      nodes.push(<code key={index}>{code}</code>);
    } else if (italic) {
      nodes.push(<em key={index}>{italic}</em>);
    }
    last = index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function safeHref(href: string): string | null {
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  try {
    const url = new URL(href);
    if (url.protocol === "http:" || url.protocol === "https:") return href;
  } catch {
    return null;
  }
  return null;
}
