import React, { useState, useRef, useEffect, useId } from 'react';
import { FiChevronDown, FiCheck } from 'react-icons/fi';

const DropdownSelect = ({ value, onChange, options, className, style, placeholder, ariaLabel, disabled = false }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef(null);
    const triggerRef = useRef(null);
    const menuId = useId();

    const selectedOption = options.find(opt => opt.value === value) || options[0];

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (containerRef.current) {
                const isOutside = e.composedPath 
                    ? !e.composedPath().includes(containerRef.current) 
                    : !containerRef.current.contains(e.target);
                if (isOutside) {
                    setIsOpen(false);
                }
            }
        };
        const handleEscape = (event) => {
            if (event.key === 'Escape') {
                setIsOpen(false);
                triggerRef.current?.focus();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, []);

    return (
        <div 
            ref={containerRef} 
            className={`dropdown-select-container ${disabled ? 'is-disabled' : ''} ${className || ''}`}
            style={{ ...style }}
        >
            <button 
                ref={triggerRef}
                type="button"
                className={`dropdown-select-trigger ${isOpen ? 'open' : ''}`}
                aria-label={ariaLabel}
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                aria-controls={isOpen ? menuId : undefined}
                disabled={disabled}
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (disabled) return;
                    setIsOpen(prev => !prev);
                }}
            >
                <span className="dropdown-select-label">
                    {selectedOption ? selectedOption.label : (placeholder || '请选择')}
                </span>
                <FiChevronDown 
                    size={16} 
                    className="dropdown-select-icon"
                />
            </button>
            {isOpen && (
                <div id={menuId} className="dropdown-select-menu" role="listbox" aria-label={ariaLabel}>
                    {options.map((opt, i) => (
                        <button
                            type="button"
                            key={opt.value || `opt-${i}`}
                            role="option"
                            aria-selected={opt.value === value}
                            disabled={opt.disabled}
                            onClick={() => {
                                if (opt.disabled) return;
                                onChange(opt.value);
                                setIsOpen(false);
                            }}
                            className={`dropdown-select-item ${opt.disabled ? 'disabled' : ''} ${opt.value === value ? 'selected' : ''}`}
                        >
                            <span style={{ flex: 1 }}>{opt.label}</span>
                            {opt.value === value && <FiCheck size={14} className="dropdown-select-check" />}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

export default DropdownSelect;
