import React, { useState, useRef, useEffect } from 'react';
import { FiChevronDown, FiCheck } from 'react-icons/fi';

const DropdownSelect = ({ value, onChange, options, className, style, placeholder }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef(null);

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
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div 
            ref={containerRef} 
            className={`dropdown-select-container ${className || ''}`}
            style={{ ...style }}
        >
            <button 
                type="button"
                className={`dropdown-select-trigger ${isOpen ? 'open' : ''}`}
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
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
                <div className="dropdown-select-menu">
                    {options.map((opt, i) => (
                        <div
                            key={opt.value || `opt-${i}`}
                            onClick={() => {
                                if (opt.disabled) return;
                                onChange(opt.value);
                                setIsOpen(false);
                            }}
                            className={`dropdown-select-item ${opt.disabled ? 'disabled' : ''} ${opt.value === value ? 'selected' : ''}`}
                        >
                            <span style={{ flex: 1 }}>{opt.label}</span>
                            {opt.value === value && <FiCheck size={14} className="dropdown-select-check" />}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default DropdownSelect;
