// Temporary, deliberately-throwing route used once to confirm Sentry is actually
// receiving production errors. Deleted immediately after verification.
export async function GET() {
  throw new Error("AquaRunner Sentry verification test -- safe to ignore/resolve");
}
