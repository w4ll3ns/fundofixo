// CNPJ mask: 00.000.000/0000-00
export function maskCNPJ(value: string): string {
  return value
    .replace(/\D/g, '')
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
    .slice(0, 18);
}

// Currency mask: R$ 0.000,00
export function maskCurrency(value: string): string {
  const numericValue = value.replace(/\D/g, '');
  const number = parseInt(numericValue || '0', 10) / 100;
  return number.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

// Parse currency back to number
export function parseCurrency(value: string): number {
  const numericValue = value.replace(/[^\d,]/g, '').replace(',', '.');
  return parseFloat(numericValue) || 0;
}

// Format number to currency display
export function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

// Format date to Brazilian format
export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('pt-BR');
}

// Format datetime to Brazilian format
export function formatDateTime(date: string | Date): string {
  return new Date(date).toLocaleString('pt-BR');
}

// Validate CNPJ
export function validateCNPJ(cnpj: string): boolean {
  cnpj = cnpj.replace(/\D/g, '');
  
  if (cnpj.length !== 14) return false;
  
  // Check for known invalid patterns
  if (/^(\d)\1+$/.test(cnpj)) return false;
  
  // Validate check digits
  let size = cnpj.length - 2;
  let numbers = cnpj.substring(0, size);
  const digits = cnpj.substring(size);
  let sum = 0;
  let pos = size - 7;
  
  for (let i = size; i >= 1; i--) {
    sum += parseInt(numbers.charAt(size - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  
  let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(0))) return false;
  
  size = size + 1;
  numbers = cnpj.substring(0, size);
  sum = 0;
  pos = size - 7;
  
  for (let i = size; i >= 1; i--) {
    sum += parseInt(numbers.charAt(size - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  
  result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(1))) return false;
  
  return true;
}
