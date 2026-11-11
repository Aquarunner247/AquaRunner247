import Link from "next/link";
import { REMINDER_CHOICES, taskDueState } from "@/lib/customer-task-due";
import { formatLocalDate } from "@/lib/timezone";

export type NotebookTask = {
  id: string;
  title: string;
  customerId: string;
  customerName: string;
  dueOn: Date | null;
};

type Props = {
  tasks: NotebookTask[];
  /** Active customers only -- a to-do cannot be owed to a relationship that has ended. */
  customers: Array<{ id: string; name: string }>;
  /** The page's single `now`, passed in rather than read here, so a row cannot be labelled
   *  overdue by a render that happened a moment after the query. */
  now: Date;
  timeZone: string;
  addTask: (formData: FormData) => void | Promise<void>;
  setTaskDone: (formData: FormData) => void | Promise<void>;
};

/**
 * The office's to-do list, on the dashboard, with somewhere to write the next one down.
 *
 * Same definition of "due" as the notification bell and the daily digest email -- all three
 * read findDueTasks (lib/customer-tasks.ts), so a to-do shown here cannot disagree with the
 * one that was emailed this morning.
 *
 * Deliberately NOT using the status tokens for urgency. brand-ok/warn/danger mean a water
 * reading (DESIGN-SYSTEM.md rule 3), and an overdue phone call is not a chemistry result --
 * borrowing the colour would make a late to-do compete with a failed chlorine reading for the
 * same glance. Overdue is a coral chip instead, which is the product's one "act now" accent,
 * and the label sits ON the coral in brand-ctaText so it clears AA.
 */
export function TaskNotebook({ tasks, customers, now, timeZone, addTask, setTaskDone }: Props) {
  const overdueCount = tasks.filter((t) => taskDueState(t.dueOn, now, timeZone) === "overdue").length;

  return (
    <div data-tour="office-task-notebook" className="app-notebook">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-brand-border px-4 py-3 md:px-5">
        <div>
          <h2 className="font-display text-lg font-bold text-brand-ink">To-do</h2>
          <p className="text-xs text-brand-muted">
            {tasks.length === 0
              ? "Nothing due"
              : `${tasks.length} open${overdueCount > 0 ? ` · ${overdueCount} overdue` : ""}`}
          </p>
        </div>
        <Link href="/dashboard/customers" className="app-link text-sm">
          All customers
        </Link>
      </div>

      <div className="app-notebook-lines">
        {tasks.length === 0 ? (
          <div className="app-notebook-row">
            <p className="text-sm text-brand-muted">Nothing on the list. Write the next one below.</p>
          </div>
        ) : (
          <ul>
            {tasks.map((task) => {
              const state = taskDueState(task.dueOn, now, timeZone);
              return (
                <li key={task.id} className="app-notebook-row">
                  {/* A form per row rather than one around the list: each tick is its own
                      submission, so ticking one cannot carry another row's id with it. */}
                  <form action={setTaskDone}>
                    <input type="hidden" name="customerId" value={task.customerId} />
                    <input type="hidden" name="taskId" value={task.id} />
                    <input type="hidden" name="done" value="1" />
                    <button
                      type="submit"
                      aria-label={`Mark "${task.title}" done`}
                      title="Mark done"
                      className="flex h-6 w-6 items-center justify-center rounded border border-brand-control text-transparent transition hover:border-brand-primary hover:text-brand-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
                    >
                      ✓
                    </button>
                  </form>

                  <span className="min-w-0 flex-1 truncate text-sm text-brand-ink" title={task.title}>
                    {task.title}
                  </span>

                  <Link
                    href={`/dashboard/customers/${task.customerId}`}
                    className="app-link hidden max-w-[12rem] truncate text-xs sm:block"
                  >
                    {task.customerName}
                  </Link>

                  {state === "overdue" && task.dueOn ? (
                    <span className="shrink-0 rounded-full bg-brand-cta px-2 py-0.5 text-[11px] font-semibold text-brand-ctaText">
                      {formatLocalDate(task.dueOn, "UTC", { month: "short", day: "numeric" })}
                    </span>
                  ) : state === "today" ? (
                    <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-brand-ink">
                      Today
                    </span>
                  ) : task.dueOn ? (
                    <span className="shrink-0 text-[11px] text-brand-muted">
                      {formatLocalDate(task.dueOn, "UTC", { month: "short", day: "numeric" })}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-brand-border bg-brand-surface px-4 py-3 md:px-5">
        {customers.length === 0 ? (
          <p className="text-sm text-brand-muted">
            Add a customer first and to-dos can be written against them.{" "}
            <Link href="/dashboard/customers" className="app-link">
              Customers
            </Link>
          </p>
        ) : (
          <form action={addTask} className="grid gap-2 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_auto]">
            <select name="customerId" required defaultValue="" className="app-field-sm" aria-label="Customer">
              <option value="" disabled>
                Customer…
              </option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <input
              name="title"
              required
              maxLength={200}
              placeholder="What needs doing"
              className="app-field-sm"
              aria-label="What needs doing"
            />

            <button type="submit" className="app-btn-primary-sm">
              Add
            </button>

            {/* Second row: both optional, so the common case is two fields and a button. */}
            <div className="grid gap-2 sm:col-span-3 sm:grid-cols-[minmax(0,11rem)_minmax(0,11rem)]">
              <input name="dueOn" type="date" className="app-field-sm" aria-label="Due date (optional)" />
              <select name="remindDaysBefore" defaultValue="0" className="app-field-sm" aria-label="Remind">
                {REMINDER_CHOICES.map((choice) => (
                  <option key={choice.days} value={choice.days}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
