"use client";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { passwordMeetsPolicy } from "@/lib/auth/password-policy";

export function PasswordFields({
  passwordName = "password",
  label = "Password",
  confirmLabel = "Confirm password",
}: {
  passwordName?: string;
  label?: string;
  confirmLabel?: string;
}) {
  const [show, setShow] = useState(false),
    [password, setPassword] = useState("");
  const strong = passwordMeetsPolicy(password),
    strengthId = `${passwordName}-strength`;
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={passwordName}>{label}</Label>
        <div className="relative">
          <Input
            id={passwordName}
            name={passwordName}
            type={show ? "text" : "password"}
            autoComplete="new-password"
            minLength={12}
            maxLength={72}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-describedby={password ? strengthId : undefined}
            className="pr-12"
          />
          <button
            type="button"
            onClick={() => setShow(!show)}
            aria-label={show ? "Hide passwords" : "Show passwords"}
            aria-pressed={show}
            className="absolute right-0 top-0 flex h-10 w-11 items-center justify-center"
          >
            {show ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        {password && (
          <div id={strengthId} role="status">
            <div
              data-password-strength={strong ? "strong" : "weak"}
              className={`h-1 rounded-full ${strong ? "bg-green-600" : "bg-red-500"}`}
            />
            <p
              className={`mt-1 text-xs ${strong ? "text-green-700" : "text-red-600"}`}
            >
              {strong
                ? "Strong password"
                : "Use 12+ characters with mixed case, numbers and a symbol; avoid common words."}
            </p>
          </div>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirmPassword">{confirmLabel}</Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type={show ? "text" : "password"}
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={72}
        />
      </div>
    </>
  );
}
