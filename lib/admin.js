// The site owner's dashboard is open only to usernames listed in the ADMIN_USERNAMES setting
// (comma-separated, set in the hosting environment). With nothing set, nobody can open it.
export function isSiteAdmin(user) {
  if (!user) return false;
  const allowed = (process.env.ADMIN_USERNAMES ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return allowed.includes(user.username);
}
