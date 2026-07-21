import * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function parseIso(value: string): { month: string; day: string; year: string } {
  if (!value || value.length !== 10) return { month: '', day: '', year: '' };
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return { month: '', day: '', year: '' };
  return { month, day, year };
}

function daysInMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate();
}

function toIso(month: string, day: string, year: string): string | null {
  if (!month || !day || !year) return null;
  const m = parseInt(month, 10);
  const d = parseInt(day, 10);
  const y = parseInt(year, 10);
  if (Number.isNaN(m) || Number.isNaN(d) || Number.isNaN(y)) return null;
  if (m < 1 || m > 12 || y < 1 || d < 1) return null;
  if (d > daysInMonth(m, y)) return null;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

interface DobPickerProps {
  value: string;
  onChange: (isoDate: string) => void;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  yearFrom?: number;
  yearTo?: number;
}

export function DobPicker({
  value,
  onChange,
  className,
  disabled,
  placeholder = 'Select',
  yearFrom = 1900,
  yearTo = new Date().getFullYear(),
}: DobPickerProps) {
  const { month: initialMonth, day: initialDay, year: initialYear } = parseIso(value);
  const [month, setMonth] = useState(initialMonth);
  const [day, setDay] = useState(initialDay);
  const [year, setYear] = useState(initialYear);

  const years = useMemo(() => {
    const list: number[] = [];
    for (let y = yearTo; y >= yearFrom; y--) list.push(y);
    return list;
  }, [yearFrom, yearTo]);

  // Sync external value changes without overwriting partial edits
  useEffect(() => {
    const { month: nextMonth, day: nextDay, year: nextYear } = parseIso(value);
    if (toIso(month, day, year) !== value) {
      setMonth(nextMonth);
      setDay(nextDay);
      setYear(nextYear);
    }
  }, [value]);

  const handleChange = (next: { month?: string; day?: string; year?: string }) => {
    const nextMonth = next.month ?? month;
    const nextDay = next.day ?? day;
    const nextYear = next.year ?? year;
    setMonth(nextMonth);
    setDay(nextDay);
    setYear(nextYear);

    const iso = toIso(nextMonth, nextDay, nextYear);
    if (iso) {
      onChange(iso);
    } else if (nextMonth === '' || nextDay === '' || nextYear === '') {
      onChange('');
    }
  };

  return (
    <div className={cn('grid grid-cols-3 gap-2', className)}>
      <Select
        value={month}
        onValueChange={v => handleChange({ month: v })}
        disabled={disabled}
      >
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {MONTH_NAMES.map((name, index) => (
            <SelectItem key={name} value={String(index + 1).padStart(2, '0')}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={day}
        onValueChange={v => handleChange({ day: v })}
        disabled={disabled}
      >
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {Array.from({ length: 31 }, (_, i) => {
            const d = String(i + 1).padStart(2, '0');
            return (
              <SelectItem key={d} value={d}>
                {i + 1}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>

      <Select
        value={year}
        onValueChange={v => handleChange({ year: v })}
        disabled={disabled}
      >
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {years.map(y => (
            <SelectItem key={y} value={String(y)}>
              {y}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
