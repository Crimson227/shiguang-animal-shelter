const contactPhone = /^(?:(?:(?:\+86|0086)[ -]?)?1[3-9]\d(?:[ -]?\d{4}){2}|(?:0[1-9]\d{1,2}|(?:\+86|0086)[ -]?[1-9]\d{1,2})[ -]?\d{7,8})$/;

// Keep the standalone validation and the text redaction in sync. Bare 86 was also redacted by the AI assistant.
const contactPhoneInText = new RegExp(String.raw`(?<![\d+])(?:${contactPhone.source.slice(1,-1)}|861[3-9]\d{9})(?!\d)`,'g');

export function redactContactPhone(text) {
  return text.replace(contactPhoneInText,'[电话已省略]');
}

export function requireContactPhone(value) {
  const phone = typeof value === 'string' ? value.trim() : '';
  if (!contactPhone.test(phone)) {
    throw Object.assign(new Error('请输入有效的手机号或带区号的座机号码，例如 13800001234 或 0791-87654321'), {status:400});
  }
  return phone;
}
