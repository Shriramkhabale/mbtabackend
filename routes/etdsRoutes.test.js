const test = require('node:test');
const assert = require('node:assert/strict');
const { safeStatusFromPayload } = require('./etdsRoutes');

test('maps provider status code 0 to failed', () => {
  assert.equal(safeStatusFromPayload({ Status: 0 }), 'failed');
  assert.equal(safeStatusFromPayload({ Status: '0' }), 'failed');
});

test('maps provider status code 3 to success', () => {
  assert.equal(safeStatusFromPayload({ Status: 3 }), 'success');
  assert.equal(safeStatusFromPayload({ Status: '3' }), 'success');
});
