/**
 * Board rules.
 *
 * Plain functions, not a composable: none of this needs reactivity, and a rule
 * you can call with an array and an assertion is a rule you can actually test.
 * They lived inside the board route component, where "where does a moved card
 * land" was reachable only by mounting a page and driving a select.
 */
import { TASK_STATUSES, type Task, type TaskStatus } from './types'

/**
 * Gap left between adjacent cards.
 *
 * Positions are sparse so a card can later be inserted between two others
 * without renumbering the column. Appending reuses the same step.
 */
export const BOARD_POSITION_STEP = 1000

export interface BoardColumn {
  status: TaskStatus
  tasks: Task[]
}

/**
 * Tasks bucketed into the board's columns, in workflow order.
 *
 * Derived from `TASK_STATUSES` rather than from the data, so a status the board
 * does not know about cannot silently swallow the tasks in it.
 */
export function buildBoardColumns(tasks: readonly Task[]): BoardColumn[] {
  return TASK_STATUSES.map((status) => ({
    status,
    tasks: tasks
      .filter((task) => task.status === status)
      .sort((left, right) => left.position - right.position),
  }))
}

/** Statuses a card can move to — every column except the one it is in. */
export function moveDestinations(task: Task): TaskStatus[] {
  return TASK_STATUSES.filter((status) => status !== task.status)
}

/**
 * Where a card appended to `column` lands.
 *
 * One step past the last card. Reusing an existing position leaves the order
 * between the two undefined, and they swap on reload.
 */
export function appendPosition(column: readonly Task[]): number {
  return (column.at(-1)?.position ?? 0) + BOARD_POSITION_STEP
}

/**
 * Narrow a value from a UI control to a task status.
 *
 * Selects emit the widest type they support (`string | number | array`). A
 * membership check beats a cast: a value that is not a status is a bug worth
 * ignoring, not one worth crashing the board over.
 */
export function toTaskStatus(value: unknown): TaskStatus | null {
  const candidate = Array.isArray(value) ? value[0] : value
  if (typeof candidate !== 'string') return null
  return (TASK_STATUSES as readonly string[]).includes(candidate) ? (candidate as TaskStatus) : null
}

/**
 * Overdue is computed against now, never stored.
 *
 * A stored flag is correct only until midnight. A task in `done` is finished
 * regardless of when it was due, so it is never overdue.
 */
export function isTaskOverdue(task: Task, now: number = Date.now()): boolean {
  return task.dueAt !== null && task.status !== 'done' && Date.parse(task.dueAt) < now
}
