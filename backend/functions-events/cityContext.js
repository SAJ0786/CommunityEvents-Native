'use strict';
const { AsyncLocalStorage } = require('node:async_hooks');
const model = import('./cityCatalogue.mjs');
function createCityContext(db) {
  const context = new AsyncLocalStorage(); let bundled;
  const ready = model.then(module => { bundled = module.createCityResolver(); return module; });
  const current = () => {
    const resolver = context.getStore() || bundled;
    if (!resolver) throw Error('City catalogue has not loaded.');
    return resolver;
  };
  async function run(work) {
    const module = await ready;
    const snapshot = await db.collection('settings').doc('cityCatalogue').get();
    // Missing means existing bundled cities. Malformed/network failure is NOT a
    // fallback: stop before selecting any city audience or modifying records.
    const resolver = module.createCityResolver(snapshot.exists ? snapshot.data() : module.BUNDLED_CITY_CATALOGUE);
    return context.run(resolver, work);
  }
  return {
    run, ready,
    wrap: register => (options, handler) => register(options, (...args) => run(() => handler(...args))),
    normalizeCity: value => current().normalizeCity(value),
    cityLabel: value => current().cityLabel(value),
    classifyMetroArea: value => current().classifyMetroArea(value),
    getEventMetroArea: value => current().getEventMetroArea(value),
    getUserCity: value => current().getUserCity(value),
  };
}
module.exports = { createCityContext };
