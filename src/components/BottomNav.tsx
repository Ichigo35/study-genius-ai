import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Library, Brain, Plus, User } from "lucide-react";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";

export function BottomNav() {
  const { t } = useI18n();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const items = [
    { to: "/home", icon: Home, label: t("nav.home") },
    { to: "/spaces", icon: Library, label: t("nav.spaces") },
    { to: "/add", icon: Plus, label: t("nav.add"), primary: true },
    { to: "/review", icon: Brain, label: t("nav.review") },
    { to: "/profile", icon: User, label: t("nav.profile") },
  ] as const;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur-xl safe-bottom">
      <ul className="mx-auto flex max-w-lg items-end justify-between px-3 pt-1.5">
        {items.map((item) => {
          const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
          const Icon = item.icon;
          if ("primary" in item && item.primary) {
            return (
              <li key={item.to} className="-mt-6">
                <Link
                  to={item.to}
                  className="press gradient-hero flex size-14 items-center justify-center rounded-full text-primary-foreground shadow-[var(--shadow-float)]"
                  aria-label={item.label}
                >
                  <Icon className="size-7" strokeWidth={2.5} />
                </Link>
              </li>
            );
          }
          return (
            <li key={item.to} className="flex-1">
              <Link
                to={item.to}
                className={cn(
                  "press flex flex-col items-center gap-1 rounded-xl py-2 text-[11px] font-medium",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className={cn("size-5", active && "stroke-[2.5]")} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
