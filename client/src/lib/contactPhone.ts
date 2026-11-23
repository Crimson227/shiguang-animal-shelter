const contactPhone = /^(?:(?:(?:\+86|0086)[ -]?)?1[3-9]\d(?:[ -]?\d{4}){2}|(?:0[1-9]\d{1,2}|(?:\+86|0086)[ -]?[1-9]\d{1,2})[ -]?\d{7,8})$/

export const contactPhoneHint = '请输入手机号或带区号的座机，例如 13800001234 或 0791-87654321'
export const isContactPhone = (value: unknown) => typeof value === 'string' && contactPhone.test(value.trim())
