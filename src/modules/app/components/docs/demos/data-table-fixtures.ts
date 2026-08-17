import { money, type Money } from '~/lib/money'

export interface TeamMember {
  id: string
  name: string
  email: string
  role: string
  status: string
  notes?: string
}

export const teamMembers: TeamMember[] = [
  {
    id: '1',
    name: 'Ada Lovelace',
    email: 'ada@analytical.dev',
    role: 'Admin',
    status: 'Active',
    notes: 'Owns release templates and final QA signoff for internal starter updates.',
  },
  {
    id: '2',
    name: 'Grace Hopper',
    email: 'grace@compiler.dev',
    role: 'Member',
    status: 'Reviewing',
    notes: 'Reviewing the new table filters before the next internal rollout.',
  },
  {
    id: '3',
    name: 'Margaret Hamilton',
    email: 'margaret@apollo.dev',
    role: 'Owner',
    status: 'Active',
  },
  {
    id: '4',
    name: 'Katherine Johnson',
    email: 'katherine@trajectory.dev',
    role: 'Member',
    status: 'Active',
    notes: 'Checking pagination totals against the collection contract.',
  },
  {
    id: '5',
    name: 'Alan Turing',
    email: 'alan@machine.dev',
    role: 'Admin',
    status: 'Reviewing',
  },
]

export interface TaskRow {
  id: number
  title: string
  priority: string
}

export const tasks: TaskRow[] = [
  { id: 1, title: 'Fix login bug', priority: 'High' },
  { id: 2, title: 'Add dark mode', priority: 'Medium' },
  { id: 3, title: 'Update docs', priority: 'Low' },
  { id: 4, title: 'Audit empty states', priority: 'High' },
]

export type InvoiceStatus = 'paid' | 'pending' | 'overdue' | 'draft'

export interface InvoiceRow {
  id: string
  customer: string
  email: string
  status: InvoiceStatus
  total: Money
  issuedAt: string
}

export const invoices: InvoiceRow[] = [
  {
    id: 'inv-1042',
    customer: 'Northwind Labs',
    email: 'ap@northwind.test',
    status: 'paid',
    total: money(184_500, 'USD'),
    issuedAt: '2026-07-12',
  },
  {
    id: 'inv-1043',
    customer: 'Cedar & Co',
    email: 'billing@cedar.test',
    status: 'pending',
    total: money(62_000, 'USD'),
    issuedAt: '2026-08-01',
  },
  {
    id: 'inv-1044',
    customer: 'Helios Transit',
    email: 'finance@helios.test',
    status: 'overdue',
    total: money(9_750, 'USD'),
    issuedAt: '2026-06-18',
  },
  {
    id: 'inv-1045',
    customer: 'Pebble Studio',
    email: 'hi@pebble.test',
    status: 'draft',
    total: money(3_200, 'USD'),
    issuedAt: '2026-08-09',
  },
  {
    id: 'inv-1046',
    customer: 'Orion Freight',
    email: 'accounts@orion.test',
    status: 'paid',
    total: money(241_090, 'USD'),
    issuedAt: '2026-07-28',
  },
]

export const invoiceStatusVariant = (status: InvoiceStatus) => {
  switch (status) {
    case 'paid':
      return 'success' as const
    case 'pending':
      return 'warning' as const
    case 'overdue':
      return 'error' as const
    case 'draft':
      return 'default' as const
  }
}

export function invoiceStatusLabel(status: InvoiceStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

export interface DirectoryPerson {
  id: string
  name: string
  title: string
  location: string
}

export const directory: DirectoryPerson[] = [
  { id: 'd-1', name: 'Imani Okonkwo', title: 'Design lead', location: 'Lagos' },
  { id: 'd-2', name: 'Jonas Berg', title: 'Platform engineer', location: 'Stockholm' },
  { id: 'd-3', name: 'Sofia Alvarez', title: 'Product manager', location: 'Mexico City' },
  { id: 'd-4', name: 'Mei Chen', title: 'Staff researcher', location: 'Taipei' },
  { id: 'd-5', name: 'Noah Cohen', title: 'Support lead', location: 'Tel Aviv' },
]

export interface OrgNode {
  id: string
  name: string
  role: string
  team?: OrgNode[]
}

export const orgTree: OrgNode[] = [
  {
    id: 'platform',
    name: 'Platform',
    role: 'Department',
    team: [
      { id: 'platform-ops', name: 'Ops', role: 'Team' },
      { id: 'platform-runtime', name: 'Runtime', role: 'Team' },
    ],
  },
  {
    id: 'product',
    name: 'Product',
    role: 'Department',
    team: [{ id: 'product-growth', name: 'Growth', role: 'Team' }],
  },
  { id: 'finance', name: 'Finance', role: 'Department' },
]

export interface LogRow {
  id: string
  event: string
  source: string
  durationMs: number
}

export function makeLogRows(count: number): LogRow[] {
  const sources = ['api', 'worker', 'scheduler', 'webhook']
  const events = ['job.completed', 'job.retry', 'cache.purge', 'mail.sent', 'audit.write']

  return Array.from({ length: count }, (_, index) => ({
    id: `log-${index + 1}`,
    event: events[index % events.length] ?? 'job.completed',
    source: sources[index % sources.length] ?? 'api',
    durationMs: 12 + ((index * 17) % 480),
  }))
}

export interface DirectoryApiUser {
  id: number
  name: string
  email: string
  company: string
  city: string
}

export const directoryApiFallback: DirectoryApiUser[] = [
  {
    id: 1,
    name: 'Leanne Graham',
    email: 'leanne@example.test',
    company: 'Romaguera-Crona',
    city: 'Gwenborough',
  },
  {
    id: 2,
    name: 'Ervin Howell',
    email: 'ervin@example.test',
    company: 'Deckow-Crist',
    city: 'Wisokyburgh',
  },
  {
    id: 3,
    name: 'Clementine Bauch',
    email: 'clementine@example.test',
    company: 'Romaguera-Jacobson',
    city: 'McKenziehaven',
  },
  {
    id: 4,
    name: 'Patricia Lebsack',
    email: 'patricia@example.test',
    company: 'Robel-Corkery',
    city: 'South Elvis',
  },
  {
    id: 5,
    name: 'Chelsey Dietrich',
    email: 'chelsey@example.test',
    company: 'Keebler LLC',
    city: 'Roscoeview',
  },
  {
    id: 6,
    name: 'Dennis Schulist',
    email: 'dennis@example.test',
    company: 'Considine-Lockman',
    city: 'South Christy',
  },
  {
    id: 7,
    name: 'Kurtis Weissnat',
    email: 'kurtis@example.test',
    company: 'Johns Group',
    city: 'Howemouth',
  },
  {
    id: 8,
    name: 'Nicholas Runolfsdottir',
    email: 'nicholas@example.test',
    company: 'Abernathy Group',
    city: 'Aliyaview',
  },
  {
    id: 9,
    name: 'Glenna Reichert',
    email: 'glenna@example.test',
    company: 'Yost and Sons',
    city: 'Bartholomebury',
  },
  {
    id: 10,
    name: 'Clementina DuBuque',
    email: 'clementina@example.test',
    company: 'Hoeger LLC',
    city: 'Lebsackbury',
  },
]
