import { Between } from 'typeorm';
import { z } from 'zod';

export const AfterDate = (date: Date) => {
  const endDate = new Date(date.getTime());
  endDate.setFullYear(endDate.getFullYear() + 100);
  return Between(date, endDate);
};

// Calendar date, padded to YYYY-MM-DD; date pickers drop leading zeros
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{1,2}-\d{1,2}$/)
  .transform((value) => {
    const [year, month, day] = value.split('-');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  });
