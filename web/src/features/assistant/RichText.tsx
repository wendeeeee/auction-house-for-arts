import { type InlineSegment, parseRichText } from './rich-text';

function Inline({ segments }: { segments: InlineSegment[] }) {
  return (
    <>
      {segments.map((segment, index) => (segment.bold ? <strong key={index}>{segment.text}</strong> : <span key={index}>{segment.text}</span>))}
    </>
  );
}

/** Model text as React elements, never as HTML. */
export function RichText({ text }: { text: string }) {
  return (
    <>
      {parseRichText(text).map((block, blockIndex) => {
        if (block.type === 'list') {
          const items = block.items.map((item, index) => (
            <li key={index}>
              <Inline segments={item} />
            </li>
          ));
          return block.ordered ? <ol key={blockIndex}>{items}</ol> : <ul key={blockIndex}>{items}</ul>;
        }
        return (
          <p key={blockIndex}>
            {block.lines.map((line, index) => (
              <span key={index}>
                {index > 0 && <br />}
                <Inline segments={line} />
              </span>
            ))}
          </p>
        );
      })}
    </>
  );
}
