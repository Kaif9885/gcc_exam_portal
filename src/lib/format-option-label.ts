export function formatOptionLabel(value: unknown, index: number) {
  const label = typeof value === "string" ? value.trim() : "";
  return label && !/^undefined\.?$/i.test(label)
    ? label
    : String.fromCharCode(65 + index);
}
