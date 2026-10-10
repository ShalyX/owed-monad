// Preserve decimal numbers like 0.01 while segmenting clauses for financial safety checks.
// A period is punctuation only when it is NOT between two digits.
export function sourceStatements(value) {
  const text = String(value || "");
  const segments = [];
  let start = 0;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === "." && /[0-9]/.test(text[index - 1] || "") &&
        /[0-9]/.test(text[index + 1] || "")) continue;
    if (character !== "." && character !== "!" && character !== "?" &&
        character !== ";" && character !== "\n") continue;
    const end = index + 1;
    if (text.slice(start, end).trim()) segments.push({ text: text.slice(start, end), start, end });
    start = end;
  }
  if (text.slice(start).trim()) segments.push({ text: text.slice(start), start, end: text.length });
  return segments;
}
