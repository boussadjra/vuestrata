/**
 * The board's reactive workflow: load a project's tasks, arrange them into
 * columns, and move a card between them.
 *
 * Takes a project id, not a route. The board is a feature that happens to be
 * reachable at `/dashboard/projects/:id` today; it should be just as mountable
 * inside a dialog, a playground, or a test that never installs a router.
 */
import type { MaybeRefOrGetter } from 'vue'

import { appendPosition, buildBoardColumns, type BoardColumn } from '../board'
import type { Task, TaskStatus } from '../types'
import { useMoveTaskMutation, useProjectQuery, useTasksQuery } from './useProjects'

export function useProjectBoard(projectId: MaybeRefOrGetter<string | undefined>) {
  const id = computed(() => toValue(projectId))

  const { item: project, isPending: isProjectPending } = useProjectQuery(id)

  const filters = computed(() => ({
    projectId: id.value,
    // One page big enough for a whole board. A paginated kanban is not a
    // kanban: "page 2 of In Progress" is not a concept the user has.
    pageSize: 100,
    sortBy: 'position',
    sortOrder: 'asc' as const,
  }))

  const { items: tasks, isPending: isTasksPending, isError, refetch } = useTasksQuery(filters)
  const moveTask = useMoveTaskMutation()

  const columns = computed<BoardColumn[]>(() => buildBoardColumns(tasks.value))

  /** Append `task` to the end of the `target` column. */
  function move(task: Task, target: TaskStatus) {
    const column = columns.value.find((entry) => entry.status === target)
    moveTask.mutate({
      id: task.id,
      patch: { status: target, position: appendPosition(column?.tasks ?? []) },
    })
  }

  return {
    project,
    columns,
    // The board cannot render until both halves have arrived: a header with no
    // columns under it reads as an empty project rather than as a loading one.
    isPending: computed(() => isProjectPending.value || isTasksPending.value),
    isError,
    refetch,
    move,
    isMoving: moveTask.isPending,
  }
}
