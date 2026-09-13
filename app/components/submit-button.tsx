"use client";

import { useFormStatus } from "react-dom";

type Props = {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
};

/**
 * Drop-in replacement for a plain `<button type="submit">` inside a Server Action form --
 * disables itself and swaps to `pendingLabel` while the action is in flight, so a slow
 * submission (a file upload especially) can't be mistaken for "nothing happened" and
 * clicked again. Must render as a descendant of the <form> it submits for -- that's
 * useFormStatus's own requirement, which is why this has to be its own component rather
 * than a prop on the form itself.
 */
export function SubmitButton({ children, pendingLabel, className }: Props) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? (pendingLabel ?? "Saving…") : children}
    </button>
  );
}
