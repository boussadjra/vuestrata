/**
 * Board rules.
 *
 * "Where does a moved card land" is the kind of question that used to be
 * answerable only by mounting the board route and driving a select.
 */
import { describe, it, expect } from 'vite-plus/test'

import {
  appendPosition,
  BOARD_POSITION_STEP,
  buildBoardColumns,
  isTaskOverdue,
  moveDestinations,
  toTaskStatus,
} from '@/modules/projects/board'
import { TASK_STATUSES, type Task } from '@/modules/projects/types'

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 't-1',
    projectId: 'p-1',
    title: 'Ship it',
    status: 'backlog',
    priority: 'medium',
    assignee: null,
    dueAt: null,
    position: 1000,
    ...overrides,
  }
}

describe('buildBoardColumns', () => {
  it('produces one column per known status, in workflow order', () => {
    const columns = buildBoardColumns([])
    expect(columns.map((column) => column.status)).toEqual([...TASK_STATUSES])
  })

  it('sorts each column by position, not by arrival order', () => {
    const columns = buildBoardColumns([
      task({ id: 't-b', position: 2000 }),
      task({ id: 't-a', position: 1000 }),
    ])
    const backlog = columns.find((column) => column.status === 'backlog')!
    expect(backlog.tasks.map((entry) => entry.id)).toEqual(['t-a', 't-b'])
  })

  it('keeps tasks in their own column', () => {
    const columns = buildBoardColumns([task({ id: 't-done', status: 'done' })])
    expect(columns.find((column) => column.status === 'done')!.tasks).toHaveLength(1)
    expect(columns.find((column) => column.status === 'backlog')!.tasks).toHaveLength(0)
  })
})

describe('moveDestinations', () => {
  it('excludes the column the card is already in', () => {
    expect(moveDestinations(task({ status: 'review' }))).not.toContain('review')
    expect(moveDestinations(task({ status: 'review' }))).toHaveLength(TASK_STATUSES.length - 1)
  })
})

describe('appendPosition', () => {
  it('lands one step past the last card', () => {
    expect(appendPosition([task({ position: 3000 })])).toBe(3000 + BOARD_POSITION_STEP)
  })

  // Reusing an existing position leaves the order between two cards undefined,
  // and they swap on reload — so an empty column must not return 0.
  it('starts a step in on an empty column', () => {
    expect(appendPosition([])).toBe(BOARD_POSITION_STEP)
  })
})

describe('toTaskStatus', () => {
  it('accepts a known status', () => {
    expect(toTaskStatus('done')).toBe('done')
  })

  it('takes the first entry of an array, as a multi-select would emit', () => {
    expect(toTaskStatus(['review'])).toBe('review')
  })

  it('rejects anything that is not a status', () => {
    expect(toTaskStatus('archived')).toBeNull()
    expect(toTaskStatus(3)).toBeNull()
    expect(toTaskStatus(undefined)).toBeNull()
  })
})

describe('isTaskOverdue', () => {
  const now = Date.parse('2026-06-15T12:00:00.000Z')

  it('is true for a past due date on an unfinished task', () => {
    expect(isTaskOverdue(task({ dueAt: '2026-06-01T00:00:00.000Z' }), now)).toBe(true)
  })

  it('is false once the task is done, however late', () => {
    expect(isTaskOverdue(task({ dueAt: '2026-06-01T00:00:00.000Z', status: 'done' }), now)).toBe(
      false,
    )
  })

  it('is false without a due date', () => {
    expect(isTaskOverdue(task({ dueAt: null }), now)).toBe(false)
  })

  it('is false before the due date', () => {
    expect(isTaskOverdue(task({ dueAt: '2026-07-01T00:00:00.000Z' }), now)).toBe(false)
  })
})
