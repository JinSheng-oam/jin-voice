const switchStyle = {
    width: '48px',
    height: '26px',
    flexShrink: 0,
    borderRadius: '13px',
    border: 'none',
    cursor: 'pointer',
    position: 'relative',
    transition: 'background 0.2s ease'
};

const SettingsSwitch = ({ label, checked, onChange }) => (
    <button
        type="button"
        role="switch"
        aria-checked={Boolean(checked)}
        aria-label={label}
        onClick={() => onChange?.(!checked)}
        style={{
            ...switchStyle,
            background: checked
                ? 'linear-gradient(135deg, #22c55e, #16a34a)'
                : 'var(--border-moderate)'
        }}
    >
        <span
            aria-hidden="true"
            style={{
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                background: '#fff',
                position: 'absolute',
                top: '3px',
                left: checked ? '25px' : '3px',
                transition: 'left 0.2s ease'
            }}
        />
    </button>
);

export default SettingsSwitch;
