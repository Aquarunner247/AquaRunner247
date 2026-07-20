/**
 * Renders a small, deliberately limited markdown subset -- ## headings, blank-line-
 * separated paragraphs, "- " bullet lists, **bold**, and *italic* -- for ComplianceRuleset
 * referenceContent. Not a general-purpose markdown renderer; extend the subset here only
 * if a new referenceContent actually needs it.
 */

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={`${keyPrefix}-${i}`}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={`${keyPrefix}-${i}`}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

export function SimpleMarkdown({ content, className }: { content: string; className?: string }) {
  const lines = content.split("\n");
  const blocks: React.ReactNode[] = [];
  let listBuffer: string[] = [];

  function flushList(key: string) {
    if (listBuffer.length === 0) return;
    blocks.push(
      <ul key={key} className="list-disc space-y-1 pl-5">
        {listBuffer.map((item, i) => (
          <li key={i}>{renderInline(item, `${key}-li-${i}`)}</li>
        ))}
      </ul>,
    );
    listBuffer = [];
  }

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trim();
    const key = `b-${idx}`;

    if (line.startsWith("- ")) {
      listBuffer.push(line.slice(2));
      return;
    }
    flushList(`${key}-list`);

    if (!line) return;
    if (line.startsWith("### ")) {
      blocks.push(
        <h3 key={key} className="mt-4 text-base font-semibold text-slate-900">
          {renderInline(line.slice(4), key)}
        </h3>,
      );
    } else if (line.startsWith("## ")) {
      blocks.push(
        <h2 key={key} className="mt-5 text-lg font-semibold text-[#12234A]">
          {renderInline(line.slice(3), key)}
        </h2>,
      );
    } else if (line.startsWith("*") && line.endsWith("*") && !line.startsWith("**")) {
      blocks.push(
        <p key={key} className="mt-2 text-xs italic text-slate-500">
          {renderInline(line.slice(1, -1), key)}
        </p>,
      );
    } else {
      blocks.push(
        <p key={key} className="mt-2 text-sm text-slate-700">
          {renderInline(line, key)}
        </p>,
      );
    }
  });
  flushList("trailing-list");

  return <div className={className}>{blocks}</div>;
}
