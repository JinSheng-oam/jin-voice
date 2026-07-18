import { useState } from 'react';
import { helperTextStyle } from './settingsStyles';

const PREVIEW_BACKGROUNDS = [
    { name: '霓虹气泡', className: 'bg-neon-mesh', style: { backgroundColor: '#05060b' } },
    { name: '深空星云', className: 'bg-deep-space', style: { backgroundImage: 'radial-gradient(circle at center, #111827 0%, #030712 100%)' } },
    { name: '余晖暮色', className: 'bg-sunset', style: { backgroundImage: 'linear-gradient(135deg, #1e1b4b 0%, #31103f 50%, #4c0519 100%)' } },
    { name: '白昼网格', className: 'bg-light-showcase', style: { backgroundColor: '#f3f4f6', backgroundImage: 'radial-gradient(#e5e7eb 1.5px, transparent 1.5px)', backgroundSize: '24px 24px' } }
];

const MATERIAL_CONTROLS = [
    { key: 'lgOpacity', label: '面板透明度 (Opacity)', fallback: 12, min: 0, max: 100, unit: '%', color: '#45d6c5' },
    { key: 'lgBlur', label: '面板模糊度 (Blur)', fallback: 24, min: 0, max: 64, unit: 'px', color: '#8b5cf6' },
    { key: 'lgSaturation', label: '材质饱和度 (Saturation)', fallback: 120, min: 0, max: 250, unit: '%', color: '#ec4899' },
    { key: 'lgBrightness', label: '材质亮度 (Brightness)', fallback: 110, min: 50, max: 200, unit: '%', color: '#f59e0b' }
];

const LIGHTING_CONTROLS = [
    { key: 'lgEdgeHighlight', label: '顶部边缘反光 (Top Edge)', fallback: 25, color: '#3b82f6' },
    { key: 'lgEdgeHighlightBottom', label: '底部边缘反光 (Bottom Edge)', fallback: 5, color: '#6366f1' },
    { key: 'lgInnerGlow', label: '内部体积发光 (Inner Glow)', fallback: 15, color: '#10b981' },
    { key: 'lgInsetShadow', label: '内部体积暗角 (Inset Shadow)', fallback: 20, color: '#64748b' }
];

const GlassRange = ({ control, value, onChange }) => (
    <div style={{ marginBottom: '18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <label style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{control.label}</label>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{value}{control.unit || '%'}</span>
        </div>
        <input
            type="range"
            min={control.min ?? 0}
            max={control.max ?? 100}
            value={value}
            onChange={(event) => onChange(Number(event.target.value))}
            style={{ width: '100%', '--slider-color': control.color }}
            className="settings-range-input"
        />
    </div>
);

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
        <div style={{ marginTop: '32px', paddingTop: '24px', borderTop: '2px solid var(--panel-card-border)' }}>
            <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '16px', color: 'var(--text-primary)' }}>液态玻璃实验室</h3>
            <p style={{ ...helperTextStyle, marginTop: 0, marginBottom: '24px' }}>细粒度调节全站的玻璃拟物化质感参数。</p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', alignItems: 'start' }}>
                <div>{MATERIAL_CONTROLS.map(renderRange)}</div>
                <div style={{ position: 'sticky', top: '24px' }}>
                    <div
                        className={previewBackground.className}
                        style={{
                            height: '260px',
                            borderRadius: 'var(--radius-xl)',
                            ...previewBackground.style,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '24px',
                            boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.1)',
                            position: 'relative',
                            overflow: 'hidden'
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
                                width: '100%',
                                height: '100%',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'center',
                                alignItems: 'center',
                                padding: '16px',
                                gap: '12px',
                                borderRadius: 'var(--radius-lg)',
                                ...buildPreviewVariables(appearance)
                            }}
                        >
                            <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
                                <span style={{ color: '#fff', fontSize: '20px', fontWeight: 'bold' }}>J</span>
                            </div>
                            <h4 style={{ color: 'var(--text-primary)', margin: 0, fontSize: '14px', textShadow: '0 1px 2px rgba(255,255,255,0.5)' }}>质感预览</h4>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '12px', textAlign: 'center', margin: 0, fontWeight: 500 }}>拖动左侧滑块，实时感受玻璃拟物化质感</p>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', marginTop: '12px', justifyContent: 'center' }}>
                        {PREVIEW_BACKGROUNDS.map((background, index) => (
                            <button
                                key={background.name}
                                type="button"
                                onClick={() => setPreviewBackgroundIndex(index)}
                                title={background.name}
                                aria-label={`预览背景：${background.name}`}
                                aria-pressed={previewBackgroundIndex === index}
                                style={{
                                    width: '24px',
                                    height: '24px',
                                    borderRadius: '50%',
                                    border: previewBackgroundIndex === index ? '2px solid var(--primary)' : '2px solid transparent',
                                    backgroundColor: background.style.backgroundColor || 'transparent',
                                    backgroundImage: background.style.backgroundImage || 'none',
                                    backgroundSize: background.style.backgroundSize || 'cover',
                                    backgroundPosition: 'center',
                                    cursor: 'pointer',
                                    opacity: previewBackgroundIndex === index ? 1 : 0.6,
                                    transition: 'opacity 0.2s, border-color 0.2s',
                                    padding: 0
                                }}
                            />
                        ))}
                    </div>

                    <div style={{ marginTop: '24px' }}>{LIGHTING_CONTROLS.map(renderRange)}</div>
                </div>
            </div>
        </div>
    );
};

export default LiquidGlassSettings;
