(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = require('./activity-app.js');
  if (root) root.ActivityManager = api;
})(typeof window !== 'undefined' ? window : null, function (root) {
  'use strict';
  return root && root.EventActivityApp ? root.EventActivityApp : {};
});
