/**
 * Seeded team directory.
 *
 * Titles, skills and timezones are matched to the department, so the directory
 * reads as a real organization rather than a shuffle. A "Finance" record whose
 * skills are "Rust, Kubernetes" is the kind of detail that makes a reader stop
 * trusting every other field on the page.
 */
import {
  CITIES,
  PEOPLE_NAMES,
  createRng,
  daysFromNow,
  pick,
  pickMany,
  randomInt,
} from '~/mocks/seed'

import { TEAM_DEPARTMENTS, type TeamDepartment, type TeamMember } from '../types'

const TITLES: Record<TeamDepartment, string[]> = {
  engineering: [
    'Staff Engineer',
    'Senior Engineer',
    'Engineer',
    'Engineering Manager',
    'Site Reliability Engineer',
  ],
  design: ['Product Designer', 'Senior Product Designer', 'Design Lead', 'UX Researcher'],
  sales: ['Account Executive', 'Sales Engineer', 'Regional Sales Manager', 'SDR'],
  support: ['Support Engineer', 'Senior Support Engineer', 'Support Lead'],
  operations: ['Operations Analyst', 'Supply Chain Lead', 'Warehouse Coordinator'],
  finance: ['Financial Analyst', 'Controller', 'Revenue Operations Manager'],
}

const SKILLS: Record<TeamDepartment, string[]> = {
  engineering: [
    'TypeScript',
    'Rust',
    'Kubernetes',
    'PostgreSQL',
    'Embedded C',
    'Observability',
    'MQTT',
  ],
  design: ['Design systems', 'Accessibility', 'Prototyping', 'User research', 'Motion'],
  sales: ['Enterprise sales', 'Solution design', 'Contract negotiation', 'Forecasting'],
  support: ['Incident triage', 'Firmware debugging', 'Customer comms', 'Runbooks'],
  operations: ['Inventory planning', 'Logistics', 'Vendor management', 'Process design'],
  finance: ['Revenue recognition', 'Forecasting', 'Audit', 'Pricing analysis'],
}

/** City → IANA timezone. A directory that shows the wrong hour is worse than none. */
const TIMEZONES: Record<string, string> = {
  Lisbon: 'Europe/Lisbon',
  Toronto: 'America/Toronto',
  Osaka: 'Asia/Tokyo',
  Nairobi: 'Africa/Nairobi',
  Hamburg: 'Europe/Berlin',
  Bengaluru: 'Asia/Kolkata',
  'São Paulo': 'America/Sao_Paulo',
  Casablanca: 'Africa/Casablanca',
  Melbourne: 'Australia/Melbourne',
  Warsaw: 'Europe/Warsaw',
}

const STATUSES = ['available', 'busy', 'away', 'on_leave'] as const

export function createTeamFixtures(count = 24): TeamMember[] {
  const rng = createRng(11_235)

  return Array.from({ length: count }, (_, index) => {
    const name = PEOPLE_NAMES[index % PEOPLE_NAMES.length]!
    const department = TEAM_DEPARTMENTS[index % TEAM_DEPARTMENTS.length]!
    const location = pick(rng, CITIES)

    return {
      id: `TM-${String(100 + index)}`,
      name,
      email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@vuestrata.dev`,
      title: pick(rng, TITLES[department]),
      department,
      location: `${location.city}, ${location.country}`,
      timezone: TIMEZONES[location.city] ?? 'UTC',
      // The first member of each department has no manager, which gives the
      // directory a coherent top rather than a cycle of mutual managers.
      manager:
        index < TEAM_DEPARTMENTS.length ? null : PEOPLE_NAMES[index % TEAM_DEPARTMENTS.length]!,
      skills: pickMany(rng, SKILLS[department], randomInt(rng, 2, 4)),
      joinedAt: daysFromNow(-randomInt(rng, 60, 2_200)),
      status: pick(rng, STATUSES),
    } satisfies TeamMember
  })
}

export const teamFixtures = createTeamFixtures()
