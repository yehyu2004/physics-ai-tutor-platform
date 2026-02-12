export type ActivityCategory =
  | "AI_CHAT"
  | "ASSIGNMENT_VIEW"
  | "ASSIGNMENT_SUBMIT"
  | "GRADING"
  | "SIMULATION"
  | "PROBLEM_GEN"
  | "ANALYTICS_VIEW"
  | "ADMIN_ACTION";

export function trackActivity(category: ActivityCategory, detail?: string) {
  fetch("/api/activity", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category, detail }),
  }).catch(() => {});
}
