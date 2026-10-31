import type { ReactNode } from "react";

function normalizeMath(value: string) {
  return value
    .replace(/\\text\{([^{}]*)\}/g, "$1")
    .replaceAll("\\times", "×")
    .replaceAll("\\pi", "π")
    .replaceAll("\\le", "≤")
    .replaceAll("\\ge", "≥")
    .replaceAll("\\cdot", "·")
    .replaceAll("\\,", " ")
    .replace(/\^2\b/g, "²")
    .replace(/\^3\b/g, "³");
}

function renderFormula(value: string, keyPrefix: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const mathValue = value.replace(/\\text\{([^{}]*)\}/g, "$1");
  const fractionPattern = /\\frac\{([^{}]+)\}\{([^{}]+)\}|([A-Za-z0-9π]+)\s*\/\s*([A-Za-z0-9π]+(?:\^\d+)?)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let fractionIndex = 0;

  while ((match = fractionPattern.exec(mathValue)) !== null) {
    if (match.index > lastIndex) parts.push(normalizeMath(mathValue.slice(lastIndex, match.index)));
    const numerator = match[1] ?? match[3];
    const denominator = match[2] ?? match[4];
    parts.push(
      <span className="math-fraction" key={`${keyPrefix}-fraction-${fractionIndex}`} aria-label={`${numerator} over ${denominator}`}>
        <span>{normalizeMath(numerator)}</span>
        <span>{normalizeMath(denominator)}</span>
      </span>,
    );
    lastIndex = match.index + match[0].length;
    fractionIndex += 1;
  }

  if (lastIndex < mathValue.length) parts.push(normalizeMath(mathValue.slice(lastIndex)));
  return parts;
}

/** Displays inline LaTeX from the school question bank without showing raw `$` or commands. */
export function MathText({ text }: { text: string }) {
  const segments = text.split(/(\$[^$]+\$)/g);
  return <>{segments.map((segment, index) => {
    if (!segment.startsWith("$") || !segment.endsWith("$")) return segment;
    return <span className="math-inline" key={`math-${index}`}>{renderFormula(segment.slice(1, -1), `math-${index}`)}</span>;
  })}</>;
}

export function formatOptionLabel(label: string | null | undefined, index: number) {
  const cleanLabel = typeof label === "string" ? label.trim() : "";
  return cleanLabel && cleanLabel.toLowerCase() !== "undefined" ? cleanLabel : String.fromCharCode(65 + index);
}
