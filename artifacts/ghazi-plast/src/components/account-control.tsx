import { useAuth } from "@workspace/replit-auth-web";
import { LogIn, LogOut, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AccountControl() {
  const { user, isLoading, isAuthenticated, login, logout } = useAuth();

  if (isLoading) {
    return <Button variant="outline" disabled aria-label="Checking sign-in status">Checking account…</Button>;
  }

  if (!isAuthenticated) {
    return (
      <Button variant="outline" onClick={login} data-testid="button-login"
        title="Sign in with your Google/Gmail account on the sign-in screen">
        <LogIn className="h-4 w-4" /> Log in
      </Button>
    );
  }

  const label = user?.email || user?.firstName || "Signed in";
  return (
    <>
      <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground" title={label}>
        <UserRound className="h-4 w-4 shrink-0" />
        <span className="max-w-[160px] truncate">{label}</span>
      </span>
      <Button variant="outline" onClick={logout} data-testid="button-logout">
        <LogOut className="h-4 w-4" /> Log out
      </Button>
    </>
  );
}
