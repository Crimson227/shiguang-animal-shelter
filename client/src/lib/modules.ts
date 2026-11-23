export type Field = {
  key: string
  label: string
  type?: 'text' | 'tel' | 'number' | 'date' | 'url' | 'textarea' | 'select'
  options?: { value: string; label: string }[]
  source?: 'animals' | 'patrons' | 'vaccines' | 'medicalVisits'
  required?: boolean
  readOnlyOnEdit?: boolean
}

export type Module = {
  id: string
  title: string
  subtitle: string
  singular: string
  keys: string[]
  columns: string[]
  fields: Field[]
}

const species = [{ value: 'Canine', label: '犬' }, { value: 'Feline', label: '猫' }]
const sizes = ['小型', '中型', '大型'].map(value => ({ value, label: value }))
const genders = [{ value: 'M', label: '公' }, { value: 'F', label: '母' }]

export const modules: Module[] = [
  {
    id: 'animals', title: '动物档案', subtitle: '记录每一只动物的基础资料与收容状态', singular: '动物', keys: ['animalID'],
    columns: ['animalName', 'species', 'breed', 'age', 'size', 'healthStatus', 'status'],
    fields: [
      { key: 'animalName', label: '动物名称', required: true },
      { key: 'species', label: '种类', type: 'select', options: species, required: true },
      { key: 'breed', label: '品种' },
      { key: 'age', label: '年龄', type: 'number', required: true },
      { key: 'gender', label: '性别', type: 'select', options: genders },
      { key: 'size', label: '体型', type: 'select', options: sizes },
      { key: 'intakeDate', label: '入所日期', type: 'date' },
      { key: 'description', label: '档案描述', type: 'textarea' },
      { key: 'healthStatus', label: '健康状态', type: 'select', options: ['待评估', '健康', '需观察', '治疗中'].map(value => ({ value, label: value })) },
      { key: 'healthNotes', label: '健康备注', type: 'textarea' },
      { key: 'pictureURL', label: '照片路径或链接' },
    ],
  },
  {
    id: 'adoptable', title: '待领养名单', subtitle: '管理可对外展示的动物及领养限制', singular: '待领养记录', keys: ['animalID'],
    columns: ['animalID', 'restrictions'],
    fields: [
      { key: 'animalID', label: '动物', type: 'select', source: 'animals', required: true, readOnlyOnEdit: true },
      { key: 'restrictions', label: '领养说明与限制', type: 'textarea' },
    ],
  },
  {
    id: 'patrons', title: '领养人档案', subtitle: '维护联系人资料与捐赠等级', singular: '领养人', keys: ['patronID'],
    columns: ['patronID', 'lastName', 'firstName', 'phoneNumber', 'address', 'totalDonated', 'patronLevel'],
    fields: [
      { key: 'lastName', label: '姓', required: true },
      { key: 'firstName', label: '名', required: true },
      { key: 'phoneNumber', label: '联系电话', type: 'tel', required: true },
      { key: 'address', label: '地址' },
    ],
  },
  {
    id: 'preferences', title: '领养偏好', subtitle: '记录领养人期望的动物条件，用于匹配推荐', singular: '偏好', keys: ['preferenceID'],
    columns: ['patronID', 'preferredSpecies', 'preferredSize', 'minAge', 'maxAge'],
    fields: [
      { key: 'patronID', label: '领养人', type: 'select', source: 'patrons', required: true, readOnlyOnEdit: true },
      { key: 'preferredSpecies', label: '期望种类', type: 'select', options: species },
      { key: 'preferredSize', label: '期望体型', type: 'select', options: sizes },
      { key: 'minAge', label: '最小年龄', type: 'number' },
      { key: 'maxAge', label: '最大年龄', type: 'number' },
      { key: 'acceptsSpecialCare', label: '可照护特殊需求', type: 'select', options: [{ value: '0', label: '否' }, { value: '1', label: '是' }] },
    ],
  },
  {
    id: 'placements', title: '领养办理记录', subtitle: '查看正式领养办理记录；寄养在独立页面管理', singular: '领养办理记录', keys: ['animalID'],
    columns: ['animalID', 'patronID', 'fosteredOrAdopted', 'date'],
    fields: [
      { key: 'animalID', label: '动物', type: 'select', source: 'animals', required: true, readOnlyOnEdit: true },
      { key: 'patronID', label: '办理人', type: 'select', source: 'patrons', required: true },
      { key: 'fosteredOrAdopted', label: '办理类型', type: 'select', options: [{ value: 'A', label: '领养' }], required: true },
      { key: 'date', label: '办理日期', type: 'date', required: true },
    ],
  },
  {
    id: 'vaccines', title: '疫苗目录', subtitle: '维护疫苗与库存；登记接种后自动扣减一剂', singular: '疫苗', keys: ['vaccineID'],
    columns: ['name', 'species', 'doses'],
    fields: [
      { key: 'name', label: '疫苗名称', required: true },
      { key: 'species', label: '适用动物', type: 'select', options: [{ value: 'D', label: '犬' }, { value: 'C', label: '猫' }] },
      { key: 'doses', label: '库存剂量', type: 'number', required: true },
    ],
  },
  {
    id: 'vaccinations', title: '接种记录', subtitle: '按动物查看每次疫苗接种与有效期', singular: '接种记录', keys: ['vaccinationID'],
    columns: ['animalID', 'vaccineName', 'dateGiven', 'dateExpires'],
    fields: [
      { key: 'animalID', label: '动物', type: 'select', source: 'animals', required: true, readOnlyOnEdit: true },
      { key: 'vaccineName', label: '疫苗名称', type: 'select', source: 'vaccines', required: true, readOnlyOnEdit: true },
      { key: 'dateGiven', label: '接种日期', type: 'date', required: true },
      { key: 'dateExpires', label: '有效期至', type: 'date' },
      { key: 'batchNumber', label: '疫苗批次' },
      { key: 'notes', label: '接种备注', type: 'textarea' },
    ],
  },
  {
    id: 'prescriptions', title: '处方记录', subtitle: '按日期记录用药疗程，可关联诊疗记录', singular: '处方', keys: ['prescriptionID'],
    columns: ['animalID', 'prescribedAt', 'name', 'frequency', 'dosage', 'durationDays', 'visitID'],
    fields: [
      { key: 'animalID', label: '动物', type: 'select', source: 'animals', required: true, readOnlyOnEdit: true },
      { key: 'prescribedAt', label: '开方日期', type: 'date', required: true },
      { key: 'visitID', label: '关联诊疗', type: 'select', source: 'medicalVisits' },
      { key: 'name', label: '药品名称', required: true },
      { key: 'frequency', label: '用药频率' },
      { key: 'dosage', label: '每次用量' },
      { key: 'durationDays', label: '疗程天数', type: 'number' },
      { key: 'notes', label: '用药说明', type: 'textarea' },
    ],
  },
  {
    id: 'medical', title: '诊疗记录', subtitle: '记录就诊、诊断、处理及复诊计划', singular: '诊疗记录', keys: ['visitID'],
    columns: ['animalID', 'visitDate', 'visitType', 'diagnosis', 'veterinarian', 'nextVisitDate'],
    fields: [
      { key: 'animalID', label: '动物', type: 'select', source: 'animals', required: true },
      { key: 'visitDate', label: '就诊日期', type: 'date', required: true },
      { key: 'visitType', label: '诊疗类型', type: 'select', options: ['常规检查', '疾病诊疗', '复诊', '手术', '其他'].map(value => ({ value, label: value })), required: true },
      { key: 'symptoms', label: '症状', type: 'textarea' },
      { key: 'diagnosis', label: '诊疗结论', required: true },
      { key: 'treatment', label: '处理方案', type: 'textarea' },
      { key: 'medication', label: '本次用药说明', type: 'textarea' },
      { key: 'veterinarian', label: '接诊人员' },
      { key: 'nextVisitDate', label: '计划复诊日期', type: 'date' },
    ],
  },
  {
    id: 'donations', title: '捐赠记录', subtitle: '登记爱心捐赠，汇总到领养人档案', singular: '捐赠', keys: ['donationID'],
    columns: ['donationID', 'patronID', 'amount', 'donationDate', 'status', 'note'],
    fields: [
      { key: 'patronID', label: '捐赠人', type: 'select', source: 'patrons', required: true },
      { key: 'amount', label: '金额（元）', type: 'number', required: true },
      { key: 'donationDate', label: '捐赠日期', type: 'date', required: true },
      { key: 'note', label: '备注', type: 'textarea' },
    ],
  },
  {
    id: 'inventory', title: '物资库存', subtitle: '查看和维护收容所的日常物资', singular: '物资', keys: ['itemID'],
    columns: ['itemName', 'category', 'quantity', 'unit'],
    fields: [
      { key: 'itemName', label: '物资名称', required: true },
      { key: 'category', label: '分类', type: 'select', options: ['食物', '医疗', '清洁', '其他'].map(value => ({ value, label: value })) },
      { key: 'quantity', label: '当前数量', type: 'number', required: true, readOnlyOnEdit: true },
      { key: 'unit', label: '单位' },
    ],
  },
]

