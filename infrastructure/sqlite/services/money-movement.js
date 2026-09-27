function recordMoneyMovement(db, movement) {
  const rawAt = movement.occurredAt;
  if (!rawAt || Number.isNaN(Date.parse(rawAt))) throw new Error('Money movement needs a valid date');
  const at = new Date(rawAt).toISOString();
  const userId = movement.userId || null;
  const deviceId = movement.deviceId || null;
  let shiftId = null;
  if (userId && deviceId) {
    const matches = db.prepare(`SELECT id,status FROM CashShifts
      WHERE user_id=? AND device_id=? AND julianday(opened_at)<=julianday(?)
        AND (status='open' OR julianday(closed_at)>julianday(?)) LIMIT 2`).all(userId, deviceId, at, at);
    if (matches.length > 1) throw new Error('Overlapping shifts need reconciliation before posting money');
    if (matches[0]?.status === 'closed') throw new Error('Closed shift cannot accept backdated money');
    shiftId = matches[0]?.id || null;
  }
  return db.prepare(`INSERT INTO MoneyMovements
    (direction,method,amount_minor,reference_type,reference_id,occurred_at,user_id,note,device_id,shift_id)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
    movement.direction, movement.method, movement.amountMinor, movement.referenceType,
    String(movement.referenceId), at, userId, movement.note || null, deviceId, shiftId,
  );
}
module.exports = { recordMoneyMovement };
