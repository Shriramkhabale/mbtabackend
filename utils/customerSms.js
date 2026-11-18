/**
 * Customer OTP SMS Dispatcher
 * Leverages the existing Dove SMS Gateway (Expertskill Technology)
 */

async function sendCustomerOtpSms(mobile, otp) {
  const cleanMobile = String(mobile || '').trim().replace(/^\+91/, '').replace(/^0/, '');
  if (!cleanMobile || cleanMobile.length !== 10) {
    return { success: false, error: 'Invalid 10-digit mobile number.' };
  }

  const username = process.env.DOVE_SMS_USER || 'Experts';
  const authkey = process.env.DOVE_SMS_KEY || 'ba9dcdcdfcXX';
  const senderId = process.env.DOVE_SMS_SENDER_ID || 'EXTSKL';
  const accusage = '1';
  const message = encodeURIComponent(`Your Verification Code for login is ${otp}. - Expertskill Technology.`);
  const url = `https://mobicomm.dove-sms.com//submitsms.jsp?user=${username}&key=${authkey}&mobile=+91${cleanMobile}&message=${message}&accusage=${accusage}&senderid=${senderId}`;

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const text = await response.text();
    const isSuccess = text && text.toLowerCase().includes('success');
    return {
      success: isSuccess,
      rawResponse: text,
      error: isSuccess ? null : text
    };
  } catch (err) {
    console.error('Dove SMS API Error:', err.message);
    return {
      success: false,
      error: err.message
    };
  }
}

module.exports = {
  sendCustomerOtpSms
};
