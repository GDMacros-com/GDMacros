export const STAFF_ROLE_LABELS = {
  trial_mod: "Trial Mod",
  mod: "Mod",
  admin: "Admin",
} as const;

export type StaffRole = keyof typeof STAFF_ROLE_LABELS;

export function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === "string" && Object.hasOwn(STAFF_ROLE_LABELS, value);
}

export type StaffRoleAccount = { user_id: string; username: string | null; roles: StaffRole[] };

export const STAFF_PERMISSIONS: { label: string; roles: readonly StaffRole[] }[] = [
  { label: "Review, edit, accept and reject submissions", roles: ["trial_mod", "mod", "admin"] },
  { label: "Run random quality checks", roles: ["trial_mod", "mod", "admin"] },
  { label: "Manage submission blocks", roles: ["mod", "admin"] },
  { label: "Use the support inbox and manage support blocks", roles: ["mod", "admin"] },
  { label: "Archive GitHub releases", roles: ["admin"] },
  { label: "Edit published macros", roles: ["admin"] },
  { label: "Mail everyone", roles: ["admin"] },
  { label: "View statistics", roles: ["admin"] },
  { label: "Review activity", roles: ["admin"] },
  { label: "Open Account Tools", roles: ["admin"] },
  { label: "Manage staff roles (ChesszDC only)", roles: [] },
];
