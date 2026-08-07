/**
 * Seeded projects and their tasks.
 *
 * Task titles are real engineering work, not `Task 1`. A board of numbered
 * placeholders cannot be evaluated as a design: you cannot tell whether the
 * card truncates, whether two lines wrap, or whether the column is wide enough.
 */
import {
  PEOPLE_NAMES,
  createRng,
  daysFromNow,
  pick,
  pickMany,
  randomInt,
  sequentialId,
} from '~/mocks/seed'

import { PROJECT_HEALTHS, TASK_PRIORITIES, TASK_STATUSES, type Project, type Task } from '../types'

const PROJECTS: { name: string; description: string }[] = [
  {
    name: 'Gateway firmware 3.0',
    description: 'Rewrite the buffering layer and ship over-the-air updates to the field fleet.',
  },
  {
    name: 'Billing migration',
    description: 'Move invoicing off the legacy ledger and reconcile eighteen months of history.',
  },
  {
    name: 'Customer portal redesign',
    description: 'Rebuild the self-service portal around the new design system and WCAG 2.2 AA.',
  },
  {
    name: 'Warehouse integration',
    description: 'Two-way stock sync with the Hamburg and Osaka warehouse management systems.',
  },
  {
    name: 'Anomaly detection GA',
    description: 'Take the anomaly scoring add-on from private preview to general availability.',
  },
  {
    name: 'SOC 2 Type II',
    description: 'Close the remaining control gaps and complete the observation window.',
  },
]

const TASK_TITLES = [
  'Add retry with exponential backoff to the upload queue',
  'Replace the polling loop with server-sent events',
  'Write the migration runbook and dry-run it against staging',
  'Audit colour contrast across all ten themes',
  'Instrument p95 latency on the ingest endpoint',
  'Deduplicate customer records before the cutover',
  'Add integration tests for the partial-failure path',
  'Document the rollback procedure',
  'Reduce the cold-start time of the scoring worker',
  'Handle clock skew between gateway and server timestamps',
  'Paginate the audit export so it stops timing out',
  'Move secrets out of the build configuration',
  'Add a circuit breaker around the warehouse API',
  'Backfill missing SKUs from the supplier feed',
  'Rate-limit the public API per API key',
  'Fix the timezone drift in scheduled reports',
  'Split the monolithic settings page into sections',
  'Add keyboard navigation to the board columns',
  'Cache the permission lookup per request',
  'Retire the legacy on-premise connector',
]

export function createProjectFixtures(): { projects: Project[]; tasks: Task[] } {
  const rng = createRng(8_192)
  const tasks: Task[] = []

  const projects = PROJECTS.map((seed, index) => {
    const id = sequentialId('PRJ', index, 100)
    const titles = pickMany(rng, TASK_TITLES, randomInt(rng, 5, 9))

    const projectTasks = titles.map((title, taskIndex): Task => {
      const status = pick(rng, TASK_STATUSES)
      return {
        id: `${id}-T${String(taskIndex + 1).padStart(2, '0')}`,
        projectId: id,
        title,
        status,
        priority: pick(rng, TASK_PRIORITIES),
        // Roughly one task in five is unassigned — that is the realistic case
        // the board's "Unassigned" affordance exists for.
        assignee: rng() > 0.2 ? pick(rng, PEOPLE_NAMES) : null,
        // A done task has no outstanding due date; keeping one makes every
        // completed card render as overdue.
        dueAt: status === 'done' ? null : daysFromNow(randomInt(rng, -6, 30)),
        // Sparse positions leave room to drop a card between two others without
        // renumbering the whole column.
        position: (taskIndex + 1) * 1000,
      }
    })

    tasks.push(...projectTasks)

    const done = projectTasks.filter((task) => task.status === 'done').length
    return {
      id,
      name: seed.name,
      description: seed.description,
      health: pick(rng, PROJECT_HEALTHS),
      lead: pick(rng, PEOPLE_NAMES),
      startedAt: daysFromNow(-randomInt(rng, 30, 200)),
      dueAt: daysFromNow(randomInt(rng, 10, 120)),
      // Derived from the tasks, so the bar and the board always agree. A stored
      // percentage drifts the first time a task moves.
      progress: Math.round((done / projectTasks.length) * 100),
      taskCount: projectTasks.length,
      openTaskCount: projectTasks.length - done,
    } satisfies Project
  })

  return { projects, tasks }
}

const fixtures = createProjectFixtures()
export const projectFixtures = fixtures.projects
export const taskFixtures = fixtures.tasks