export const moduleById = Object.fromEntries(modules.map(item => [item.id, item])) as Record<string, Module>

export const labels: Record<string, string> = {
  animalID: '动物', animalName: '名称', patronID: '领养人', donationID: '编号', itemID: '编号', vaccineID: '编号',
  species: '种类', breed: '品种', age: '年龄', size: '体型', gender: '性别', status: '状态',
  firstName: '名', lastName: '姓', phoneNumber: '联系电话', address: '地址', totalDonated: '累计捐赠', patronLevel: '等级',
  preferredSpecies: '期望种类', preferredSize: '期望体型', minAge: '最小年龄', maxAge: '最大年龄',
  fosteredOrAdopted: '类型', date: '办理日期', name: '名称', doses: '剂量', vaccineName: '疫苗',
  dateGiven: '接种日期', dateExpires: '有效期至', prescribedAt: '开方日期', visitID: '关联诊疗', dosage: '每次用量', durationDays: '疗程天数', frequency: '用药频率', amount: '金额', donationDate: '捐赠日期', note: '备注',
  itemName: '物资名称', category: '分类', quantity: '数量', unit: '单位', restrictions: '说明与限制',
  healthStatus: '健康状态', healthNotes: '健康备注', acceptsSpecialCare: '可照护特殊需求',
  visitDate: '就诊日期', visitType: '诊疗类型', diagnosis: '诊疗结论', treatment: '处理方案', veterinarian: '接诊人员', nextVisitDate: '计划复诊',
  matchScore: '匹配分数', matchReason: '匹配原因',
}
