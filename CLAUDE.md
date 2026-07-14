# Working conventions for this project

## Credentials and secrets
- Never ask the user to paste a real credential (DATABASE_URL, API keys, passwords)
  into chat, even to run a script for them. Instead: confirm the script/command is
  correct, then have the user run it themselves in their own terminal with the
  real value substituted in.
- Before claiming a credential or file was ever exposed/leaked/rotated, actually
  check (git history, current file contents) rather than assuming based on the
  file's current state.

## Destructive operations
- Any script that deletes or modifies production data must default to a dry run
  (list what it would do, change nothing) unless explicitly told to apply.
- Before running anything against production, state in plain language what it
  will do and what could go wrong if the assumption behind it is incorrect.

## Verifying claims before reporting them
- When reporting "done," confirm it against the actual source of truth (re-read
  the file, re-check git log/diff, re-run the test) rather than restating what
  was intended or what a previous step was supposed to do.
- If asked to summarize what changed, diff against the actual base rather than
  assuming a plan was followed exactly.

## Communication style
- Lead with the direct answer or fix, not a restatement of the problem.
- Flag security/architectural implications plainly when they exist, even if not
  asked — but don't manufacture urgency where none exists.
- When something is uncertain, say so explicitly rather than presenting a guess
  as confirmed fact.
- Keep going on a multi-step task rather than stopping to ask permission at each
  small step, unless the step is destructive, irreversible, or genuinely ambiguous.
