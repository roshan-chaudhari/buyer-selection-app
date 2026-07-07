import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import styles from './Dropdown.module.scss';

interface DropdownProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  label?: string;
  error?: string;
  fullWidth?: boolean;
  value?: string;
  id?: string;
  name?: string;
  disabled?: boolean;
  searchable?: boolean;         // enable/disable search box (default: true)
  searchPlaceholder?: string;   // placeholder text for the search box
  multiselect?: boolean;        // enable/disable multi-select checkbox mode
  placeholder?: string;         // custom override for the trigger text
  showApplyButton?: boolean;    // show an "Apply/Add" button at the bottom of multiselect list
  onChange?: (e: { target: { value: string; name?: string } }) => void;
  children: React.ReactNode;
}

const Dropdown = React.forwardRef<HTMLDivElement, DropdownProps>(
  (
    {
      label,
      error,
      fullWidth = true,
      className = '',
      id,
      name,
      value,
      disabled,
      searchable = true,
      searchPlaceholder = 'Search...',
      multiselect = false,
      placeholder,
      showApplyButton = false,
      onChange,
      children,
      ...props
    },
    ref,
  ) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [tempValues, setTempValues] = useState<string[]>([]);
    const containerRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);

    // Parse <option> children into a flat list
    const allOptions = React.Children.toArray(children)
      .filter(React.isValidElement)
      .filter((child) => (child as React.ReactElement).type === 'option')
      .map((child) => {
        const c = child as React.ReactElement<{ value: string; children?: React.ReactNode; disabled?: boolean }>;
        return {
          value: c.props.value,
          label: String(c.props.children ?? c.props.value),
          disabled: !!c.props.disabled,
        };
      });

    // Filter by search term
    const filteredOptions = searchTerm
      ? allOptions.filter(
          (opt) =>
            !opt.disabled &&
            opt.label.toLowerCase().includes(searchTerm.toLowerCase()),
        )
      : allOptions;

    // Sync tempValues when dropdown opens
    useEffect(() => {
      if (isOpen && multiselect && showApplyButton) {
        setTempValues(
          value ? value.split(',').map((s) => s.trim()).filter(Boolean) : []
        );
      }
    }, [isOpen, value, multiselect, showApplyButton]);

    // Derived select state
    const selectedValues = (multiselect && showApplyButton)
      ? tempValues
      : multiselect
      ? (value ? value.split(',').map((s) => s.trim()).filter(Boolean) : [])
      : value ? [value] : [];

    const selectedLabels = allOptions
      .filter((opt) => selectedValues.includes(opt.value))
      .map((opt) => opt.label);

    const placeholderOption = allOptions.find((opt) => opt.disabled || opt.value === '');
    const triggerText = placeholder
      ? placeholder
      : selectedLabels.length > 0
      ? selectedLabels.join(', ')
      : (placeholderOption?.label ?? '-- Select --');

    // Focus search input when dropdown opens
    useEffect(() => {
      if (isOpen && searchable && searchRef.current) {
        setTimeout(() => searchRef.current?.focus(), 50);
      }
      if (!isOpen) setSearchTerm('');
    }, [isOpen, searchable]);

    // Close when clicking outside
    useEffect(() => {
      if (!isOpen) return;
      const handleClickOutside = (event: MouseEvent) => {
        if (
          containerRef.current &&
          !containerRef.current.contains(event.target as Node)
        ) {
          setIsOpen(false);
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    const handleSelectOption = (optValue: string) => {
      if (disabled) return;
      if (multiselect) {
        let newValues: string[];
        if (selectedValues.includes(optValue)) {
          newValues = selectedValues.filter((v) => v !== optValue);
        } else {
          newValues = [...selectedValues, optValue];
        }
        
        if (showApplyButton) {
          setTempValues(newValues);
        } else {
          const newValueStr = newValues.join(',');
          if (onChange) onChange({ target: { value: newValueStr, name } });
        }
      } else {
        if (onChange) onChange({ target: { value: optValue, name } });
        setIsOpen(false);
      }
    };

    return (
      <div
        ref={(el) => {
          containerRef.current = el!;
          if (typeof ref === 'function') ref(el);
          else if (ref) ref.current = el!;
        }}
        className={`${styles.dropdownContainer} ${fullWidth ? styles.fullWidth : ''} ${className}`}
        {...props}
      >
        {label && (
          <label htmlFor={id} className={styles.label}>
            {label}
          </label>
        )}

        {/* Trigger */}
        <div
          id={id}
          className={`${styles.trigger} ${error ? styles.hasError : ''} ${disabled ? styles.disabled : ''}`}
          role="combobox"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          tabIndex={disabled ? -1 : 0}
          onClick={() => !disabled && setIsOpen(!isOpen)}
          title={triggerText}
          onKeyDown={(e) => {
            if (disabled) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setIsOpen(!isOpen);
            } else if (e.key === 'Escape') {
              setIsOpen(false);
            }
          }}
        >
          <span>{triggerText}</span>
          <span className={`${styles.chevron} ${isOpen ? styles.open : ''}`}>
            <ChevronDown size={16} />
          </span>
        </div>

        {/* Dropdown panel */}
        {isOpen && (
          <div className={styles.dropdownMenu} role="listbox">
            {/* Search box */}
            {searchable && (
              <div className={styles.searchWrapper}>
                <input
                  ref={searchRef}
                  type="text"
                  className={styles.searchInput}
                  placeholder={searchPlaceholder}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            )}

            {/* Options */}
            <ul className={styles.optionsList}>
              {filteredOptions.length === 0 ? (
                <li className={`${styles.dropdownItem} ${styles.noResults}`}>
                  No results found
                </li>
              ) : (
                filteredOptions.map((opt) => {
                  const isOptSelected = selectedValues.includes(opt.value);

                  return (
                    <li
                      key={opt.value}
                      className={`${styles.dropdownItem} ${isOptSelected ? styles.isSelected : ''}`}
                      role="option"
                      aria-selected={isOptSelected}
                      aria-disabled={opt.disabled}
                      onClick={() => !opt.disabled && handleSelectOption(opt.value)}
                      title={opt.label}
                    >
                      {multiselect && !opt.disabled && (
                        <input
                          type="checkbox"
                          checked={isOptSelected}
                          className={styles.checkbox}
                          onChange={() => {}}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectOption(opt.value);
                          }}
                        />
                      )}
                      <span>{opt.label}</span>
                    </li>
                  );
                })
              )}
            </ul>

            {multiselect && showApplyButton && (
              <div 
                className={styles.applyWrapper} 
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  className={styles.applyButton}
                  onClick={() => {
                    const newValueStr = tempValues.join(',');
                    if (onChange) onChange({ target: { value: newValueStr, name } });
                    setIsOpen(false);
                  }}
                >
                  Add
                </button>
              </div>
            )}
          </div>
        )}

        {error && <span className={styles.errorMessage}>{error}</span>}
      </div>
    );
  },
);

Dropdown.displayName = 'Dropdown';

export default Dropdown;
