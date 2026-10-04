const DEFAULTS = Object.freeze({
  invoicePrefix: 'TO', defaultGstBasisPoints: 0, nearExpiryWarningDays: 90,
  stockAlertThreshold: 0, defaultSaleUnit: 'product', defaultPaymentMethod: 'cash',
  receiptPrinterName: '', receiptPaperWidthMm: 80,
  backupScheduleTime: '22:00', backupRetentionDays: 30,
  closingVarianceToleranceMinor: 5000, sixMonthCycleStartMonth: 1,
  receiptProfile: {pharmacyName: 'TechOrbit Pharmacy POS', address: '', phone: '', taxRegistration: '', strn: '', footer: 'Thank you for your purchase'},
});
const LIMITS = {pharmacyName: 120, address: 240, phone: 40, taxRegistration: 40, strn: 40, footer: 240};
function read(db, key) {
  const row = db.prepare('SELECT value_json FROM Settings WHERE key=?').get(key);
  if (!row) return DEFAULTS[key];
  try {
    const value = JSON.parse(row.value_json);
    return key === 'receiptProfile' && value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(DEFAULTS.receiptProfile).map(([field, fallback]) => [field, value[field] == null ? fallback : value[field]])) : value;
  } catch { return DEFAULTS[key]; }
}
function current(db) {
  return Object.fromEntries(Object.keys(DEFAULTS).map(key => [key, read(db, key)]));
}
function validate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !Object.hasOwn(DEFAULTS,key))) throw Error('Invalid settings payload');
  const output = {};
  for (const [key, value] of Object.entries(input)) {
    if (key === 'receiptProfile') {
      if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(field => !Object.hasOwn(LIMITS,field))) throw Error('Invalid receipt profile');
      const profile = {};
      for (const [field, limit] of Object.entries(LIMITS)) {
        const text = value[field];
        if (typeof text !== 'string' || text.trim().length > limit || (field === 'pharmacyName' && !text.trim())) throw Error(`Invalid ${field} value`);
        profile[field] = text.trim();
      }
      output[key] = profile;
    } else if (key === 'invoicePrefix') {
      if (typeof value !== 'string' || !/^[A-Z][A-Z0-9-]{0,11}$/.test(value)) throw Error('Invoice prefix must be 1 to 12 uppercase letters, digits or hyphens');
      output[key] = value;
    } else if (['defaultGstBasisPoints', 'nearExpiryWarningDays', 'stockAlertThreshold', 'receiptPaperWidthMm', 'backupRetentionDays', 'closingVarianceToleranceMinor', 'sixMonthCycleStartMonth'].includes(key)) {
      const max = {defaultGstBasisPoints:10000, nearExpiryWarningDays:365, stockAlertThreshold:1000000, receiptPaperWidthMm:80, backupRetentionDays:365, closingVarianceToleranceMinor:1000000, sixMonthCycleStartMonth:12}[key];
      const min = key === 'receiptPaperWidthMm' ? 58 : ['backupRetentionDays','sixMonthCycleStartMonth'].includes(key) ? 1 : 0;
      if (!Number.isSafeInteger(value) || value < min || value > max || (key === 'receiptPaperWidthMm' && ![58,80].includes(value))) throw Error(`Invalid ${key} value`);
      output[key] = value;
    } else if (key === 'defaultSaleUnit') {
      if (!['product','base','strip','box'].includes(value)) throw Error('Choose a valid default sale unit');
      output[key] = value;
    } else if (key === 'defaultPaymentMethod') {
      if (!['cash','card','digital'].includes(value)) throw Error('Choose a valid default payment method');
      output[key] = value;
    } else if (key === 'receiptPrinterName') {
      if (typeof value !== 'string' || value.trim().length > 120) throw Error('Printer name must be 120 characters or fewer');
      output[key] = value.trim();
    } else if (key === 'backupScheduleTime') {
      if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw Error('Choose a valid backup time');
      output[key] = value;
    }
  }
  return output;
}
function save(db, input, actor) {
  const changes = validate(input);
  if (!Object.keys(changes).length) throw Error('No settings to save');
  const now = new Date().toISOString();
  db.transaction(() => {
    const update = db.prepare(`INSERT INTO Settings(key,value_json,updated_by,updated_at) VALUES(?,?,?,?)
      ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,updated_by=excluded.updated_by,updated_at=excluded.updated_at`);
    const audit = db.prepare(`INSERT INTO AuditLog(occurred_at,user_id,role_code,action,entity_type,entity_id,previous_json,new_json)
      VALUES(?,?,?,?,?,?,?,?)`);
    for (const [key, value] of Object.entries(changes)) {
      const previous = read(db, key);
      if (JSON.stringify(previous) === JSON.stringify(value)) continue;
      update.run(key, JSON.stringify(value), actor.id, now);
      audit.run(now, actor.id, actor.roleCode, 'settings.change', 'settings', key, JSON.stringify(previous), JSON.stringify(value));
    }
  })();
  return current(db);
}
module.exports = {current, read, save, validate};
