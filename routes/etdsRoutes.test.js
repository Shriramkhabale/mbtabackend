const test = require('node:test');
const assert = require('node:assert/strict');
const {
  safeStatusFromPayload,
  getProviderAcknowledgementNumber,
  getProviderFailureMessage
} = require('./etdsRoutes');

test('maps provider status code 0 to failed', () => {
  assert.equal(safeStatusFromPayload({ Status: 0 }), 'failed');
  assert.equal(safeStatusFromPayload({ Status: '0' }), 'failed');
});

test('maps provider status code 3 to success', () => {
  assert.equal(safeStatusFromPayload({ Status: 3 }), 'success');
  assert.equal(safeStatusFromPayload({ Status: '3' }), 'success');
});

test('maps ETDS TranStatus and extracts its NsdlAckNo field', () => {
  assert.equal(safeStatusFromPayload({ TranStatus: 0 }), 'failed');
  assert.equal(safeStatusFromPayload({ TranStatus: 3 }), 'success');
  assert.equal(
    getProviderAcknowledgementNumber({ TranStatus: 3, NsdlAckNo: '123456789012345' }),
    '123456789012345'
  );
});

test('normalizes provider status field names and reads nested terminal statuses', () => {
  assert.equal(safeStatusFromPayload({ response_code: '3' }), 'success');
  assert.equal(safeStatusFromPayload({ transaction: { application_status: 'Rejected' } }), 'failed');
  assert.equal(safeStatusFromPayload({ responseMessage: 'Request failed' }), 'failed');
  assert.equal(getProviderFailureMessage({ responseMessage: 'PAN correction failed.' }), 'PAN correction failed.');
});

test('extracts provider acknowledgment numbers from nested callback data', () => {
  assert.equal(
    getProviderAcknowledgementNumber({ response: { acknowledgement_number: 'PAN123456789' } }),
    'PAN123456789'
  );
  assert.equal(getProviderAcknowledgementNumber({ status: 'success' }), '');
});
