import { registerPlugin } from '@capacitor/core'

export const SolaraWidget = registerPlugin('SolaraWidget', {
  web: {
    setSnapshot: async () => ({ ok: false }),
    reload: async () => ({ ok: false }),
    getSnapshot: async () => ({ json: null }),
  },
})
