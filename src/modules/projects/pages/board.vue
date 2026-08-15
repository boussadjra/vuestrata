<script setup lang="ts">
/**
 * Route adapter for `/dashboard/projects/:id`.
 *
 * Everything this page knows is which project the URL names. The board itself —
 * columns, ordering, the move mutation — belongs to the projects feature and
 * lives in `ProjectBoardScreen`, so it can be rendered anywhere an id is
 * available rather than only under this route.
 *
 * The breadcrumb label is a route-level concern, so it stays here. Reading it
 * from `useProjectQuery` costs no request: the screen asks for the same key and
 * TanStack Query serves both from one cache entry.
 */
import { useBreadcrumbLabel } from '@/composables/useBreadcrumbs'
import { useRouteParam } from '@/composables/useRouteParam'

import ProjectBoardScreen from '../components/ProjectBoardScreen.vue'
import { useProjectQuery } from '../composables/useProjects'

const projectId = useRouteParam('id')

const { item: project } = useProjectQuery(projectId)
useBreadcrumbLabel(() => project.value?.name)
</script>

<template>
  <ProjectBoardScreen :project-id="projectId" />
</template>
