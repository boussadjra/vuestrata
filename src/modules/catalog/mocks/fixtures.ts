/**
 * Seeded product catalogue.
 *
 * Hand-written rather than generated. A catalogue is the one dataset where
 * invented names read as obviously fake — "Product 14, $73.19" tells a reader
 * nothing and makes the grid impossible to evaluate as a design. These are
 * plausible industrial-IoT SKUs with prices that hold their shape relative to
 * each other, so the sort-by-price control does something meaningful.
 */
import { money } from '~/lib/money'
import { createRng, daysFromNow, randomInt } from '~/mocks/seed'

import type { Product, ProductCategory, ProductStatus } from '../types'

interface Seed {
  sku: string
  name: string
  description: string
  category: ProductCategory
  price: number
  /** `null` for anything not physically stocked (software, services). */
  stock: number | null
  status?: ProductStatus
}

const SEEDS: Seed[] = [
  {
    sku: 'HW-CTRL-01',
    name: 'Edge Controller',
    description: 'Four-channel industrial controller with local rule execution and MQTT bridging.',
    category: 'hardware',
    price: 129_00,
    stock: 340,
  },
  {
    sku: 'HW-CTRL-02',
    name: 'Edge Controller Pro',
    description: 'Twelve-channel controller with redundant power input and hardware watchdog.',
    category: 'hardware',
    price: 379_00,
    stock: 62,
  },
  {
    sku: 'HW-SENS-04',
    name: 'Vibration Sensor',
    description: 'Tri-axial MEMS vibration sensor rated to 120 °C, IP67.',
    category: 'hardware',
    price: 39_00,
    stock: 1_280,
  },
  {
    sku: 'HW-SENS-07',
    name: 'Thermal Probe',
    description: 'Type-K thermocouple probe with stainless sheath and 3 m lead.',
    category: 'hardware',
    price: 27_00,
    stock: 18,
  },
  {
    sku: 'HW-GATE-02',
    name: 'Gateway Hub',
    description: 'Cellular gateway aggregating up to 64 sensors with 30-day local buffering.',
    category: 'hardware',
    price: 449_00,
    stock: 0,
  },
  {
    sku: 'HW-DISP-01',
    name: 'Panel Display, 7"',
    description: 'Sunlight-readable panel display for line-side dashboards.',
    category: 'hardware',
    price: 219_00,
    stock: 94,
  },
  {
    sku: 'SW-SEAT-01',
    name: 'Platform Seat (annual)',
    description: 'Named-user access to dashboards, alerting, and exports.',
    category: 'software',
    price: 240_00,
    stock: null,
  },
  {
    sku: 'SW-API-01',
    name: 'API Tier — 1M calls',
    description: 'One million monthly API calls with burst headroom and 99.9% availability.',
    category: 'software',
    price: 95_00,
    stock: null,
  },
  {
    sku: 'SW-ANOM-01',
    name: 'Anomaly Detection add-on',
    description: 'Unsupervised anomaly scoring across sensor streams, billed per gateway.',
    category: 'software',
    price: 180_00,
    stock: null,
  },
  {
    sku: 'SW-LEGACY-03',
    name: 'On-premise Connector (legacy)',
    description: 'Superseded by the Gateway Hub. Maintained for existing deployments only.',
    category: 'software',
    price: 60_00,
    stock: null,
    status: 'discontinued',
  },
  {
    sku: 'SV-INST-01',
    name: 'On-site Installation',
    description: 'One engineer-day of commissioning, including calibration and handover.',
    category: 'services',
    price: 850_00,
    stock: null,
  },
  {
    sku: 'SV-SUPP-02',
    name: 'Priority Support (year)',
    description: 'Four-hour response target, named engineer, quarterly review.',
    category: 'services',
    price: 1_200_00,
    stock: null,
  },
  {
    sku: 'SV-TRAIN-01',
    name: 'Operator Training',
    description: 'Half-day training for up to twelve operators, delivered on site or remotely.',
    category: 'services',
    price: 420_00,
    stock: null,
  },
  {
    sku: 'AC-CABL-03',
    name: 'Industrial Cable, 10m',
    description: 'Shielded M12 cable, oil-resistant jacket, rated for drag-chain use.',
    category: 'accessories',
    price: 24_00,
    stock: 2_400,
  },
  {
    sku: 'AC-MOUNT-02',
    name: 'DIN Rail Mount Kit',
    description: 'Mounting kit for controllers and gateways, 35 mm DIN.',
    category: 'accessories',
    price: 12_00,
    stock: 7,
  },
  {
    sku: 'AC-ENCL-01',
    name: 'Weatherproof Enclosure',
    description: 'IP66 polycarbonate enclosure with cable glands and mounting plate.',
    category: 'accessories',
    price: 78_00,
    stock: 156,
  },
  {
    sku: 'HW-PROTO-09',
    name: 'Acoustic Sensor (preview)',
    description: 'Ultrasonic leak-detection sensor. Not yet released for general sale.',
    category: 'hardware',
    price: 145_00,
    stock: 0,
    status: 'draft',
  },
]

export function createProductFixtures(): Product[] {
  const rng = createRng(4_711)

  return SEEDS.map((seed, index) => ({
    id: seed.sku,
    sku: seed.sku,
    name: seed.name,
    description: seed.description,
    category: seed.category,
    status: seed.status ?? 'active',
    price: money(seed.price),
    stock: seed.stock,
    // Reorder thresholds scale with how fast a line moves, so "low stock"
    // means something different for cable than for a gateway.
    reorderAt: seed.stock === null ? 0 : Math.max(10, Math.round(seed.stock * 0.15)),
    updatedAt: daysFromNow(-randomInt(rng, 1, 90), 10 + (index % 8)),
  }))
}

export const productFixtures = createProductFixtures()
