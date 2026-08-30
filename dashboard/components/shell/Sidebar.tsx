import {
  LayoutDashboard,
  Users,
  ScrollText,
  KeyRound,
  Settings,
} from "lucide-react";
import { NavLink } from "./NavLink";

/**
 * One nav item per real /dashboard/* endpoint in API_IMPLEMENTATION_DETAILS.md —
 * Overview, Users, Audit Logs, API Keys, Settings. No tenant switcher: a
 * dashboard session is scoped to exactly one tenant (`GET /dashboard/me`
 * returns a single tenantId/tenantName), so there's nothing to switch
 * between.
 */
const NAV_ITEMS = [
  { href: "/app", label: "Overview", icon: <LayoutDashboard /> },
  { href: "/app/users", label: "Users", icon: <Users /> },
  { href: "/app/audit-logs", label: "Audit logs", icon: <ScrollText /> },
  { href: "/app/api-keys", label: "API keys", icon: <KeyRound /> },
  { href: "/app/settings", label: "Settings", icon: <Settings /> },
];

export function Sidebar() {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex h-14 items-center px-4">
        <span className="text-display-md text-[var(--color-text-primary)]">
          SentinelAuth
        </span>
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.href} href={item.href} icon={item.icon}>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
