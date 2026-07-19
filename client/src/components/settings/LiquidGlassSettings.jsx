import { useState } from 'react';
const PREVIEW_BACKGROUNDS = [
    { name: '霓虹气泡', className: 'bg-neon-mesh', style: { backgroundColor: '#05060b' } },
    { name: '深空星云', className: 'bg-deep-space', style: { backgroundImage: 'radial-gradient(circle at center, #111827 0%, #030712 100%)' } },
    { name: '余晖暮色', className: 'bg-sunset', style: { backgroundImage: 'linear-gradient(135deg, #1e1b4b 0%, #31103f 50%, #4c0519 100%)' } },
    { name: '白昼网格', className: 'bg-light-showcase', style: { backgroundColor: '#f3f4f6', backgroundImage: 'radial-gradient(#e5e7eb 1.5px, transparent 1.5px)', backgroundSize: '24px 24px' } }
];

const MATERIAL_CONTROLS = [
    { key: 'lgOpacity', label: '面板透明度', fallback: 12, min: 0, max: 100, unit: '%', color: '#45d6c5' },
    { key: 'lgBlur', label: '面板模糊度', fallback: 24, min: 0, max: 64, unit: 'px', color: '#8b5cf6' },
    { key: 'lgSaturation', label: '材质饱和度', fallback: 120, min: 0, max: 250, unit: '%', color: '#ec4899' },
    { key: 'lgBrightness', label: '材质亮度', fallback: 110, min: 50, max: 200, unit: '%', color: '#f59e0b' }
];

const LIGHTING_CONTROLS = [
    { key: 'lgEdgeHighlight', label: '顶部边缘反光', fallback: 25, color: '#3b82f6' },
    { key: 'lgEdgeHighlightBottom', label: '底部边缘反光', fallback: 5, color: '#6366f1' },
    { key: 'lgInnerGlow', label: '内部体积发光', fallback: 15, color: '#10b981' },
    { key: 'lgInsetShadow', label: '内部体积暗角', fallback: 20, color: '#64748b' }
];

const GlassRange = ({ control, value, onChange }) => {
    const inputId = `liquid-glass-${control.key}`;
    return (
        <div className="liquid-glass-range">
            <div className="liquid-glass-range__header">
                <label htmlFor={inputId}>{control.label}</label>
                <output htmlFor={inputId}>{value}{control.unit || '%'}</output>
            </div>
            <input
                id={inputId}
                type="range"
                min={control.min ?? 0}
                max={control.max ?? 100}
                value={value}
                onChange={(event) => onChange(Number(event.target.value))}
                style={{ '--slider-color': control.color }}
                className="settings-range-input"
            />
        </div>
    );
};

const buildPreviewVariables = (appearance) => ({
    '--lg-opacity': (appearance.lgOpacity ?? 12) / 100,
    '--lg-blur': `${appearance.lgBlur ?? 24}px`,
    '--lg-saturation': `${appearance.lgSaturation ?? 120}%`,
    '--lg-brightness': `${appearance.lgBrightness ?? 110}%`,
    '--lg-edge-highlight': `rgba(255, 255, 255, ${(appearance.lgEdgeHighlight ?? 25) / 100})`,
    '--lg-edge-highlight-bottom': `rgba(255, 255, 255, ${(appearance.lgEdgeHighlightBottom ?? 5) / 100})`,
    '--lg-inner-glow': `rgba(255, 255, 255, ${(appearance.lgInnerGlow ?? 15) / 100})`,
    '--lg-inset-shadow': `rgba(0, 0, 0, ${(appearance.lgInsetShadow ?? 20) / 100})`
});

const LiquidGlassSettings = ({ appearance, onChange }) => {
    const [previewBackgroundIndex, setPreviewBackgroundIndex] = useState(0);
    const previewBackground = PREVIEW_BACKGROUNDS[previewBackgroundIndex];

    const renderRange = (control) => (
        <GlassRange
            key={control.key}
            control={control}
            value={appearance[control.key] ?? control.fallback}
            onChange={(value) => onChange({ [control.key]: value })}
        />
    );

    return (
        <section className="liquid-glass-settings">
            <header className="liquid-glass-settings__header">
                <h3>液态玻璃实验室</h3>
                <p>调整面板材质与边缘光影，右侧会实时显示效果。</p>
            </header>

            <div className="liquid-glass-settings__layout">
                <div className="liquid-glass-controls">
                    <section className="liquid-glass-control-group">
                        <div className="liquid-glass-control-group__header">
                            <h4>材质</h4>
                            <p>透明、模糊、饱和度与亮度</p>
                        </div>
                        <div className="liquid-glass-range-list">{MATERIAL_CONTROLS.map(renderRange)}</div>
                    </section>

                    <section className="liquid-glass-control-group">
                        <div className="liquid-glass-control-group__header">
                            <h4>光影</h4>
                            <p>边缘高光、内部发光与暗角</p>
                        </div>
                        <div className="liquid-glass-range-list">{LIGHTING_CONTROLS.map(renderRange)}</div>
                    </section>
                </div>

                <aside className="liquid-glass-preview-column" aria-label="液态玻璃实时预览">
                    <div
                        className={`liquid-glass-preview ${previewBackground.className}`}
                        style={{
                            ...previewBackground.style,
                        }}
                    >
                        <div className="blob-wrapper" aria-hidden="true">
                            <div className="blob blob-1"></div>
                            <div className="blob blob-2"></div>
                            <div className="blob blob-3"></div>
                            <div className="blob blob-4"></div>
                        </div>
                        <div
                            className="glass-panel"
                            style={{
                                ...buildPreviewVariables(appearance)
                            }}
                        >
                            <div className="liquid-glass-preview__mark">
                                <span>J</span>
                            </div>
                            <h4>质感预览</h4>
                            <p>拖动参数，实时观察材质变化</p>
                        </div>
                    </div>

                    <div className="liquid-glass-preview-toolbar">
                        <div>
                            <span>对比背景</span>
                            <strong>{previewBackground.name}</strong>
                        </div>
                        <div className="liquid-glass-preview-backgrounds">
                            {PREVIEW_BACKGROUNDS.map((background, index) => (
                                <button
                                    key={background.name}
                                    type="button"
                                    onClick={() => setPreviewBackgroundIndex(index)}
                                    title={background.name}
                                    aria-label={`预览背景：${background.name}`}
                                    aria-pressed={previewBackgroundIndex === index}
                                    className={previewBackgroundIndex === index ? 'is-active' : ''}
                                    style={{
                                        backgroundColor: background.style.backgroundColor || 'transparent',
                                        backgroundImage: background.style.backgroundImage || 'none',
                                        backgroundSize: background.style.backgroundSize || 'cover',
                                        backgroundPosition: 'center'
                                    }}
                                />
                            ))}
                        </div>
                    </div>
                </aside>
            </div>
        </section>
    );
};

export default LiquidGlassSettings;
