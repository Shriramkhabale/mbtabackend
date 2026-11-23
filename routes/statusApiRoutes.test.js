const test = require('node:test');
const assert = require('node:assert/strict');
const {
  STATUS_API_SERVICES,
  hasStatusApiPermission,
  validateParameters,
  redactProviderData,
  getAadhaarOtpToken,
  getProviderTimeout,
  isProviderTimeout
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
    redactProviderData({
      apiKey: 'secret-key',
      message: 'request secret-key',
      token: 'otp-session-token'
    }, 'secret-key'),
    { apiKey: '[redacted]', message: 'request [redacted]', token: '[redacted]' }
  );
});

test('exposes an OTP session token only for the Aadhaar OTP service', () => {
  const providerResponse = { token: 'otp-session-token' };
  assert.equal(
    getAadhaarOtpToken('aadhar_card_details_by_otp_api', providerResponse),
    'otp-session-token'
  );
  assert.equal(getAadhaarOtpToken('pro_pan_verification', providerResponse), undefined);
  assert.equal(
    getAadhaarOtpToken('aadhar_card_details_by_otp_api', { token: 123 }),
    undefined
  );
});

test('allows more time for Aadhaar OTP verification and identifies provider timeouts', () => {
  assert.equal(
    getProviderTimeout('aadhar_card_details_by_otp_api', { otp: '123456', token: 'session' }),
    45000
  );
  assert.equal(
    getProviderTimeout('aadhar_card_details_by_otp_api', { uidno: '123456789012' }),
    20000
  );
  assert.equal(
    getProviderTimeout('indiapost', { otp: '123456', token: 'session' }),
    20000
  );
  assert.equal(isProviderTimeout({ code: 'ECONNABORTED' }), true);
  assert.equal(isProviderTimeout({ code: 'ETIMEDOUT' }), true);
  assert.equal(isProviderTimeout({ code: 'ECONNREFUSED' }), false);
});
