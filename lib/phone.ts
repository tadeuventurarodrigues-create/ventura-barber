export function onlyDigits(value: string) {
  return String(value || '').replace(/\D/g, '');
}

export function normalizePhone(value: string) {
  let digits = onlyDigits(value);

  if (!digits) return '';

  if (digits.startsWith('55')) {
    digits = digits.slice(2);
  }

  if (digits.length === 11 && digits[2] === '9') {
    digits = `${digits.slice(0, 2)}${digits.slice(3)}`;
  }

  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }

  return digits.startsWith('55') ? digits : `55${digits}`;
}