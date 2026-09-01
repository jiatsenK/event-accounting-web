(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.EventAccountingDrinkInventoryUI = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  return Object.freeze({ enabled: false, owner: 'planning' });
});
