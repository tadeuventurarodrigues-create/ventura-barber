export function formatCurrency(value: number | string | null | undefined) {
  const amount = Number(value || 0);
  return amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatDateBR(date: string) {
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y}`;
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
