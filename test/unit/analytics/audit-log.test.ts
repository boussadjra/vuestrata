/**
 * Audit-log rules.
 *
 * These lived in the audit route component, where the only way to ask "does
 * this entry match the search box" was to mount a page and type into it.
 */
import { describe, it, expect } from 'vite-plus/test'

import {
  auditActionIcon,
  auditActionToneClass,
  auditActionTranslationKey,
  AUDIT_ACTION_TONES,
  countAuditActionsByPrefix,
  filterAuditEntries,
  humanizeAuditAction,
  matchesAuditSearch,
  uniqueAuditActions,
} from '@/modules/analytics/lib/audit-log'
import type { AuditLogEntry } from '@/types'

function entry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: 'a-1',
    userId: 'u-42',
    userName: 'Ada',
    action: 'user.login',
    resource: 'session',
    createdAt: '2026-01-05T10:00:00.000Z',
    ...overrides,
  }
}

describe('auditActionTranslationKey', () => {
  it('replaces every dot, not just the first', () => {
    expect(auditActionTranslationKey('billing.update_plan')).toBe(
      'audit_action_billing_update_plan',
    )
  })
})

describe('humanizeAuditAction', () => {
  it('turns a dotted action into title-cased words', () => {
    expect(humanizeAuditAction('billing.update_plan')).toBe('Billing Update Plan')
  })
})

describe('auditActionToneClass', () => {
  it('maps a known action to its tone', () => {
    expect(auditActionToneClass('billing.cancel')).toBe(AUDIT_ACTION_TONES.danger)
  })

  // An action the server adds before the client knows about it must still get
  // a legible badge rather than `undefined` in the class list.
  it('falls back to neutral for an unknown action', () => {
    expect(auditActionToneClass('warehouse.restock')).toBe(AUDIT_ACTION_TONES.neutral)
  })
})

describe('auditActionIcon', () => {
  it('falls back to a document icon for an unknown action', () => {
    expect(auditActionIcon('warehouse.restock')).toBe('document')
    expect(auditActionIcon('user.login')).toBe('login')
  })
})

describe('uniqueAuditActions', () => {
  it('deduplicates while preserving first-seen order', () => {
    const entries = [
      entry({ action: 'user.login' }),
      entry({ action: 'billing.cancel' }),
      entry({ action: 'user.login' }),
    ]
    expect(uniqueAuditActions(entries)).toEqual(['user.login', 'billing.cancel'])
  })
})

describe('matchesAuditSearch', () => {
  it('matches case-insensitively across action, user, and resource', () => {
    const record = entry({ action: 'user.invite', userId: 'u-99', resource: 'workspace' })
    expect(matchesAuditSearch(record, 'INVITE')).toBe(true)
    expect(matchesAuditSearch(record, 'u-99')).toBe(true)
    expect(matchesAuditSearch(record, 'WorkSpace')).toBe(true)
  })

  it('searches inside the details payload', () => {
    const record = entry({ details: { requestId: 'req-7f3' } })
    expect(matchesAuditSearch(record, 'req-7f3')).toBe(true)
  })

  it('matches everything when the query is blank', () => {
    expect(matchesAuditSearch(entry(), '   ')).toBe(true)
  })

  it('does not match unrelated text', () => {
    expect(matchesAuditSearch(entry(), 'nothing-like-this')).toBe(false)
  })
})

describe('filterAuditEntries', () => {
  it('returns a copy of the input when the query is empty', () => {
    const entries = [entry()]
    const result = filterAuditEntries(entries, '')
    expect(result).toEqual(entries)
    expect(result).not.toBe(entries)
  })

  it('narrows to matching entries', () => {
    const entries = [
      entry({ action: 'user.login' }),
      entry({ id: 'a-2', action: 'billing.cancel' }),
    ]
    expect(filterAuditEntries(entries, 'billing')).toHaveLength(1)
  })
})

describe('countAuditActionsByPrefix', () => {
  it('counts entries in a domain', () => {
    const entries = [
      entry({ action: 'user.login' }),
      entry({ action: 'user.logout' }),
      entry({ action: 'billing.cancel' }),
    ]
    expect(countAuditActionsByPrefix(entries, 'user.')).toBe(2)
    expect(countAuditActionsByPrefix(entries, 'billing.')).toBe(1)
    expect(countAuditActionsByPrefix(entries, 'reports.')).toBe(0)
  })
})
