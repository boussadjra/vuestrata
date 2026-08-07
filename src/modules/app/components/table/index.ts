/**
 * Cell renderers for `UiDataGrid`.
 *
 * TanStack renders cells through `columnDef.cell`, not through template slots,
 * so a domain list page composes them with `h(TableLinkCell, { … })`. Each of
 * these carries a piece of behaviour every list needs and every list would
 * otherwise get subtly wrong: a real link instead of a row click, a text label
 * beside a status colour, tabular figures, a machine-readable `<time>`.
 */
export { default as TableLinkCell } from './TableLinkCell.vue'
export { default as TableStatusCell } from './TableStatusCell.vue'
export { default as TableMoneyCell } from './TableMoneyCell.vue'
export { default as TableDateCell } from './TableDateCell.vue'
