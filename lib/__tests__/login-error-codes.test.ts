import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

/**
 * Every `?error=` code the app sends to /login has a message on the page that receives it.
 *
 * This exists because of a real failure, not a hypothetical one. A paid signup whose email
 * already had a Supabase Auth account landed on /login with a password that could never work,
 * and nothing anywhere said so -- the user saw "invalid credentials" and had no way to know the
 * password they had just chosen was never applied. The fix adds `existing-login`, and a code the
 * login page does not recognise renders as silence, which is the same failure in a new costume.
 *
 * A string pin like this is crude, but the alternative is nothing: these two files are connected
 * only by a query parameter, which no typechecker can see across a redirect.
 */

const ROOT = process.cwd();
const LOGIN_PAGE = path.join(ROOT, "app", "login", "page.tsx");

/** Source files that could redirect to /login with an error code. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      out.push(...sourceFiles(full));
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

const loginPage = fs.readFileSync(LOGIN_PAGE, "utf8");

const redirected = new Set<string>();
for (const file of [...sourceFiles(path.join(ROOT, "app")), ...sourceFiles(path.join(ROOT, "lib"))]) {
  const src = fs.readFileSync(file, "utf8");
  for (const m of src.matchAll(/["'`]\/login\?error=([a-z-]+)["'`&]/g)) {
    redirected.add(m[1]);
  }
}

describe("login error codes", () => {
  it("finds the codes at all, so this test cannot pass by scanning nothing", () => {
    // Without this, deleting every redirect -- or breaking the regex -- would read as success.
    expect(redirected.size).toBeGreaterThan(0);
    expect(redirected).toContain("existing-login");
  });

  it("has a message on the login page for each one", () => {
    for (const code of redirected) {
      expect(loginPage, `no message for ?error=${code}`).toContain(`params.error === "${code}"`);
    }
  });
});

describe("the existing-login path", () => {
  const signup = fs.readFileSync(path.join(ROOT, "app", "signup", "actions.ts"), "utf8");

  it("never overwrites the password on an account it did not create", () => {
    // The tempting "fix" for this bug is to set the password on the existing account so the one
    // the user typed works. That turns a signup form into a password reset for any email the
    // attacker can name. If this assertion ever fails, read lib/supabase/admin.ts's doc comment
    // before changing it.
    expect(signup).not.toMatch(/updateUserById/);
  });

  it("only deletes the auth account on cleanup when this signup created it", () => {
    // A DB failure after linking a PRE-EXISTING account used to delete that account -- someone
    // else's portal login, destroyed because our own insert failed.
    const cleanup = signup.slice(signup.indexOf("deleteUser(authUserId)") - 600, signup.indexOf("deleteUser(authUserId)"));
    expect(cleanup).toContain("if (authUserCreated)");
  });

  it("acts on the created flag rather than discarding it", () => {
    expect(signup).toContain("created: authUserCreated");
    expect(signup).toContain('"/login?error=existing-login"');
  });
});
