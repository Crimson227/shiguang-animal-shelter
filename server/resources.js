import { isDateOnly, localDate } from './dates.js';
import { requireContactPhone } from './contact-phone.js';

export const resources = {
  __proto__: null,
  animals: { table: 'Animals', keys: ['animalID'], fields: ['species', 'animalName', 'age', 'gender', 'breed', 'size', 'pictureURL', 'intakeDate', 'description', 'healthStatus', 'healthNotes'], required: ['species', 'animalName', 'age'] },
  patrons: { table: 'Patrons', keys: ['patronID'], fields: ['firstName', 'lastName', 'phoneNumber', 'address'], required: ['firstName', 'lastName', 'phoneNumber'] },
  preferences: { table: 'PatronPreferences', keys: ['preferenceID'], fields: ['patronID', 'preferredSpecies', 'preferredSize', 'minAge', 'maxAge', 'acceptsSpecialCare'], required: ['patronID'] },
  vaccines: { table: 'Vaccines', keys: ['vaccineID'], fields: ['name', 'doses', 'species'], required: ['name', 'doses'] },
  vaccinations: { table: 'VaccinationEvents', keys: ['vaccinationID'], fields: ['animalID', 'vaccineName', 'vaccineID', 'dateGiven', 'dateExpires', 'batchNumber', 'notes'], required: ['animalID', 'vaccineName', 'dateGiven'] },
  prescriptions: { table: 'PrescriptionCourses', keys: ['prescriptionID'], fields: ['animalID', 'visitID', 'prescribedAt', 'name', 'frequency', 'dosage', 'durationDays', 'notes'], required: ['animalID', 'prescribedAt', 'name'] },
  medical: { table: 'MedicalVisits', keys: ['visitID'], fields: ['animalID', 'visitDate', 'visitType', 'symptoms', 'diagnosis', 'treatment', 'medication', 'veterinarian', 'nextVisitDate'], required: ['animalID', 'visitDate', 'visitType', 'diagnosis'] },
  placements: { table: 'FostersAndAdoptions', keys: ['animalID'], fields: ['animalID', 'patronID', 'fosteredOrAdopted', 'date'], required: ['animalID', 'patronID', 'fosteredOrAdopted', 'date'] },
  adoptable: { table: 'Adoptable', keys: ['animalID'], fields: ['animalID', 'restrictions'], required: ['animalID'] },
  donations: { table: 'Donations', keys: ['donationID'], fields: ['patronID', 'amount', 'donationDate', 'note'], required: ['patronID', 'amount', 'donationDate'] },
  inventory: { table: 'Inventory', keys: ['itemID'], fields: ['itemName', 'category', 'quantity', 'unit'], required: ['itemName', 'quantity'] },
};

