'use strict'
const { registerPlugin } = require('@capacitor/core')
const SolaraWidget = registerPlugin('SolaraWidget', {
  web: {
    setSnapshot: async () => ({ ok: false }),
    reload: async () => ({ ok: false }),
    getSnapshot: async () => ({ json: null }),
  },
})
module.exports = { SolaraWidget }
