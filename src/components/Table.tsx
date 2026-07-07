import React, { useState, useEffect } from 'react';
import { ArrowUpDown, ChevronDown, ChevronUp, Search, ChevronRight } from 'lucide-react';
import styles from './Table.module.scss';

export interface Column<T> {
  /** Unique key to identify the column data source */
  key: string;
  /** Header label text */
  header: string;
  /** Optional custom rendering function for the cell content */
  render?: (row: T, index: number) => React.ReactNode;
  /** Text alignment direction */
  align?: 'left' | 'center' | 'right';
  /** Custom CSS width for the column */
  width?: string;
  /** Whether the column can be sorted */
  sortable?: boolean;
}

interface TableProps<T> {
  /** The columns configuration array */
  columns: Column<T>[];
  /** Array of row data objects */
  data: T[];
  /** Message to display when the data array is empty */
  emptyMessage?: string;
  /** Callback triggered when a row is clicked */
  onRowClick?: (row: T) => void;
  /** Loading state flag to display spinner instead of data */
  isLoading?: boolean;
  /** The current active sorting column key */
  sortColumn?: string;
  /** The current sorting direction */
  sortDirection?: 'asc' | 'desc';
  /** Callback triggered when a sortable column header is clicked */
  onSort?: (key: string) => void;
  /** Show or hide the built-in search bar. Default: false */
  showSearch?: boolean;
  /** Placeholder text for the search input */
  searchPlaceholder?: string;
  /** Optional function to determine if a row is selected */
  isRowSelected?: (row: T, index: number) => boolean;
  /** Optional function to render expanded content below the row */
  renderExpandedRow?: (row: T, index: number) => React.ReactNode;
  /** Optional function to determine unique row key for expansion state */
  getRowKey?: (row: T, index: number) => string | number;
  /** Optional actions to display next to the search bar */
  searchActions?: React.ReactNode;
}

