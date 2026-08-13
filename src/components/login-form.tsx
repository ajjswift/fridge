"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Spinner } from "@/components/spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn, type SignInState } from "@/lib/auth-actions";

const initialState: SignInState = { error: null };

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(signIn, initialState);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div>
        <Label htmlFor="username" className="mb-1.5 block">
          Username
        </Label>
        <Input
          id="username"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="next"
          required
          className="h-12 rounded-xl"
        />
      </div>

      <div>
        <Label htmlFor="password" className="mb-1.5 block">
          Password
        </Label>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            enterKeyHint="go"
            required
            className="h-12 rounded-xl pr-12"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute right-1.5 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
          >
            {showPassword ? (
              <EyeOff className="size-4.5" aria-hidden />
            ) : (
              <Eye className="size-4.5" aria-hidden />
            )}
          </button>
        </div>
      </div>

      {state.error && (
        <p
          role="alert"
          className="rounded-xl bg-danger-muted px-3.5 py-2.5 text-sm font-medium text-danger-foreground"
        >
          {state.error}
        </p>
      )}

      <Button
        type="submit"
        size="lg"
        className="h-13 w-full rounded-2xl text-base"
        disabled={pending}
      >
        {pending ? <Spinner /> : "Sign in"}
      </Button>

      <p className="pt-2 text-center text-xs text-muted-foreground">
        Ask whoever set this up to make you an account.
      </p>
    </form>
  );
}
