"use client";

import { useState, useTransition } from "react";
import { KeyRound, LogOut, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/spinner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  changeOwnPassword,
  createUser,
  deleteUser,
  resetOtherPassword,
  signOut,
} from "@/lib/auth-actions";
import { formatRelativeTime } from "@/lib/dates";
import { cn } from "@/lib/utils";

type Person = {
  id: number;
  username: string;
  created_at: string;
  session_count: number;
};

type Sheet =
  | { kind: "new" }
  | { kind: "my-password" }
  | { kind: "reset"; person: Person };

export function PeopleScreen({
  users,
  currentUserId,
}: {
  users: Person[];
  currentUserId: number;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [removing, setRemoving] = useState<Person | null>(null);

  return (
    <div className="space-y-6 px-4">
      <section>
        <Card className="gap-0 overflow-hidden p-0">
          {users.map((person, i) => {
            const isMe = person.id === currentUserId;
            return (
              <div
                key={person.id}
                className={cn("flex items-center gap-3 px-4 py-3.5", i > 0 && "border-t")}
              >
                <span
                  className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-base font-semibold uppercase text-secondary-foreground"
                  aria-hidden
                >
                  {person.username.slice(0, 2)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium leading-tight">
                    {person.username}
                    {isMe && (
                      <span className="ml-2 rounded-full bg-primary/15 px-1.5 py-0.5 text-[0.65rem] font-semibold text-primary">
                        you
                      </span>
                    )}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {person.session_count > 0
                      ? `Signed in on ${person.session_count} ${
                          person.session_count === 1 ? "device" : "devices"
                        }`
                      : `Added ${formatRelativeTime(person.created_at)}`}
                  </p>
                </div>

                {isMe ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 rounded-full"
                    onClick={() => setSheet({ kind: "my-password" })}
                  >
                    <KeyRound className="size-4" aria-hidden />
                    Password
                  </Button>
                ) : (
                  <div className="flex shrink-0 items-center">
                    <button
                      type="button"
                      onClick={() => setSheet({ kind: "reset", person })}
                      aria-label={`Reset ${person.username}'s password`}
                      className="tap-scale flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
                    >
                      <KeyRound className="size-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => setRemoving(person)}
                      aria-label={`Remove ${person.username}`}
                      className="tap-scale flex size-9 items-center justify-center rounded-full text-danger-foreground hover:bg-muted"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </Card>

        <Button
          variant="outline"
          size="lg"
          className="mt-3 h-12 w-full rounded-xl text-base"
          onClick={() => setSheet({ kind: "new" })}
        >
          <UserPlus className="size-4.5" aria-hidden />
          Add someone
        </Button>
      </section>

      <section>
        <Card className="gap-3 p-4">
          <p className="text-sm text-muted-foreground">
            Everyone here can see and change everything, and can add other people.
            There are no admins — it&apos;s a shared kitchen.
          </p>
          <Button
            variant="ghost"
            size="lg"
            className="h-12 rounded-xl text-base text-danger-foreground"
            onClick={() => startTransition(async () => void (await signOut()))}
          >
            <LogOut className="size-4.5" aria-hidden />
            Sign out
          </Button>
        </Card>
      </section>

      {sheet && (
        <PasswordSheet
          key={sheet.kind === "reset" ? `reset-${sheet.person.id}` : sheet.kind}
          sheet={sheet}
          onClose={() => setSheet(null)}
          onDone={() => {
            setSheet(null);
            router.refresh();
          }}
        />
      )}

      <AlertDialog open={removing !== null} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.username}?</AlertDialogTitle>
            <AlertDialogDescription>
              They&apos;ll be signed out everywhere and won&apos;t be able to get
              back in. Nothing in the kitchen is deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep them</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() =>
                startTransition(async () => {
                  if (!removing) return;
                  const result = await deleteUser(removing.id);
                  if (!result.ok) {
                    toast.error(result.error);
                    return;
                  }
                  toast.success(`${removing.username} removed`);
                  setRemoving(null);
                  router.refresh();
                })
              }
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PasswordSheet({
  sheet,
  onClose,
  onDone,
}: {
  sheet: Sheet;
  onClose: () => void;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [username, setUsername] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  const titles = {
    new: "Add someone",
    "my-password": "Change my password",
    reset: `Set a new password`,
  };
  const descriptions = {
    new: "Pick a username and a first password — they can change it later.",
    "my-password": "You'll stay signed in here; other devices will be signed out.",
    reset: "They'll be signed out everywhere and will need the new password.",
  };

  function submit() {
    setError(null);
    if (sheet.kind !== "my-password" && password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }

    startTransition(async () => {
      const result =
        sheet.kind === "new"
          ? await createUser({ username, password })
          : sheet.kind === "my-password"
            ? await changeOwnPassword({ currentPassword, newPassword: password })
            : await resetOtherPassword({
                userId: sheet.person.id,
                newPassword: password,
              });

      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(
        sheet.kind === "new"
          ? `${username} can sign in now`
          : "Password changed",
      );
      onDone();
    });
  }

  const canSubmit =
    sheet.kind === "new"
      ? Boolean(username.trim() && password && confirm)
      : sheet.kind === "my-password"
        ? Boolean(currentPassword && password)
        : Boolean(password && confirm);

  return (
    <Drawer open onOpenChange={(open) => !open && onClose()}>
      <DrawerContent>
        <DrawerHeader className="text-left">
          <DrawerTitle>{titles[sheet.kind]}</DrawerTitle>
          <DrawerDescription>{descriptions[sheet.kind]}</DrawerDescription>
        </DrawerHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-2">
          {sheet.kind === "new" && (
            <div>
              <Label htmlFor="new-username" className="mb-1.5 block">
                Username
              </Label>
              <Input
                id="new-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="sam"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoComplete="off"
                autoFocus
                className="h-12 rounded-xl"
              />
            </div>
          )}

          {sheet.kind === "my-password" && (
            <div>
              <Label htmlFor="current-password" className="mb-1.5 block">
                Current password
              </Label>
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                autoFocus
                className="h-12 rounded-xl"
              />
            </div>
          )}

          <div>
            <Label htmlFor="new-password" className="mb-1.5 block">
              {sheet.kind === "my-password" ? "New password" : "Password"}
            </Label>
            <Input
              id="new-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              className="h-12 rounded-xl"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              At least 8 characters.
            </p>
          </div>

          {sheet.kind !== "my-password" && (
            <div>
              <Label htmlFor="confirm-password" className="mb-1.5 block">
                Type it again
              </Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                className="h-12 rounded-xl"
              />
            </div>
          )}

          {error && (
            <p
              role="alert"
              className="rounded-xl bg-danger-muted px-3.5 py-2.5 text-sm font-medium text-danger-foreground"
            >
              {error}
            </p>
          )}
        </div>

        <DrawerFooter>
          <Button
            size="lg"
            className="h-12 rounded-xl text-base"
            disabled={pending || !canSubmit}
            onClick={submit}
          >
            {pending ? <Spinner /> : sheet.kind === "new" ? "Add them" : "Save"}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
