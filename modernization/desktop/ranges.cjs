// All business dates use Pakistan civil time, independent of the workstation timezone.
const dayKey = (date) =>
  new Date(new Date(date).getTime() + 5 * 3600000).toISOString().slice(0, 10);
function validDate(value) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value || "") ||
    new Date(value + "T00:00:00Z").toISOString().slice(0, 10) !== value
  )
    throw Error("Invalid date");
  return value;
}
function addDays(value, days) {
  const date = new Date(value + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function subtractMonths(value, count) {
  const date = new Date(value + "T00:00:00Z"),
    day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - count);
  const last = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return date.toISOString().slice(0, 10);
}
function rangeFor(input = {}, now = new Date()) {
  const today = dayKey(now),
    range = input.range || "7d";
  let from,
    to = today;
  if (range === "7d") from = addDays(today, -6);
  else if (["1m", "6m", "1y"].includes(range))
    from = addDays(
      subtractMonths(today, { "1m": 1, "6m": 6, "1y": 12 }[range]),
      1,
    );
  else if (range === "custom") {
    from = validDate(input.from);
    to = validDate(input.to);
  } else throw Error("Unknown chart range");
  if (
    from > to ||
    to > today ||
    (new Date(to) - new Date(from)) / 86400000 > 1096
  )
    throw Error(
      "Choose a valid range of up to three years, ending no later than today",
    );
  const monthly =
    ["6m", "1y"].includes(range) ||
    (new Date(to) - new Date(from)) / 86400000 > 62;
  const keys = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const key = monthly ? date.slice(0, 7) : date;
    if (keys.at(-1) !== key) keys.push(key);
  }
  return {
    range,
    from,
    to,
    monthly,
    keys,
    start: new Date(from + "T00:00:00+05:00").toISOString(),
    end: new Date(addDays(to, 1) + "T00:00:00+05:00").toISOString(),
  };
}
module.exports = { dayKey, addDays, rangeFor };
