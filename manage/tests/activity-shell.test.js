'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');

assert.match(html, /活動管理/);
assert.match(html, /data-area="planning"[^>]*>活動規劃</);
assert.match(html, /data-area="accounting"[^>]*>活動帳務</);
assert.match(html, /id="activitySelector"/);
assert.match(html, /id="areaFrame"/);
assert.match(html, /activity-manager\.js/);
assert.doesNotMatch(html, /data-area="[^\"]+"[^>]*>[^<]*(酒水盤點|核銷整理)/);
console.log('activity-shell tests PASS');
