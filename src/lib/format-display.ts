/** Keep the stored chapter name unchanged while formatting its visible label. */
export function formatDisplayText(value: string) {
  return value.replaceAll("Microbes:", "Microbes -");
}