export default function Table<T>({
  columns,
  data,
  emptyMessage = 'No data available',
  onRowClick,
  isLoading = false,
  sortColumn,
  sortDirection,
  onSort,
  showSearch = false,
  searchPlaceholder = 'Search...',
  isRowSelected,
  renderExpandedRow,
  getRowKey,
  searchActions,
}: TableProps<T>) {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [internalSelectedRow, setInternalSelectedRow] = useState<T | null>(null);
  const [expandedRows, setExpandedRows] = useState<Record<string | number, boolean>>({});

  const toggleRow = (rowId: string | number) => {
    setExpandedRows((prev) => ({
      ...prev,
      [rowId]: !prev[rowId],
    }));
  };

  const getRowId = (row: T, index: number): string | number => {
    if (getRowKey) return getRowKey(row, index);
    const r = row as any;
    return r.id !== undefined ? String(r.id) : String(index);
  };

  // Debounce: update debouncedQuery 300ms after the user stops typing
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Filter using the debounced value so filtering doesn't run on every keystroke
  const displayData = showSearch && debouncedQuery.trim()
    ? data.filter((row) => {
        // Search parent row values
        const parentMatch = Object.entries(row as Record<string, unknown>).some(([key, val]) => {
          if (key === 'items') return false; // handle items separately
          return String(val ?? '').toLowerCase().includes(debouncedQuery.toLowerCase());
        });
        if (parentMatch) return true;

        // Search nested items if they exist
        const r = row as any;
        if (Array.isArray(r.items)) {
          return r.items.some((item: any) =>
            Object.values(item).some((val) =>
              String(val ?? '').toLowerCase().includes(debouncedQuery.toLowerCase())
            )
          );
        }

        return false;
      })
    : data;

  const handleHeaderClick = (column: Column<T>) => {
    if (column.sortable && onSort) {
      onSort(column.key);
    }
  };

  const getAlignClass = (align?: 'left' | 'center' | 'right') => {
    switch (align) {
      case 'center': return styles.alignCenter;
      case 'right':  return styles.alignRight;
      case 'left':
      default:       return styles.alignLeft;
    }
  };

  return (
    <div className={styles.tableContainer}>
      {/* Search bar — only rendered when showSearch={true} */}
      {showSearch && (
        <div className={styles.searchBarContainer}>
          <div className={styles.searchBar}>
            <Search size={15} className={styles.searchIcon} />
            <input
              type="text"
              className={styles.searchInput}
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search table"
            />
            {searchQuery && (
              <button
                className={styles.searchClear}
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
              >
                ×
              </button>
            )}
            {searchQuery.trim() && (
              <span className={styles.searchCount}>
                {debouncedQuery.trim() ? displayData.length : data.length} of {data.length}
              </span>
            )}
          </div>
          {searchActions && (
            <div className={styles.searchActions}>
              {searchActions}
            </div>
          )}
        </div>
      )}

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              {renderExpandedRow && (
                <th className={`${styles.th} ${styles.expandTh}`} style={{ width: '28px' }} />
              )}
              {columns.map((column) => {
                const isSortActive = sortColumn === column.key;
                const thClasses = [
                  styles.th,
                  column.sortable ? styles.sortable : '',
                  getAlignClass(column.align)
                ].filter(Boolean).join(' ');

                return (
                  <th
                    key={column.key}
                    className={thClasses}
                    style={{ width: column.width, minWidth: column.width }}
                    onClick={() => handleHeaderClick(column)}
                    role={column.sortable ? 'button' : undefined}
                    tabIndex={column.sortable ? 0 : undefined}
                  >
                    <div className={styles.thContent}>
                      <span>{column.header}</span>
                      {column.sortable && (
                        <span className={styles.sortIcon}>
                          {isSortActive ? (
                            sortDirection === 'asc' ? (
                              <ChevronUp size={14} />
                            ) : (
                              <ChevronDown size={14} />
                            )
                          ) : (
                            <ArrowUpDown size={12} className={styles.inactiveSort} />
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={columns.length + (renderExpandedRow ? 1 : 0)} className={styles.loadingContainer}>
                  <div className={styles.loadingState}>
                    <div className={styles.spinner} />
                    <div>Loading data...</div>
                  </div>
                </td>
              </tr>
            ) : displayData.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (renderExpandedRow ? 1 : 0)} className={styles.emptyContainer}>
                  <div className={styles.emptyState}>
                    {showSearch && debouncedQuery.trim()
                      ? `No results for "${debouncedQuery}"`
                      : emptyMessage}
                  </div>
                </td>
              </tr>
            ) : (
              displayData.map((row, rowIndex) => {
                const isSelected = isRowSelected 
                  ? isRowSelected(row, rowIndex) 
                  : internalSelectedRow === row;

                const rowId = getRowId(row, rowIndex);
                const isExpanded = !!expandedRows[rowId];

                return (
                  <React.Fragment key={rowId}>
                    <tr
                      className={[
                        styles.tr,
                        onRowClick ? styles.clickable : '',
                        isSelected ? styles.selected : ''
                      ].filter(Boolean).join(' ')}
                      onClick={() => {
                        setInternalSelectedRow(row);
                        if (onRowClick) onRowClick(row);
                      }}
                    >
                      {renderExpandedRow && (
                        <td className={`${styles.td} ${styles.expandTd}`} style={{ width: '28px', textAlign: 'center' }}>
                          <button
                            type="button"
                            className={styles.expandButton}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleRow(rowId);
                            }}
                            aria-label={isExpanded ? "Collapse row" : "Expand row"}
                          >
                            {isExpanded ? (
                              <ChevronDown size={15} className={styles.expandIcon} />
                            ) : (
                              <ChevronRight size={15} className={styles.expandIcon} />
                            )}
                          </button>
                        </td>
                      )}
                      {columns.map((column) => (
                        <td
                          key={column.key}
                          className={[styles.td, getAlignClass(column.align)].join(' ')}
                          style={{ width: column.width, minWidth: column.width }}
                        >
                          {column.render
                            ? column.render(row, rowIndex)
                            : (row as any)[column.key] !== undefined
                            ? String((row as any)[column.key])
                            : '-'}
                        </td>
                      ))}
                    </tr>
                    {isExpanded && renderExpandedRow && (
                      <tr className={styles.expandedRow}>
                        <td colSpan={columns.length + 1} className={styles.expandedCell}>
                          {renderExpandedRow(row, rowIndex)}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
