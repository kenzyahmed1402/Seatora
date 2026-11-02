import type { ReactNode } from "react";

// The assistant writes plain text with a little Markdown: paragraphs,
// "- " or "1. " lists and **bold**. A table, which it's asked not to write,
// is shown as a list, one row per line. It is turned into React elements,
// never into raw HTML, so a reply can't inject markup into the page.

const inline = (text: string): ReactNode[] =>
  text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? <strong key={i}>{part.slice(2, -2)}</strong> : part
  );

const BULLET = /^\s*[-*•]\s+/;
const NUMBERED = /^\s*\d+[.)]\s+/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_RULE = /^\s*\|?[\s:|-]*-{3,}[\s:|-]*$/;

// A Markdown table's rows as text, without the header and the rule under it
const tableRows = (lines: string[]) => {
  const rule = lines.findIndex((line) => TABLE_RULE.test(line));
  return lines
    .filter((_, i) => i !== rule && !(rule > 0 && i < rule))
    .map((line) =>
      line
        .trim()
        .replace(/^\||\|$/g, "")
        .split("|")
        .map((cell) => cell.trim())
        .filter(Boolean)
        .join(" · ")
    );
};

export const MessageText = ({ text }: { text: string }) => (
  <>
    {text
      .trim()
      .split(/\n{2,}/)
      .map((block, b) => {
        const lines = block.split("\n").filter((line) => line.trim());
        if (lines.length > 1 && lines.every((line) => TABLE_ROW.test(line) || TABLE_RULE.test(line))) {
          return (
            <ul key={b}>
              {tableRows(lines).map((row, i) => (
                <li key={i}>{inline(row)}</li>
              ))}
            </ul>
          );
        }
        if (lines.length && lines.every((line) => BULLET.test(line))) {
          return (
            <ul key={b}>
              {lines.map((line, i) => (
                <li key={i}>{inline(line.replace(BULLET, ""))}</li>
              ))}
            </ul>
          );
        }
        if (lines.length && lines.every((line) => NUMBERED.test(line))) {
          return (
            <ol key={b}>
              {lines.map((line, i) => (
                <li key={i}>{inline(line.replace(NUMBERED, ""))}</li>
              ))}
            </ol>
          );
        }
        return (
          <p key={b}>
            {lines.map((line, i) => (
              <span key={i}>
                {i > 0 && <br />}
                {inline(line)}
              </span>
            ))}
          </p>
        );
      })}
  </>
);
