import { describe, it, expect } from "vitest";
import { renderTaskDigestEmail } from "@/lib/mail/task-digest-email";

const group = (name: string, tasks: { title: string; dueLabel: string; overdue: boolean }[]) => ({
  customerName: name,
  customerUrl: `https://app.example.com/dashboard/customers/${name.toLowerCase()}`,
  tasks,
});

const base = {
  organizationName: "Lindley's Pool & Spa Service",
  dashboardUrl: "https://app.example.com/dashboard",
};

describe("renderTaskDigestEmail subject", () => {
  /** Overdue leads, because that is what decides whether this is opened now or after lunch. */
  it("leads with the overdue count when there is one", () => {
    const { subject } = renderTaskDigestEmail({
      ...base,
      overdueCount: 2,
      groups: [group("Ritiro", [
        { title: "a", dueLabel: "was due Oct 6", overdue: true },
        { title: "b", dueLabel: "was due Oct 5", overdue: true },
        { title: "c", dueLabel: "due today", overdue: false },
      ])],
    });
    expect(subject).toBe("3 to-dos today — 2 overdue");
  });

  it("says nothing about overdue when none is", () => {
    const { subject } = renderTaskDigestEmail({
      ...base,
      overdueCount: 0,
      groups: [group("Ritiro", [{ title: "a", dueLabel: "due today", overdue: false }])],
    });
    expect(subject).toBe("1 to-do today");
    expect(subject).not.toContain("overdue");
  });

  it("counts across every customer, not just the first", () => {
    const { subject } = renderTaskDigestEmail({
      ...base,
      overdueCount: 0,
      groups: [
        group("Ritiro", [{ title: "a", dueLabel: "due today", overdue: false }]),
        group("Borgata", [
          { title: "b", dueLabel: "due today", overdue: false },
          { title: "c", dueLabel: "no date set", overdue: false },
        ]),
      ],
    });
    expect(subject).toBe("3 to-dos today");
  });
});

describe("renderTaskDigestEmail body", () => {
  const rendered = renderTaskDigestEmail({
    ...base,
    overdueCount: 1,
    groups: [
      group("Ritiro", [{ title: "Send over a bid", dueLabel: "was due Oct 6", overdue: true }]),
      group("Borgata", [{ title: "Chase the contract", dueLabel: "no date set", overdue: false }]),
    ],
  });

  it("lists every customer and every to-do", () => {
    for (const text of ["Ritiro", "Borgata", "Send over a bid", "Chase the contract"]) {
      expect(rendered.html).toContain(text);
    }
  });

  it("marks an overdue line in the danger colour and a normal one in muted", () => {
    expect(rendered.html).toContain("#A32E22"); // brand.danger -- overdue
    expect(rendered.html).toContain("#55696C"); // brand.muted  -- everything else
  });

  it("links each customer to its own page", () => {
    expect(rendered.html).toContain("/dashboard/customers/ritiro");
    expect(rendered.html).toContain("/dashboard/customers/borgata");
  });

  /** Customer names and to-do titles are typed by staff and land in HTML. */
  it("escapes what a person typed", () => {
    const { html } = renderTaskDigestEmail({
      ...base,
      overdueCount: 0,
      groups: [group("Smith & Sons", [{ title: '<script>alert("x")</script>', dueLabel: "due today", overdue: false }])],
    });
    expect(html).toContain("Smith &amp; Sons");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  /** Whitespace-tolerant: the footer sentence wraps across lines in the template literal, so matching
   *  it literally tests the indentation rather than the copy. */
  it("says why it arrived and how to make it stop", () => {
    expect(rendered.html).toMatch(/only when something is due/);
    expect(rendered.html.replace(/\s+/g, " ")).toContain("drops off this list");
  });
});
