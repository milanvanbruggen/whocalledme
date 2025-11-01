const NL_DATETIME = new Intl.DateTimeFormat("nl-NL", {
  dateStyle: "medium",
  timeStyle: "short"
});

export function formatDateTime(value: string | number | Date) {
  return NL_DATETIME.format(typeof value === "string" ? new Date(value) : value);
}

