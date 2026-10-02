"use client";

import { useState } from "react";
import { renderWelcomeEmail } from "@/lib/mail/welcome-email";

export type BrandingFormValue = {
  logoUrl: string;
  primaryColor: string;
  headerColor: string;
  welcomeEmailEnabled: boolean;
  supportEmail: string;
  supportPhone: string;
  introText: string;
  serviceSummaryCcEmail: string;
};

type Actions = {
  updateBranding: (formData: FormData) => void;
  uploadLogo: (formData: FormData) => void;
  removeLogo: (formData: FormData) => void;
  updateWelcomeEmailSettings: (formData: FormData) => void;
  updateServiceSummaryCcEmail: (formData: FormData) => void;
};

const DEFAULT_PRIMARY_COLOR = "#0A6E7C";
const DEFAULT_HEADER_COLOR = "#ffffff";

export function BrandingForm({
  actions,
  orgName,
  canBrand,
  initial,
  error,
  saved,
}: {
  actions: Actions;
  orgName: string;
  /** White Label (or Enterprise/comped). Gates the Logo and Colors sections only -- the
   * welcome-email and service summary settings below them are available to every tier. */
  canBrand: boolean;
  initial: BrandingFormValue;
  error: string | null;
  saved: boolean;
}) {
  const [value, setValue] = useState(initial);
  const [selectedLogoFile, setSelectedLogoFile] = useState<File | null>(null);

  function update<K extends keyof BrandingFormValue>(key: K, val: BrandingFormValue[K]) {
    setValue((v) => ({ ...v, [key]: val }));
  }

  const previewLogoUrl = selectedLogoFile ? URL.createObjectURL(selectedLogoFile) : value.logoUrl || null;

  let previewHtml = "";
  let previewError: string | null = null;
  try {
    previewHtml = renderWelcomeEmail({
      orgName,
      customerFirstName: "Jordan",
      activationUrl: "https://example.com/preview-only",
      // Sample values, so the preview shows the credentials block customers actually receive rather
      // than the link-only variant they do not.
      temporaryPassword: "swim-2026-temp",
      customerEmail: "jordan@example.com",
      portalLoginUrl: "https://example.com/portal/login",
      logoUrl: canBrand ? previewLogoUrl : null,
      primaryColor: canBrand ? value.primaryColor || null : null,
      headerColor: canBrand ? value.headerColor || null : null,
      supportEmail: value.supportEmail || null,
      supportPhone: value.supportPhone || null,
      introText: value.introText || null,
    }).html;
  } catch (e) {
    previewError = e instanceof Error ? e.message : "Preview failed.";
  }

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        {error ? <p className="text-sm text-brand-danger">{error}</p> : null}
        {saved ? <p className="text-sm text-brand-ok">Saved.</p> : null}

        {canBrand ? (
        <>
        <section className="app-card">
          <h2 className="text-sm font-semibold text-brand-ink">Logo</h2>
          <p className="mt-1 text-xs text-brand-muted">PNG, JPEG, or WEBP, up to 2MB.</p>

          {value.logoUrl ? (
            <div className="mt-3 flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- externally-hosted (Supabase Storage) org logo, not an app asset Next/Image can optimize */}
              <img src={value.logoUrl} alt={orgName} className="h-12 max-w-[160px] rounded border border-brand-border object-contain" />
              <form action={actions.removeLogo}>
                <button className="app-btn-secondary-sm" type="submit">
                  Remove logo
                </button>
              </form>
            </div>
          ) : null}

          <form action={actions.uploadLogo} className="mt-3 flex flex-wrap items-center gap-2">
            <input
              type="file"
              name="logoFile"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => setSelectedLogoFile(e.target.files?.[0] ?? null)}
              className="text-sm text-brand-ink"
            />
            <button className="app-btn-primary-sm" type="submit" disabled={!selectedLogoFile}>
              Upload logo
            </button>
          </form>
        </section>

        <section className="app-card">
          <h2 className="text-sm font-semibold text-brand-ink">Colors</h2>
          <p className="mt-1 text-xs text-brand-muted">
            Used for buttons and the active state in the customer portal, and in the welcome email below.
          </p>

          <form action={actions.updateBranding} className="mt-3 space-y-4">
            <label className="block text-sm">
              <span className="text-brand-ink">Primary color</span>
              <input
                type="color"
                name="primaryColor"
                value={/^#[0-9A-Fa-f]{6}$/.test(value.primaryColor) ? value.primaryColor : DEFAULT_PRIMARY_COLOR}
                onChange={(e) => update("primaryColor", e.target.value)}
                className="mt-1 block h-9 w-16 rounded border border-brand-control p-0"
              />
            </label>

            <label className="block text-sm">
              <span className="text-brand-ink">Header color</span>
              <input
                type="color"
                name="headerColor"
                value={/^#[0-9A-Fa-f]{6}$/.test(value.headerColor) ? value.headerColor : DEFAULT_HEADER_COLOR}
                onChange={(e) => update("headerColor", e.target.value)}
                className="mt-1 block h-9 w-16 rounded border border-brand-control p-0"
              />
            </label>

            <button className="app-btn-primary-sm" type="submit">
              Save colors
            </button>
          </form>
        </section>
        </>
        ) : (
          <section className="app-card">
            <h2 className="text-sm font-semibold text-brand-ink">Your logo and colors</h2>
            <p className="mt-1 text-sm text-brand-muted">
              On the White Label plan, the customer portal and the welcome email carry your logo and your brand
              colors instead of AquaRunner&rsquo;s. Everything else on this page is included in your plan.
            </p>
            <a className="app-link mt-3 inline-block text-sm" href="/dashboard/billing">
              See plans
            </a>
          </section>
        )}

        <section className="app-card">
          <h2 className="text-sm font-semibold text-brand-ink">Welcome email</h2>

          <form action={actions.updateWelcomeEmailSettings} className="mt-3 space-y-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="welcomeEmailEnabled"
                checked={value.welcomeEmailEnabled}
                onChange={(e) => update("welcomeEmailEnabled", e.target.checked)}
                className="h-4 w-4 rounded border-brand-control"
              />
              <span className="text-brand-ink">Send a welcome email when a new customer login is created</span>
            </label>

            <label className="block text-sm">
              <span className="text-brand-ink">Support email shown in the email</span>
              <input
                type="email"
                name="supportEmail"
                value={value.supportEmail}
                onChange={(e) => update("supportEmail", e.target.value)}
                placeholder="support@yourcompany.com"
                className="app-field mt-1"
              />
            </label>

            <label className="block text-sm">
              <span className="text-brand-ink">Support phone shown in the email</span>
              <input
                type="tel"
                name="supportPhone"
                value={value.supportPhone}
                onChange={(e) => update("supportPhone", e.target.value)}
                placeholder="(555) 555-5555"
                className="app-field mt-1"
              />
            </label>

            <label className="block text-sm">
              <span className="text-brand-ink">Intro line (plain text, max 500 characters) — {value.introText.length}/500</span>
              <textarea
                name="introText"
                maxLength={500}
                rows={3}
                value={value.introText}
                onChange={(e) => update("introText", e.target.value)}
                placeholder="Leave blank to use the default intro copy."
                className="app-field mt-1"
              />
            </label>

            <button className="app-btn-primary-sm" type="submit">
              Save email settings
            </button>
          </form>
        </section>

        <section className="app-card">
          <h2 className="text-sm font-semibold text-brand-ink">Service summary emails</h2>
          <p className="mt-1 text-xs text-brand-muted">
            When a technician completes a visit, the customer gets an emailed summary. Add an address here to also
            get a copy of every one of those — the customer never sees this address.
          </p>

          <form action={actions.updateServiceSummaryCcEmail} className="mt-3 space-y-4">
            <label className="block text-sm">
              <span className="text-brand-ink">Send a copy of every service summary to</span>
              <input
                type="email"
                name="serviceSummaryCcEmail"
                value={value.serviceSummaryCcEmail}
                onChange={(e) => update("serviceSummaryCcEmail", e.target.value)}
                placeholder="office@yourcompany.com"
                className="app-field mt-1"
              />
            </label>

            <button className="app-btn-primary-sm" type="submit">
              Save
            </button>
          </form>
        </section>
      </div>

      <section className="app-card">
        <h2 className="text-sm font-semibold text-brand-ink">Welcome email preview</h2>
        <p className="mt-1 text-xs text-brand-muted">Updates as you type, before saving.</p>
        {previewError ? (
          <p className="mt-3 text-sm text-brand-danger">{previewError}</p>
        ) : (
          <iframe
            title="Welcome email preview"
            srcDoc={previewHtml}
            className="mt-3 h-[640px] w-full rounded border border-brand-border"
          />
        )}
      </section>
    </div>
  );
}
