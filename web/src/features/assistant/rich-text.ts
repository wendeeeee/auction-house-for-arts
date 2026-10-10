/** A small Markdown subset for model replies, returned as data so React never renders model text as HTML. */

export type InlineSegment = { text: string; bold: boolean };
export type RichBlock =
  | { type: 'paragraph'; lines: InlineSegment[][] }
  | { type: 'list'; ordered: boolean; items: InlineSegment[][] };

const bulletItem = /^\s*[-*•]\s+(.*)$/;
const numberedItem = /^\s*\d{1,3}[.)]\s+(.*)$/;
const heading = /^\s*#{1,6}\s+(.*)$/;

export function parseInline(text: string): InlineSegment[] {
  const cleaned = text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links: keep the label only
    .replace(/`([^`]+)`/g, '$1') // inline code
    .replace(/\s+$/, ''); // trailing "two-space" line breaks
  const segments: InlineSegment[] = [];
  const bold = /\*\*(.+?)\*\*|__(.+?)__/g;
  let last = 0;
  for (let match = bold.exec(cleaned); match; match = bold.exec(cleaned)) {
    if (match.index > last) segments.push({ text: cleaned.slice(last, match.index), bold: false });
    segments.push({ text: match[1] ?? match[2] ?? '', bold: true });
    last = match.index + match[0].length;
  }
  if (last < cleaned.length) segments.push({ text: cleaned.slice(last), bold: false });
  return segments.filter((segment) => segment.text.length > 0);
}

export function parseRichText(text: string): RichBlock[] {
  const blocks: RichBlock[] = [];
  let current: RichBlock | null = null;
  const flush = () => {
    if (current) blocks.push(current);
    current = null;
  };

  for (const rawLine of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (!rawLine.trim()) {
      flush();
      continue;
    }
    const bullet = bulletItem.exec(rawLine);
    const numbered = bullet ? null : numberedItem.exec(rawLine);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      const content = parseInline((bullet ?? numbered)?.[1] ?? '');
      if (current?.type !== 'list' || current.ordered !== ordered) {
        flush();
        current = { type: 'list', ordered, items: [] };
      }
      current.items.push(content);
      continue;
    }
    const headingMatch = heading.exec(rawLine);
    if (headingMatch) {
      flush();
      blocks.push({
        type: 'paragraph',
        lines: [[{ text: parseInline(headingMatch[1] ?? '').map((segment) => segment.text).join(''), bold: true }]],
      });
      continue;
    }
    // An indented line right after a list item continues that item.
    if (current?.type === 'list' && /^\s{2,}/.test(rawLine)) {
      current.items[current.items.length - 1]?.push({ text: ' ', bold: false }, ...parseInline(rawLine.trim()));
      continue;
    }
    if (current?.type !== 'paragraph') {
      flush();
      current = { type: 'paragraph', lines: [] };
    }
    current.lines.push(parseInline(rawLine.trim()));
  }
  flush();
  return blocks;
}
