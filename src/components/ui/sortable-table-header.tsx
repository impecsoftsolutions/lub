import React from 'react';
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SortableHeaderDirection = 'asc' | 'desc' | null;

interface SortableTableHeaderProps {
  /** Header text or markup. Rendered inside the sort button. */
  label: React.ReactNode;
  /** Active direction for this column, or null when the column is not the active sort. */
  direction: SortableHeaderDirection;
  onSort: () => void;
  /** Classes for the `<th>` - layout, width, responsive visibility, typography. */
  className?: string;
  /** Classes for the sort button. Icon styling and label/icon spacing are not overridable. */
  buttonClassName?: string;
}

/** Fixed 10px so every sort symbol in the app renders identically. */
const ICON_CLASS = 'h-[10px] w-[10px] shrink-0';

/**
 * Shared sortable table header used by every sortable admin/report table.
 *
 * The component exclusively owns aria-sort, focus-visible treatment, label/icon
 * spacing, and the icon choice/size/color so the sorting affordance stays
 * identical everywhere. Callers only supply the label, the current direction,
 * the sort callback, and page-specific header/button classes.
 */
export const SortableTableHeader: React.FC<SortableTableHeaderProps> = ({
  label,
  direction,
  onSort,
  className,
  buttonClassName,
}) => {
  const Icon = direction === 'asc' ? ChevronUp : direction === 'desc' ? ChevronDown : ChevronsUpDown;

  return (
    <th
      scope="col"
      aria-sort={direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none'}
      className={className}
    >
      <button
        type="button"
        onClick={onSort}
        className={cn(
          'inline-flex cursor-pointer items-center gap-1.5 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
          buttonClassName,
        )}
      >
        {label}
        <Icon
          className={cn(ICON_CLASS, direction ? 'text-foreground' : 'text-muted-foreground/50')}
          aria-hidden="true"
        />
      </button>
    </th>
  );
};

export default SortableTableHeader;