export function cleanData(resource, input = {}, editing = false) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw Object.assign(new Error('记录内容格式不正确'), { status: 400 });
  }
  const data = {};
  for (const field of resource.fields) {
    if (editing && resource.keys.includes(field)) continue;
    if (Object.prototype.hasOwnProperty.call(input, field)) {
      data[field] = input[field] === '' ? null : input[field];
    }
  }
  if (resource.table === 'Patrons' && (!editing || Object.hasOwn(data,'phoneNumber'))) {
    data.phoneNumber = requireContactPhone(data.phoneNumber);
  }
  for (const field of resource.required) {
    if ((!editing || Object.hasOwn(data,field)) && (data[field] == null || (typeof data[field] === 'string' && !data[field].trim()))) {
      throw Object.assign(new Error(`${field} 为必填项`), { status: 400 });
    }
  }
  if (resource.table === 'Inventory' && data.quantity != null) data.quantity = stockQuantity(data.quantity, '库存数量');
  if (resource.table === 'Vaccines' && data.doses != null) data.doses = stockQuantity(data.doses, '库存剂量');
  if (resource.table === 'PrescriptionCourses' && data.durationDays != null && (!Number.isSafeInteger(Number(data.durationDays)) || Number(data.durationDays) < 1)) throw Object.assign(new Error('疗程天数必须是正整数'), {status:400});
  if (resource.table === 'Donations' && Object.hasOwn(data,'amount')) {
    const amount = typeof data.amount === 'number' || typeof data.amount === 'string' ? String(data.amount).trim() : '';
    if (!/^\d+(?:\.\d{1,2})?$/.test(amount) || Number(amount) < 0.01 || Number(amount) > 99999999.99) {
      throw Object.assign(new Error('捐赠金额须在 0.01 到 99,999,999.99 元之间，最多两位小数'), { status: 400 });
    }
    data.amount = amount;
  }
  if (resource.table === 'Animals' && data.age != null && (!Number.isInteger(Number(data.age)) || Number(data.age) < 0 || Number(data.age) > 50)) throw Object.assign(new Error('动物年龄应为 0 到 50 岁'), {status:400});
  const dateLabels = {intakeDate:'入所日期',visitDate:'就诊日期',nextVisitDate:'复诊日期',dateGiven:'接种日期',dateExpires:'有效期',donationDate:'捐赠日期',prescribedAt:'开方日期'};
  for (const [field,label] of Object.entries(dateLabels)) {
    if (data[field] != null && !isDateOnly(data[field])) throw Object.assign(new Error(`${label}无效`), {status:400});
  }
  if (resource.table === 'Animals' && Object.hasOwn(data,'healthStatus') && !['待评估','健康','需观察','治疗中'].includes(data.healthStatus)) {
    throw Object.assign(new Error('请选择有效的健康状态'), { status: 400 });
  }
  if (resource.table === 'Animals' && !editing && data.healthStatus && data.healthStatus!=='待评估' && !String(data.healthNotes||'').trim()) throw Object.assign(new Error('请填写健康评估依据'), {status:400});
  if (resource.table === 'MedicalVisits' && data.diagnosis && String(data.diagnosis).length > 255) {
    throw Object.assign(new Error('诊疗结论不能超过 255 字'), { status: 400 });
  }
  if (resource.table === 'PatronPreferences' && Object.hasOwn(data,'acceptsSpecialCare')) {
    if (![null,0,1,'0','1',false,true].includes(data.acceptsSpecialCare)) {
      throw Object.assign(new Error('请选择是否可照护特殊需求'), { status: 400 });
    }
    data.acceptsSpecialCare = Number(data.acceptsSpecialCare);
  }
  return data;
}

const maxStock = 2147483647;
export const unrecordedOpeningReason = '期初库存未录入，请盘点核对';

export function stockQuantity(value, label, min = 0) {
  const quantity = typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value.trim())) ? Number(value) : NaN;
  if (!Number.isInteger(quantity) || quantity < min || quantity > maxStock) {
    throw Object.assign(new Error(`${label}必须是 ${min} 到 ${maxStock} 之间的整数`), { status: 400 });
  }
  return quantity;
}

export function validatePreferenceAges({ minAge, maxAge }) {
  const invalid = value => value != null && (
    (typeof value !== 'number' && !(typeof value === 'string' && /^\d+$/.test(value.trim()))) ||
    !Number.isInteger(Number(value)) || Number(value) < 0 || Number(value) > 50
  );
  if (invalid(minAge) || invalid(maxAge) || (minAge != null && maxAge != null && Number(minAge) > Number(maxAge))) {
    throw Object.assign(new Error('年龄偏好须在 0 到 50 岁之间，最小年龄不能大于最大年龄'), { status: 400 });
  }
}

export function validateCareDates(resource, data) {
  const actualDate = {MedicalVisits:['visitDate','就诊日期'],VaccinationEvents:['dateGiven','接种日期'],PrescriptionCourses:['prescribedAt','开方日期']}[resource.table];
  if (!actualDate) return;
  const [field,label] = actualDate;
  if (data[field] && data[field] > localDate()) throw Object.assign(new Error(`${label}不能晚于今天`), {status:400});
  if (resource.table === 'MedicalVisits' && data.nextVisitDate && data.nextVisitDate < data.visitDate) {
    throw Object.assign(new Error('复诊日期不能早于就诊日期'), {status:400});
  }
  if (resource.table === 'VaccinationEvents' && data.dateExpires && data.dateExpires < data.dateGiven) {
    throw Object.assign(new Error('有效期不能早于接种日期'), {status:400});
  }
}

export function keyClause(resource, key = {}) {
  const values = resource.keys.map((field) => key?.[field]);
  if (values.some(value => (typeof value !== 'number' && !(typeof value === 'string' && /^\d+$/.test(value))) ||
    !Number.isSafeInteger(Number(value)) || Number(value) < 1)) {
    throw Object.assign(new Error('记录编号无效'), { status: 400 });
  }
  return {
    sql: resource.keys.map((field) => `\`${field}\` = ?`).join(' AND '),
    values,
  };
}
