const test = require('node:test');
const assert = require('node:assert/strict');
const {
  STATUS_API_SERVICES,
  hasStatusApiPermission,
  validateParameters,
  redactProviderData
} = require('./statusApiRoutes');

test('exposes only the seven requested DHBOSS Status APIs', () => {
  assert.deepEqual(Object.keys(STATUS_API_SERVICES), [
    'aadhar_card_details_by_otp_api',
    'advance_pan_verification',
    'offline_aadhar_kyc',
    'pan_link_status',
    'indiapost',
    'mobile_number_plans',
    'pro_pan_verification'
  ]);
});

test('requires explicit Status API access when dynamic menu permissions are granular', () => {
  assert.equal(hasStatusApiPermission(['dyn.statusApi']), true);
  assert.equal(hasStatusApiPermission(['dyn.servicesLink']), false);
  assert.equal(hasStatusApiPermission(['dynamicMenus']), true);
  assert.equal(hasStatusApiPermission(['none']), false);
});

test('validates parameters and prevents callers from supplying the provider key', () => {
  assert.equal(validateParameters({ uidno: '123456789012' }), '');
  assert.match(validateParameters({ apikeyfill: 'caller-value' }), /Do not include the provider API key/);
  assert.match(validateParameters({ uidno: { nested: true } }), /must be a string, number, or boolean/);
});

test('redacts API credentials from provider responses', () => {
  assert.deepEqual(
    redactProviderData({ apiKey: 'secret-key', message: 'request secret-key' }, 'secret-key'),
    { apiKey: '[redacted]', message: 'request [redacted]' }
  );
});
