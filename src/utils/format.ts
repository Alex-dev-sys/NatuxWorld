export function formatNumber(n: number): string {
  return new Intl.NumberFormat('ru-RU').format(n);
}

export function pluralize(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1];
  return forms[2];
}

export function formatUptime(days: number): string {
  return `${days} ${pluralize(days, ['день', 'дня', 'дней'])}`;
}
