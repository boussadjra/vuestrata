<script setup lang="ts">
/**
 * Messages — the master/detail pattern.
 *
 * List and thread side by side on wide screens; on narrow ones the list gives
 * way to the thread, because two panes in 375 px is two unusable panes. The
 * selected message is held in the URL query rather than in component state, so
 * the browser Back button steps out of a thread the way the user expects and a
 * conversation can be linked to.
 */
import { useI18n } from 'vue-i18n'

import { UiBadge, UiButton, UiCard, UiEmptyState, UiPageHeader, UiSkeleton } from '@/components/ui'
import { useFormatters } from '@/composables/useFormatters'
import { resolveIcon } from '@/config/icon-provider'

import { useMessagesQuery, useUpdateMessageMutation } from '../composables/useMessages'
import { MESSAGE_FOLDERS, type Message, type MessageFilters, type MessageFolder } from '../types'

const { t } = useI18n()
const { dateTime, relativeTime } = useFormatters()
const route = useRoute()
const router = useRouter()

const folder = ref<MessageFolder>('inbox')

// The open thread lives in the URL, so it is route state and this page owns it.
// Normalizing it here means the rest of the screen sees `string | undefined`
// rather than the router's `string | null | (string | null)[]`.
const selectedId = useRouteQueryParam('thread')

const filters = computed<MessageFilters>(() => ({
  folder: folder.value,
  pageSize: 50,
  sortBy: 'receivedAt',
  sortOrder: 'desc',
}))

const { items, isPending, isError, refetch } = useMessagesQuery(filters)
const updateMessage = useUpdateMessageMutation()

const selected = computed(() => items.value.find((message) => message.id === selectedId.value))
const unreadCount = computed(() => items.value.filter((message) => !message.read).length)

function open(message: Message) {
  void router.replace({ query: { ...route.query, thread: message.id } })
  // Marked read on open, not on hover or on render. Marking on render would
  // clear the whole inbox the moment the page loads with a thread in the URL.
  if (!message.read) updateMessage.mutate({ id: message.id, patch: { read: true } })
}

function closeThread() {
  const query = { ...route.query }
  delete query.thread
  void router.replace({ query })
}

function selectFolder(next: MessageFolder) {
  folder.value = next
  // The selected thread belongs to the old folder; keeping it would show a
  // sent message under "Archived".
  closeThread()
}
</script>

<template>
  <div class="space-y-6">
    <UiPageHeader :title="t('messages_title')" :description="t('messages_subtitle')">
      <template #actions>
        <!--
          A tablist, not three buttons: folders are mutually exclusive views of
          the same list, which is exactly what the tab pattern describes, and it
          gives arrow-key movement between them for free.
        -->
        <div class="flex gap-1" role="tablist" :aria-label="t('messages_folders')">
          <UiButton
            v-for="value in MESSAGE_FOLDERS"
            :key="value"
            role="tab"
            :aria-selected="folder === value"
            :variant="folder === value ? 'primary' : 'ghost'"
            size="sm"
            @click="selectFolder(value)"
          >
            {{ t(`messages_folder_${value}`) }}
          </UiButton>
        </div>
      </template>
    </UiPageHeader>

    <UiEmptyState
      v-if="isError"
      variant="error"
      :title="t('common_error_title')"
      :description="t('common_error_body')"
    >
      <UiButton variant="ghost" @click="refetch">{{ t('common_retry') }}</UiButton>
    </UiEmptyState>

    <div v-else class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
      <!-- List pane. Hidden on mobile once a thread is open. -->
      <UiCard :class="['overflow-hidden', selected ? 'max-lg:hidden' : '']">
        <div class="border-border flex items-center justify-between border-b px-4 py-3">
          <h2 class="text-foreground text-sm font-semibold">
            {{ t(`messages_folder_${folder}`) }}
          </h2>
          <UiBadge v-if="unreadCount > 0" variant="primary" size="sm">
            {{ t('messages_unread', { count: unreadCount }) }}
          </UiBadge>
        </div>

        <div v-if="isPending" class="space-y-2 p-4" aria-busy="true">
          <UiSkeleton v-for="index in 5" :key="index" class="h-16" />
        </div>

        <p v-else-if="items.length === 0" class="text-muted-foreground p-8 text-center text-sm">
          {{ t('messages_empty') }}
        </p>

        <ul v-else class="divide-border divide-y">
          <li v-for="message in items" :key="message.id">
            <button
              type="button"
              :aria-current="message.id === selectedId ? 'true' : undefined"
              :class="[
                'w-full px-4 py-3 text-start transition-colors',
                message.id === selectedId ? 'bg-sidebar-accent' : 'hover:bg-muted',
              ]"
              @click="open(message)"
            >
              <span class="flex items-baseline justify-between gap-2">
                <span
                  :class="[
                    'truncate text-sm',
                    message.read ? 'text-muted-foreground' : 'text-foreground font-semibold',
                  ]"
                >
                  {{ message.correspondent }}
                </span>
                <time
                  :datetime="message.receivedAt"
                  class="text-muted-foreground shrink-0 text-xs"
                  :title="dateTime(message.receivedAt)"
                >
                  {{ relativeTime(message.receivedAt) }}
                </time>
              </span>
              <span
                :class="[
                  'mt-0.5 block truncate text-sm',
                  message.read ? 'text-muted-foreground' : 'text-foreground font-medium',
                ]"
              >
                {{ message.subject }}
              </span>
              <span class="text-muted-foreground mt-0.5 block truncate text-xs">
                {{ message.preview }}
              </span>
              <!--
                Unread is bold AND stated. Weight alone is a visual difference a
                screen reader does not convey, and the single most useful fact
                about a row in an inbox.
              -->
              <span v-if="!message.read" class="sr-only">{{ t('messages_unread_marker') }}</span>
            </button>
          </li>
        </ul>
      </UiCard>

      <!-- Thread pane -->
      <UiCard v-if="selected" class="flex flex-col p-5">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h2 class="text-foreground text-lg font-semibold">{{ selected.subject }}</h2>
            <p class="text-muted-foreground mt-0.5 text-sm">{{ selected.correspondent }}</p>
          </div>
          <UiButton variant="ghost" size="sm" class="lg:hidden" @click="closeThread">
            <span
              :class="[resolveIcon('arrow-left'), 'h-4 w-4 rtl:rotate-180']"
              aria-hidden="true"
            />
            {{ t('common_back') }}
          </UiButton>
        </div>

        <!--
          An ordered list: the sequence is the meaning of a thread, and `<ol>`
          is what tells assistive technology that these messages are in order
          rather than an unordered set.
        -->
        <ol class="mt-5 space-y-4">
          <li
            v-for="reply in selected.thread"
            :key="reply.id"
            :class="[
              'rounded-[var(--shape-radius-sm)] p-4',
              reply.author === 'You' ? 'bg-sidebar-accent ms-6' : 'bg-muted me-6',
            ]"
          >
            <div class="flex items-baseline justify-between gap-2">
              <p class="text-foreground text-sm font-medium">{{ reply.author }}</p>
              <time :datetime="reply.sentAt" class="text-muted-foreground shrink-0 text-xs">
                {{ dateTime(reply.sentAt) }}
              </time>
            </div>
            <p class="text-foreground mt-2 text-sm leading-relaxed">{{ reply.body }}</p>
          </li>
        </ol>
      </UiCard>

      <UiEmptyState
        v-else
        icon="letter"
        class="max-lg:hidden"
        :title="t('messages_select_title')"
        :description="t('messages_select_body')"
      />
    </div>
  </div>
</template>
