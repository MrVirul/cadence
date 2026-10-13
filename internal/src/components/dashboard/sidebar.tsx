import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Building2,
  ClipboardList,
  LogOut,
  Moon,
  Sun,
  Users,
} from "lucide-react";
import { logout } from "@/api/endpoints/auth/auth";
import { useCurrentUser } from "@/contexts/user-context";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const NAV_ITEMS = [
  { href: "/orgs", label: "Organizations", icon: Building2 },
  { href: "/users", label: "Users", icon: Users },
  { href: "/ai-usage", label: "AI usage", icon: Activity },
  { href: "/audit-log", label: "Audit log", icon: ClipboardList },
] as const;

const THEME_STORAGE_KEY = "cadence-internal-theme";

export function useInternalTheme() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof document === "undefined") {
      return false;
    }
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return (
      stored === "dark" ||
      (stored === null && document.documentElement.classList.contains("dark"))
    );
  });

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  const toggleTheme = () => {
    if (typeof document === "undefined") {
      return;
    }
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    window.localStorage.setItem(THEME_STORAGE_KEY, next ? "dark" : "light");
    setIsDark(next);
  };

  return { isDark, toggleTheme };
}

interface SidebarContentProps {
  onNavigate?: () => void;
}

export function SidebarContent({ onNavigate }: SidebarContentProps) {
  const pathname = useLocation({ select: (l) => l.pathname });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useCurrentUser();
  const { isDark, toggleTheme } = useInternalTheme();

  const logoutMutation = useMutation({
    mutationFn: async () => {
      try {
        await logout();
      } catch {
        // Proceed with client cleanup even if cookie was already cleared
      }
    },
    onSettled: () => {
      queryClient.clear();
      onNavigate?.();
      navigate({ to: "/login" });
    },
  });

  const displayName = user
    ? user.name || `${user.first_name} ${user.last_name}`.trim() || user.email
    : "";

  const initials =
    user &&
    (`${user.first_name?.charAt(0) ?? ""}${user.last_name?.charAt(0) ?? ""}`.toUpperCase() ||
      user.email.charAt(0).toUpperCase());

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex h-16 items-center justify-between border-b px-5">
        <Link
          to="/orgs"
          aria-label="Cadence Internal home"
          onClick={() => onNavigate?.()}
        >
          <Logo />
        </Link>
        <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wider text-[#B45309] uppercase dark:text-amber-400">
          Staff
        </span>
      </div>

      <nav
        aria-label="Staff navigation"
        className="flex-1 space-y-1 overflow-y-auto px-3 py-4"
      >
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              to={href}
              onClick={() => onNavigate?.()}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t p-3 space-y-1">
        {user && (
          <div className="flex items-center gap-3 rounded-md px-2 py-2">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-xs font-semibold text-[#B45309] dark:text-amber-400">
              {initials}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {displayName}
              </p>
              <p
                className="truncate text-xs text-muted-foreground"
                title={user.email}
              >
                {user.email}
              </p>
            </div>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-muted-foreground hover:text-foreground"
          onClick={toggleTheme}
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        >
          {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          {isDark ? "Light mode" : "Dark mode"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-muted-foreground hover:text-foreground"
          disabled={logoutMutation.isPending}
          onClick={() => logoutMutation.mutate()}
        >
          <LogOut className="size-4" />
          {logoutMutation.isPending ? "Logging out..." : "Log out"}
        </Button>
      </div>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden h-full w-64 shrink-0 flex-col border-r bg-background md:flex">
      <SidebarContent />
    </aside>
  );
}
