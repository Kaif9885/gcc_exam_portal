export function formatExamDateTime(value: string | null) {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not scheduled";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(date);
}

export function getExamScheduleStatus(
  published: boolean,
  startsAt: string | null,
  endsAt: string | null,
  now = Date.now(),
) {
  if (!published) return { label: "Draft", className: "failed" };
  if (startsAt && now < new Date(startsAt).getTime()) return { label: "Scheduled", className: "status-scheduled" };
  if (endsAt && now >= new Date(endsAt).getTime()) return { label: "Closed", className: "failed" };
  return { label: startsAt || endsAt ? "Open" : "Published", className: "passed" };
}
