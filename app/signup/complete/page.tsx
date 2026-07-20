import Link from "next/link";
import { redirect } from "next/navigation";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { completeSignup } from "../actions";
import { US_STATES } from "@/lib/us-states";

type PageProps = {
  searchParams: Promise<{
    session_id?: string;
    orgId?: string;
    businessName?: string;
    name?: string;
    email?: string;
    phone?: string;
    state?: string;
    hasCommercialPools?: string;
    error?: string;
  }>;
};

const ERROR_MESSAGES: Record<string, string> = {
  "weak-password": "Password must be at least 8 characters.",
};

export default async function SignupCompletePage({ searchParams }: PageProps) {
  if (process.env.SIGNUPS_ENABLED !== "true") {
    redirect("/");
  }

  const params = await searchParams;
  const errorMessage = params.error ? ERROR_MESSAGES[params.error] ?? "Something went wrong. Please try again." : null;

  let email: string;
  let businessName: string;
  const isResume = Boolean(params.orgId);

  if (params.session_id) {
    let session;
    try {
      session = await stripe.checkout.sessions.retrieve(params.session_id);
    } catch (err) {
      console.error("[signup/complete] failed to retrieve checkout session:", err);
      redirect("/signup?error=server-error");
    }
    if (session.status !== "complete") {
      redirect("/signup?error=server-error");
    }
    email = session.customer_details?.email ?? session.customer_email ?? "";
    businessName = String(session.metadata?.businessName ?? "");
    if (!email || !businessName) {
      redirect("/signup?error=server-error");
    }
  } else if (params.orgId) {
    const org = await prisma.organization.findUnique({
      where: { id: params.orgId },
      include: { users: { take: 1 } },
    });
    if (!org || !org.stripeCustomerId || org.users.length > 0) {
      redirect("/signup");
    }
    const customer = await stripe.customers.retrieve(org.stripeCustomerId);
    if (customer.deleted || !customer.email) {
      redirect("/signup?error=server-error");
    }
    email = customer.email;
    businessName = org.businessName ?? org.name;
  } else if (params.businessName && params.email) {
    email = params.email;
    businessName = params.businessName;
  } else {
    redirect("/signup");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-brand-primary">AquaRunner 24/7 Pro</p>
        <h1 className="mt-2 text-2xl font-semibold text-brand-ink">Almost done</h1>
        <p className="mt-2 text-sm text-brand-muted">
          {isResume
            ? "Welcome back — your card was already confirmed."
            : params.session_id
              ? "Your card is confirmed."
              : "Billing isn't required in this environment."}{" "}
          Set a password for <span className="font-medium">{email}</span> to finish setting up{" "}
          <span className="font-medium">{businessName}</span>.
        </p>
        {errorMessage ? <p className="mt-3 text-sm text-brand-danger">{errorMessage}</p> : null}
      </div>

      <form action={completeSignup} className="mt-8 flex flex-col gap-4">
        {params.session_id ? (
          <input type="hidden" name="sessionId" value={params.session_id} />
        ) : params.orgId ? (
          <input type="hidden" name="orgId" value={params.orgId} />
        ) : (
          <>
            <input type="hidden" name="businessName" value={params.businessName} />
            <input type="hidden" name="name" value={params.name ?? ""} />
            <input type="hidden" name="email" value={params.email} />
            <input type="hidden" name="phone" value={params.phone ?? ""} />
            <input type="hidden" name="state" value={params.state ?? ""} />
            <input type="hidden" name="hasCommercialPools" value={params.hasCommercialPools ?? ""} />
          </>
        )}
        {isResume ? (
          <>
            <label className="flex flex-col gap-1 text-sm text-brand-ink">
              Your name
              <input
                name="name"
                required
                defaultValue={params.name ?? ""}
                className="rounded-md border border-brand-control px-3 py-2 text-base text-brand-ink shadow-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-brand-ink">
              State
              <select
                name="state"
                required
                defaultValue={params.state ?? ""}
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
                  <input type="radio" name="hasCommercialPools" value="true" required defaultChecked={params.hasCommercialPools === "true"} />
                  Yes
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="hasCommercialPools" value="false" required defaultChecked={params.hasCommercialPools === "false"} />
                  No, residential only
                </label>
              </div>
            </fieldset>
          </>

        ) : null}
        <label className="flex flex-col gap-1 text-sm text-brand-ink">
          Password
          <input
            type="password"
            name="password"
            autoComplete="new-password"
            required
            minLength={8}
            className="rounded-md border border-brand-control px-3 py-2 text-base text-brand-ink shadow-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
          />
        </label>
        <button
          type="submit"
          className="rounded-md bg-brand-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-ink"
        >
          Finish setup
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
