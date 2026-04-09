import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, X } from 'lucide-react';
import { isWithinInterval, parseISO } from 'date-fns';
import { enUS, zhCN } from 'date-fns/locale';
import type { DateRange as ReactDayPickerDateRange } from 'react-day-picker';
import { useI18n } from '@/context/I18nContext';

export interface DateRange {
  from: Date | undefined;
  to: Date | undefined;
}

interface DateRangeFilterProps {
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
  placeholder?: string;
  className?: string;
  showClearButton?: boolean;
}

export const DateRangeFilter: React.FC<DateRangeFilterProps> = ({
  dateRange,
  onDateRangeChange,
  placeholder = "",
  className = "",
  showClearButton = true,
}) => {
  const { t, language } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const locale = language === 'zh-CN' ? zhCN : enUS;

  const formatShortDate = (date: Date) =>
    date.toLocaleDateString(language === 'zh-CN' ? 'zh-CN' : 'en-US', {
      month: 'short',
      day: 'numeric',
    });

  const formatLongDate = (date: Date) =>
    date.toLocaleDateString(language === 'zh-CN' ? 'zh-CN' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

  const handleDateSelect = (range: ReactDayPickerDateRange | undefined) => {
    console.log('Date selection:', range); // Debug log
    
    // Convert ReactDayPickerDateRange to our DateRange interface
    const convertedRange: DateRange = {
      from: range?.from,
      to: range?.to
    };
    
    if (convertedRange.from && convertedRange.to) {
      console.log('Both dates selected, closing popover');
      onDateRangeChange(convertedRange);
      setIsOpen(false);
    } else if (convertedRange.from) {
      console.log('Only start date selected, keeping popover open');
      onDateRangeChange({ from: convertedRange.from, to: undefined });
    } else {
      console.log('No valid selection');
    }
  };

  const handleClear = () => {
    onDateRangeChange({ from: undefined, to: undefined });
  };

  const resolvedPlaceholder = placeholder || t('daterange.placeholder');
  const displayText = dateRange.from && dateRange.to
    ? `${formatShortDate(dateRange.from)} -> ${formatLongDate(dateRange.to)}`
    : resolvedPlaceholder;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="min-w-[200px] justify-start text-left font-normal"
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            <span className="truncate">{displayText}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 z-50" align="start" side="bottom" sideOffset={4}>
          <div className="p-3">
            <div className="mb-3 text-sm text-muted-foreground text-center">
              {dateRange.from && !dateRange.to 
                ? t('daterange.selectEnd', { date: formatShortDate(dateRange.from) })
                : t('daterange.selectRange')
              }
            </div>
            <Calendar
              initialFocus
              mode="range"
              defaultMonth={dateRange.from || new Date()}
              selected={dateRange as ReactDayPickerDateRange}
              onSelect={handleDateSelect}
              numberOfMonths={2}
              className="rounded-md border"
              disabled={(date) => date > new Date()}
              locale={locale}
            />
          </div>
        </PopoverContent>
      </Popover>
      
      {showClearButton && dateRange.from && dateRange.to && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClear}
          className="h-8 w-8 p-0"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
};

// Utility function to filter data by date range
export const filterByDateRange = <T extends { date: string }>(
  data: T[],
  dateRange: DateRange
): T[] => {
  if (!dateRange.from || !dateRange.to) {
    return data;
  }

  return data.filter(item => {
    const itemDate = parseISO(item.date);
    return isWithinInterval(itemDate, { start: dateRange.from!, end: dateRange.to! });
  });
};
