const htmlEntities = { "&#x2F;": "/", "&#47;": "/", "&sol;": "/" };

function decodeLegacyText(value) {
  return String(value ?? "").replace(/&#x2F;|&#47;|&sol;/gi, (match) => htmlEntities[match] || "/");
}

function normalizeExpiry(value) {
  if (!value) return null;
  const text = decodeLegacyText(value).trim();
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const result = `${match[1]}-${match[2]}-${match[3]}`;
    return isValidDate(result) ? result : null;
  }
  match = text.match(/^(0[1-9]|1[0-2])\/(\d{4})$/);
  if (match) {
    const lastDay = new Date(Date.UTC(Number(match[2]), Number(match[1]), 0)).getUTCDate();
    return `${match[2]}-${match[1]}-${String(lastDay).padStart(2, "0")}`;
  }
  match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const result = `${match[3]}-${match[2]}-${match[1]}`;
  return isValidDate(result) ? result : null;
}

function isValidDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function roundPayableToRupee(minor) {
  if (!Number.isInteger(minor)) throw new Error("Money must be integer minor units");
  return Math.round(minor / 100) * 100;
}

module.exports = { decodeLegacyText, normalizeExpiry, roundPayableToRupee };
