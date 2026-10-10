import { describe, expect, it } from 'vitest';
import { parseInline, parseRichText } from './rich-text';

const plain = (text: string) => ({ text, bold: false });
const bold = (text: string) => ({ text, bold: true });

describe('rich text for Concierge replies', () => {
  it('renders a real status reply as paragraphs and a bulleted list', () => {
    const reply = [
      'You currently have activity on 3 auctions:',
      '',
      '- **Winning:** **Direct-to-chip cooling loop** — current **$1,000**; **ends in 2d 5h**. You’re currently the high bidder.  ',
      '- **Won (ended):** **NVIDIA H100 SXM 80GB** — won at **$18,900**.',
      '',
      'If you tell me which one you care about most, I can walk you through the next step.',
    ].join('\n');
    const blocks = parseRichText(reply);
    expect(blocks.map((block) => block.type)).toEqual(['paragraph', 'list', 'paragraph']);
    const list = blocks[1];
    if (list?.type !== 'list') throw new Error('expected list');
    expect(list.ordered).toBe(false);
    expect(list.items).toHaveLength(2);
    expect(list.items[0]).toEqual([
      bold('Winning:'), plain(' '), bold('Direct-to-chip cooling loop'), plain(' — current '), bold('$1,000'),
      plain('; '), bold('ends in 2d 5h'), plain('. You’re currently the high bidder.'),
    ]);
    expect(JSON.stringify(blocks)).not.toContain('**');
  });

  it('handles numbered lists, headings, links, code, and wrapped list items', () => {
    const blocks = parseRichText('## Options\n1. First [link](https://example.com)\n2) Second `code`\n   continues here\nAfter.');
    expect(blocks).toEqual([
      { type: 'paragraph', lines: [[bold('Options')]] },
      { type: 'list', ordered: true, items: [[plain('First link')], [plain('Second code'), plain(' '), plain('continues here')]] },
      { type: 'paragraph', lines: [[plain('After.')]] },
    ]);
  });

  it('keeps single line breaks inside a paragraph and leaves stray asterisks alone', () => {
    expect(parseRichText('Line one\nLine two')).toEqual([{ type: 'paragraph', lines: [[plain('Line one')], [plain('Line two')]] }]);
    expect(parseInline('5 * 3 = 15, and **bold**')).toEqual([plain('5 * 3 = 15, and '), bold('bold')]);
  });

  it('treats markup in model text as text', () => {
    expect(parseInline('<img src=x onerror=alert(1)> **ok**')).toEqual([plain('<img src=x onerror=alert(1)> '), bold('ok')]);
  });
});
