/** Projects and tasks mock backend — demo builds only. */
import { createCollectionMock } from '~/mocks/collection'

import { taskMoveSchema, type Project, type Task } from '../types'
import { projectFixtures, taskFixtures } from './fixtures'

const projectsMock = createCollectionMock<Project>({
  resource: 'projects',
  seed: projectFixtures,
  searchFields: ['name', 'description', 'lead'],
  filterFields: ['health'],
  defaultSort: { by: 'dueAt', order: 'asc' },
})

const tasksMock = createCollectionMock<Task>({
  resource: 'tasks',
  seed: taskFixtures,
  searchFields: ['title', 'assignee'],
  filterFields: ['projectId', 'status', 'priority'],
  defaultSort: { by: 'position', order: 'asc' },

  update: (record, body) => {
    // A board move changes status and position together. Accepting one without
    // the other lets a card land in a column at an undefined position, which
    // then renders in a different place on every reload.
    const parsed = taskMoveSchema.partial().safeParse(body)
    if (!parsed.success) return null
    return { ...record, ...parsed.data }
  },
})

export const projectsHandlers = [...projectsMock.handlers, ...tasksMock.handlers]
export const resetProjectsMock = () => {
  projectsMock.reset()
  tasksMock.reset()
}
