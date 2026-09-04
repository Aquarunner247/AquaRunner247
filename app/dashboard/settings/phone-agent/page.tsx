import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { getOrgPlanAccess } from "@/lib/plan-tiers";
import { ProFeatureLock } from "@/app/components/pro-feature-lock";
import { updatePhoneAgentSettings } from "./actions";

type PageProps = {
  searchParams?: Promise<{ error?: string }>;
};

const WEEKDAYS: { key: string; label: string }[] = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];

const ISSUE_TYPES: { key: string; label: string }[] = [
  { key: "EQUIPMENT_FAILURE", label: "Equipment failure" },
  { key: "CHEMICAL_WATER_QUALITY", label: "Chemical / water quality" },
  { key: "LEAK", label: "Leak" },
  { key: "NO_SHOW_COMPLAINT", label: "No-show complaint" },
  { key: "BILLING", label: "Billing" },
  { key: "OTHER", label: "Other" },
];

function hoursPart(businessHours: unknown, day: string, part: "start" | "end"): string {
  const hours = (businessHours as Record<string, string> | null) ?? {};
  const range = hours[day];
  if (!range) return "";
  const [start, end] = range.split("-");
  return part === "start" ? (start ?? "") : (end ?? "");
}

export default async function PhoneAgentSettingsPage({ searchParams }: PageProps) {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.role !== "ADMIN") redirect("/dashboard");

  const sp = (await searchParams) ?? {};

  const { proAccess } = await getOrgPlanAccess(appUser.organizationId);
  if (!proAccess) {
    return (
      <main className="mx-auto min-h-screen max-w-3xl px-6 py-10">
        <div className="text-sm text-brand-muted">
          <Link href="/dashboard/settings" className="underline">
            Settings
          </Link>
          {" / "}
          <span>AI Phone Agent</span>
        </div>
        <header className="mt-2 border-b border-brand-border pb-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-ink">Admin</p>
          <h1 className="text-2xl font-semibold text-brand-ink">AI Phone Agent</h1>
        </header>
        <ProFeatureLock feature="The AI phone agent" />
      </main>
    );
  }

  const [organization, settings] = await Promise.all([
    prisma.organization.findUnique({ where: { id: appUser.organizationId }, select: { aiPhoneAgentEnabled: true } }),
    prisma.orgPhoneAgentSettings.findUnique({ where: { organizationId: appUser.organizationId } }),
  ]);

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-10">
      <div className="text-sm text-brand-muted">
        <Link href="/dashboard/settings" className="underline">
          Settings
        </Link>
        {" / "}
        <span>AI Phone Agent</span>
      </div>

      <header className="mt-2 border-b border-brand-border pb-5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-ink">Admin</p>
          {organization?.aiPhoneAgentEnabled ? (
            <span className="app-pill-good">Enabled</span>
          ) : (
            <span className="rounded-full bg-brand-foam px-2 py-0.5 text-xs font-semibold text-brand-muted">Not enabled for this org</span>
          )}
        </div>
        <h1 className="text-2xl font-semibold text-brand-ink">AI Phone Agent</h1>
        <p className="mt-1 text-sm text-brand-muted">
          Answers a missed call — genuinely after-hours, or just busy during the day — with an interactive voicemail
          that turns into a ticket here. {!organization?.aiPhoneAgentEnabled ? "This add-on isn't enabled for your account yet; contact us to turn it on." : null}
        </p>
        {sp.error === "number-in-use" ? (
          <p className="mt-3 rounded border border-brand-danger/30 bg-brand-dangerFill px-3 py-2 text-sm text-brand-danger">
            That Twilio number is already assigned to a different organization&rsquo;s settings.
          </p>
        ) : null}
      </header>

      <form action={updatePhoneAgentSettings} className="mt-6 space-y-6">
        <section className="app-card">
          <h2 className="text-base font-semibold text-brand-ink">Numbers</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-brand-ink">Twilio number</span>
              <input
                name="twilioPhoneNumber"
                defaultValue={settings?.twilioPhoneNumber ?? ""}
                placeholder="+17025550100"
                className="app-field mt-1"
              />
            </label>
            <label className="block text-sm">
              <span className="text-brand-ink">Primary business/owner line</span>
              <input
                name="primaryPhoneNumber"
                defaultValue={settings?.primaryPhoneNumber ?? ""}
                placeholder="+17025550199"
                className="app-field mt-1"
              />
            </label>
            <label className="block text-sm">
              <span className="text-brand-ink">Ring timeout (seconds)</span>
              <input
                name="ringTimeoutSeconds"
                type="number"
                min={5}
                max={60}
                defaultValue={settings?.ringTimeoutSeconds ?? 20}
                className="app-field mt-1"
              />
            </label>
          </div>
        </section>

        <section className="app-card">
          <h2 className="text-base font-semibold text-brand-ink">Business hours</h2>
          <p className="mt-1 text-sm text-brand-muted">
            Only decides what the caller hears (&ldquo;we&rsquo;re closed&rdquo; vs. &ldquo;we&rsquo;re just away from the
            phone&rdquo;) — the agent always answers a missed call regardless of these hours. Leave a day blank for closed.
          </p>
          <div className="mt-3 space-y-2">
            {WEEKDAYS.map((day) => (
              <div key={day.key} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="w-24 text-brand-ink">{day.label}</span>
                <input
                  name={`hours_${day.key}_start`}
                  type="time"
                  defaultValue={hoursPart(settings?.businessHours, day.key, "start")}
                  className="app-field w-auto"
                />
                <span className="text-brand-muted">to</span>
                <input
                  name={`hours_${day.key}_end`}
                  type="time"
                  defaultValue={hoursPart(settings?.businessHours, day.key, "end")}
                  className="app-field w-auto"
                />
              </div>
            ))}
          </div>
        </section>

        <section className="app-card">
          <h2 className="text-base font-semibold text-brand-ink">Escalation contacts</h2>
          <p className="mt-1 text-sm text-brand-muted">One per line. Every ticket emails each address listed.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-brand-ink">Escalation phone numbers</span>
              <textarea
                name="escalationPhones"
                rows={3}
                defaultValue={(settings?.escalationPhones ?? []).join("\n")}
                placeholder={"+17025550101\n+17025550102"}
                className="app-field mt-1"
              />
            </label>
            <label className="block text-sm">
              <span className="text-brand-ink">Escalation emails</span>
              <textarea
                name="escalationEmails"
                rows={3}
                defaultValue={(settings?.escalationEmails ?? []).join("\n")}
                placeholder={"owner@example.com\noffice@example.com"}
                className="app-field mt-1"
              />
            </label>
          </div>
        </section>

        <section className="app-card">
          <h2 className="text-base font-semibold text-brand-ink">Greetings &amp; callback promises</h2>
          <p className="mt-1 text-sm text-brand-muted">
            These are genuinely different messages — &ldquo;we&rsquo;re closed for the day&rdquo; reads very differently
            than &ldquo;we&rsquo;re just away from the phone.&rdquo;
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-brand-ink">After-hours greeting</span>
              <textarea
                name="afterHoursGreeting"
                rows={2}
                defaultValue={settings?.afterHoursGreeting ?? ""}
                placeholder="We're closed for the day."
                className="app-field mt-1"
              />
            </label>
            <label className="block text-sm">
              <span className="text-brand-ink">Busy/overflow greeting</span>
              <textarea
                name="busyOverflowGreeting"
                rows={2}
                defaultValue={settings?.busyOverflowGreeting ?? ""}
                placeholder="We're unable to take your call right now."
                className="app-field mt-1"
              />
            </label>
            <label className="block text-sm">
              <span className="text-brand-ink">After-hours callback promise</span>
              <textarea
                name="afterHoursCallbackPromise"
                rows={2}
                defaultValue={settings?.afterHoursCallbackPromise ?? ""}
                placeholder="We'll call you back first thing tomorrow morning."
                className="app-field mt-1"
              />
            </label>
            <label className="block text-sm">
              <span className="text-brand-ink">Busy/overflow callback promise</span>
              <textarea
                name="busyOverflowCallbackPromise"
                rows={2}
                defaultValue={settings?.busyOverflowCallbackPromise ?? ""}
                placeholder="We'll call you back shortly."
                className="app-field mt-1"
              />
            </label>
          </div>
        </section>

        <section className="app-card">
          <h2 className="text-base font-semibold text-brand-ink">Service territory</h2>
          <textarea
            name="serviceTerritoryDescription"
            rows={2}
            defaultValue={settings?.serviceTerritoryDescription ?? ""}
            placeholder="e.g. Greater Las Vegas valley, including Henderson and Summerlin."
            className="app-field mt-2"
          />
        </section>

        <section className="app-card">
          <h2 className="text-base font-semibold text-brand-ink">Issue types the agent can handle</h2>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {ISSUE_TYPES.map((t) => (
              <label key={t.key} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name={`issueType_${t.key}`}
                  defaultChecked={(settings?.allowedIssueTypes ?? []).includes(t.key as never)}
                />
                {t.label}
              </label>
            ))}
          </div>
        </section>

        <section className="app-card">
          <h2 className="text-base font-semibold text-brand-ink">Conversation mode</h2>
          <p className="mt-1 text-sm text-brand-muted">
            Off: callers hear the scripted phone tree and leave a recorded message. On: callers have a real,
            interactive conversation with an AI agent instead — at meaningfully higher per-minute cost than the
            scripted phone tree, so review your daily caps below before turning this on.
          </p>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" name="conversationalAiEnabled" defaultChecked={settings?.conversationalAiEnabled ?? false} />
            Use live AI conversation instead of the scripted phone tree
          </label>
        </section>

        <section className="app-card">
          <h2 className="text-base font-semibold text-brand-ink">Daily caps</h2>
          <p className="mt-1 text-sm text-brand-muted">Enforced server-side. Leave blank for unlimited.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className="block text-sm">
              <span className="text-brand-ink">Max calls/day</span>
              <input
                name="maxCallsPerDay"
                type="number"
                min={0}
                defaultValue={settings?.maxCallsPerDay ?? ""}
                className="app-field mt-1"
              />
            </label>
            <label className="block text-sm">
              <span className="text-brand-ink">Max minutes/day</span>
              <input
                name="maxMinutesPerDay"
                type="number"
                min={0}
                defaultValue={settings?.maxMinutesPerDay ?? ""}
                className="app-field mt-1"
              />
            </label>
            <label className="block text-sm">
              <span className="text-brand-ink">Max single-call seconds</span>
              <input
                name="maxCallDurationSeconds"
                type="number"
                min={0}
                defaultValue={settings?.maxCallDurationSeconds ?? ""}
                className="app-field mt-1"
              />
            </label>
          </div>
        </section>

        <button type="submit" className="app-btn-primary">
          Save
        </button>
      </form>
    </main>
  );
}
