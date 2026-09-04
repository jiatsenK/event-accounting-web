'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const elements = {
  '#vendorRows': { innerHTML: '' },
  '#vendorStatus': { textContent: '', className: '' },
  '#vendorSearch': { value: '' }
};
const context = {
  console,
  window: {},
  document: { querySelector: selector => elements[selector] || null },
  Intl,
  URLSearchParams,
  setTimeout,
  clearTimeout
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(__dirname + '/../app-core.js', 'utf8'), context);

assert.equal(context.safeExternalUrl('javascript:alert(1)'), '');
assert.equal(context.safeExternalUrl('https://drive.google.com/file/example'), 'https://drive.google.com/file/example');
vm.runInContext(`
  state.vendors = [
    { vendor_key: '42498380', name: '餵食甜點工作室', tax_id: '42498380', remittance_status: '使用中', agreement_url: 'https://drive.google.com/file/example', quote_url: '', updated_at: '2026-09-01' },
    { vendor_key: 'retail', name: '零售店', tax_id: '', remittance_status: '', agreement_url: 'javascript:alert(1)', quote_url: '', updated_at: '' }
  ];
  renderVendors('42498380');
`, context);
assert.match(elements['#vendorRows'].innerHTML, /餵食甜點工作室/);
assert.match(elements['#vendorRows'].innerHTML, /使用中/);
assert.match(elements['#vendorRows'].innerHTML, /target="_blank" rel="noopener noreferrer"/);
assert.doesNotMatch(elements['#vendorRows'].innerHTML, /零售店/);
assert.equal(elements['#vendorStatus'].textContent, '找到 1 筆');

vm.runInContext(`renderVendors('零售店');`, context);
assert.match(elements['#vendorRows'].innerHTML, /零售／單次/);
assert.doesNotMatch(elements['#vendorRows'].innerHTML, /javascript:/);

console.log('vendor master UI tests PASS');
