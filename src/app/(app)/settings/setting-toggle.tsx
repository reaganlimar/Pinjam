"use client";

import { useState, useTransition } from "react";
import { setRemindersAction, setThemeAction } from "@/server/actions/account";
import { Toggle } from "@/components/ui/toggle";

export function SettingToggle({
  kind,
  label,
  description,
  initial,
}: {
  kind: "reminders" | "theme";
  label: string;
  description: string;
  initial: boolean;
}) {
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState(false);
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5">
      <div>
        <p className="text-[15px] text-ink">{label}</p>
        <p className="text-[13px] text-muted">{error ? "Couldn't save. Try again." : description}</p>
      </div>
      <Toggle
        label={label}
        checked={on}
        disabled={pending}
        onChange={(next) => {
          setOn(next);
          if (kind === "theme") document.documentElement.dataset.theme = next ? "dark" : "light";
          start(async () => {
            try {
              await (kind === "theme" ? setThemeAction(next) : setRemindersAction(next));
              setError(false);
            } catch {
              setOn(!next);
              if (kind === "theme") document.documentElement.dataset.theme = next ? "light" : "dark";
              setError(true);
            }
          });
        }}
      />
    </div>
  );
}
