// Yours. Everything that has to happen before the first paint (theme, error
// reporting, the router, the module registry, the auth session) is boot(),
// which Vuestrata maintains under src/modules/app/bootstrap/.
//
// To add something of your own, pass beforeMount:
//
//   void boot(App, { beforeMount: (app) => {
//     installQueryState(app)
//     app.use(MyPlugin)
//   } })
//
// Copying the steps of boot() into this file stops it receiving fixes.
import { boot } from '@/bootstrap'
import { installQueryState } from '@/plugins/query-state'

// Root component
import App from './App.vue'

// Local styles
import '@/styles/app.css'

void boot(App, { beforeMount: installQueryState })
