import Link from "next/link";
import { redirect } from "next/navigation";
import { signUp } from "./actions";
import { US_STATES } from "@/lib/us-states";
import { NameInput } from "@/app/components/name-input";
import { PhoneInput } from "@/app/components/phone-input";

type PageProps = {
  searchParams: Promise<{ error?: string }>;
};

const ERROR_MESSAGES: Record<string, string> = {
  "missing-fields": "Please fill in every field.",
  "email-in-use": "That email already has an account. Try signing in instead.",
  "server-error": "Something went wrong starting checkout. Please try again.",
};

export default async function SignupPage({ searchParams }: PageProps) {
  // Mirrors the real gate in ./actions.ts (signUp) — this just avoids showing a form
  // that would immediately bounce.
  if (process.env.SIGNUPS_ENABLED !== "true") {
    redirect("/");
  }

  const params = await searchParams;
  const errorMessage = params.error ? ERROR_MESSAGES[params.error] ?? "Something went wrong. Please try again." : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-brand-primary">AquaRunner 24/7 Pro</p>
        <h1 className="mt-2 text-2xl font-semibold text-brand-ink">Start your free trial</h1>
        <p className="mt-2 text-sm text-brand-muted">
          14 days free, then a flat monthly rate. A card is required to start the trial.
        </p>
        {errorMessage ? <p className="mt-3 text-sm text-brand-danger">{errorMessage}</p> : null}
      </div>

      <form action={signUp} className="mt-8 flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-brand-ink">
          Business name
          <input
            name="businessName"
            required
            className="rounded-md border border-brand-control px-3 py-2 text-base text-brand-ink shadow-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-brand-ink">
          Your name
          <NameInput
            name="name"
            required
            className="rounded-md border border-brand-control px-3 py-2 text-base text-brand-ink shadow-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-brand-ink">
          Email
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            className="rounded-md border border-brand-control px-3 py-2 text-base text-brand-ink shadow-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-brand-ink">
          Phone (optional)
          <PhoneInput
            name="phone"
            className="rounded-md border border-brand-control px-3 py-2 text-base text-brand-ink shadow-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-brand-ink">
          State
          <select
            name="state"
            required
            defaultValue=""
            className="rounded-md border border-brand-control px-3 py-2 text-base text-brand-ink shadow-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
          >
            <option value="" disabled>
              Select your state
            </option>
            {US_STATES.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="flex flex-col gap-1 text-sm text-brand-ink">
          <legend className="mb-1">Do you have commercial pools?</legend>
          <div className="flex gap-4">
            <label className="flex items-center gap-2">
              <input type="radio" name="hasCommercialPools" value="true" required />
              Yes
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="hasCommercialPools" value="false" required />
              No, residential only
            </label>
          </div>
        </fieldset>
        <p className="text-xs text-brand-muted">

          You&rsquo;ll set a password after your card is confirmed on the next step.
        </p>
        <button
          type="submit"
          className="rounded-md bg-brand-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-ink"
        >
          Continue to payment
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-brand-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-brand-primary underline">
          Sign in
        </Link>
      </p>
    </main>
  );
}
