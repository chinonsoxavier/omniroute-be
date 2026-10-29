import { createHash, randomBytes, randomInt } from 'node:crypto';

export function randomToken(bytes = 48): string {
  return randomBytes(bytes).toString('base64url');
}

export function numericSuffix(min = 10000, max = 99999): string {
  return String(randomInt(min, max));
}

export function receiptNumber(): string {
  return `REC-${numericSuffix(100000, 999999)}`;
}

export function poNumber(): string {
  return `PO #${numericSuffix(1000, 9999)}`;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
