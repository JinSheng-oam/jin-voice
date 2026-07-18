import { FiImage, FiMonitor } from 'react-icons/fi';
import LiquidGlassSettings from './LiquidGlassSettings';
import { helperTextStyle, sectionCaptionStyle, sectionCardStyle } from './settingsStyles';

const AppearanceSettingsSection = ({ model }) => {
    const { backgroundOptions, isAdmin, saveSiteAppearance, setTheme, siteAppearanceDraft,
        siteAppearanceSaving, theme, updateSiteAppearanceDraft } = model;
    return (
        <div style={{ maxWidth: '540px', margin: '0 auto' }}>
            <section id="appearance-theme">
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        marginBottom: '20px'
                                    }}>
                                        <div style={{
                                            width: '32px',
                                            height: '32px',
                                            borderRadius: '10px',
                                            background: 'linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}>
                                            <FiMonitor size={16} color="#fff" />
                                        </div>
                                        <span style={{ fontSize: '15px', fontWeight: '600' }}>主题设置</span>
                                    </div>

                                    <div style={{
                                        ...sectionCardStyle
                                    }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                                            {[
                                                { id: 'dark', label: '深色模式', color: '#1e1f22' },
                                                { id: 'light', label: '浅色模式', color: '#ffffff' },
                                                { id: 'system', label: '跟随系统', color: '#475569' }
                                            ].map(opt => (
                                                <button
                                                    key={opt.id}
                                                    onClick={() => setTheme(opt.id)}
                                                    style={{
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        alignItems: 'center',
                                                        gap: '12px',
                                                        padding: '16px',
                                                        borderRadius: '12px',
                                                        border: theme === opt.id ? '2px solid var(--primary)' : '1px solid var(--border-moderate)',
                                                        background: 'var(--bg-subtle-panel-hover)',
                                                        cursor: 'pointer',
                                                        position: 'relative',
                                                        overflow: 'hidden'
                                                    }}
                                                >
                                                    <div style={{
                                                        width: '40px',
                                                        height: '40px',
                                                        borderRadius: '50%',
                                                        background: opt.color,
                                                        border: '1px solid var(--border-moderate)',
                                                        boxShadow: '0 4px 10px rgba(0,0,0,0.2)'
                                                    }}></div>
                                                    <span style={{ fontSize: '13px', color: theme === opt.id ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                                                        {opt.label}
                                                    </span>
                                                    {theme === opt.id && (
                                                        <div style={{
                                                            position: 'absolute',
                                                            top: '8px',
                                                            right: '8px',
                                                            width: '8px',
                                                            height: '8px',
                                                            borderRadius: '50%',
                                                            background: 'var(--primary)'
                                                        }} />
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </section>

                    <section style={{ marginTop: '32px' }}>
                        <div style={sectionCardStyle}>
                            <p style={{ ...helperTextStyle, marginTop: 0 }}>
                                主题设置会影响你当前设备上的浅色、深色和跟随系统选项。
                            </p>
                        </div>
                    </section>

                {isAdmin && (
                    <section id="appearance-background" style={{ marginTop: '32px' }}>
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '16px',
                                            marginBottom: '20px'
                                        }}>
                                            <div style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '10px'
                                            }}>
                                                <div style={{
                                                    width: '32px',
                                                    height: '32px',
                                                    borderRadius: '10px',
                                                    background: 'linear-gradient(135deg, #0ea5e9 0%, #14b8a6 100%)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center'
                                                }}>
                                                    <FiImage size={16} color="#fff" />
                                                </div>
                                                <span style={{ fontSize: '15px', fontWeight: '600' }}>站点背景</span>
                                            </div>
                                        </div>

                                        <div style={sectionCardStyle}>
                                            <p style={{ ...helperTextStyle, marginTop: 0, marginBottom: '16px' }}>
                                                这里配置的是整站统一的玻璃背景风格，普通成员会看到最终效果，但不会看到或修改这些控制项。
                                            </p>

                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '18px' }}>
                                                {[
                                                    { id: 'preset', label: '使用预设背景' },
                                                    { id: 'image', label: '自定义背景图片' }
                                                ].map((option) => (
                                                    <button
                                                        key={option.id}
                                                        type="button"
                                                        onClick={() => updateSiteAppearanceDraft({ backgroundMode: option.id })}
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            minHeight: '48px',
                                                            padding: '0 16px',
                                                            borderRadius: '12px',
                                                            border: siteAppearanceDraft.backgroundMode === option.id ? '2px solid var(--primary)' : '1px solid var(--panel-card-border)',
                                                            background: 'var(--panel-card-surface)',
                                                            color: siteAppearanceDraft.backgroundMode === option.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                                                            fontSize: '13px',
                                                            fontWeight: '600',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        {option.label}
                                                    </button>
                                                ))}
                                            </div>

                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                                {backgroundOptions.map((option) => (
                                                    <button
                                                        key={option.id}
                                                        type="button"
                                                        onClick={() => updateSiteAppearanceDraft({ backgroundPreset: option.id })}
                                                        style={{
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            alignItems: 'flex-start',
                                                            gap: '10px',
                                                            padding: '14px',
                                                            borderRadius: '12px',
                                                            border: siteAppearanceDraft.backgroundPreset === option.id ? '2px solid var(--primary)' : '1px solid var(--panel-card-border)',
                                                            background: 'var(--panel-card-surface)',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        <div style={{
                                                            width: '100%',
                                                            height: '74px',
                                                            borderRadius: '10px',
                                                            background: option.preview,
                                                            border: '1px solid var(--panel-card-border)'
                                                        }} />
                                                        <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: '600' }}>
                                                            {option.label}
                                                        </span>
                                                    </button>
                                                ))}
                                            </div>

                                            {siteAppearanceDraft.backgroundMode === 'image' && (
                                                <div style={{ marginTop: '18px', paddingTop: '18px', borderTop: '1px solid var(--panel-card-border)' }}>
                                                    <label style={sectionCaptionStyle}>背景图片地址</label>
                                                    <input
                                                        type="url"
                                                        value={siteAppearanceDraft.backgroundImageUrl || ''}
                                                        onChange={(e) => updateSiteAppearanceDraft({ backgroundImageUrl: e.target.value })}
                                                        placeholder="https://example.com/background.jpg 或 /images/background.jpg"
                                                        className="input"
                                                    />
                                                    <p style={helperTextStyle}>
                                                        支持 `https://`、`http://`、`data:image/...` 和站点相对路径。
                                                    </p>
                                                </div>
                                            )}

                                            <div style={{ marginTop: '18px', paddingTop: '18px', borderTop: '1px solid var(--panel-card-border)' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                    <label style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>背景模糊</label>
                                                    <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{siteAppearanceDraft.backgroundBlur}px</span>
                                                </div>
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="40"
                                                    value={siteAppearanceDraft.backgroundBlur}
                                                    onChange={(e) => updateSiteAppearanceDraft({ backgroundBlur: Number(e.target.value) })}
                                                    style={{ width: '100%', '--slider-color': '#0ea5e9' }}
                                                    className="settings-range-input"
                                                />
                                            </div>

                                            <div style={{ marginTop: '18px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                    <label style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>背景透明度</label>
                                                    <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{siteAppearanceDraft.backgroundOpacity}%</span>
                                                </div>
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="100"
                                                    value={siteAppearanceDraft.backgroundOpacity}
                                                    onChange={(e) => updateSiteAppearanceDraft({ backgroundOpacity: Number(e.target.value) })}
                                                    style={{ width: '100%', '--slider-color': '#14b8a6' }}
                                                    className="settings-range-input"
                                                />
                                            </div>

                                            <LiquidGlassSettings
                                                appearance={siteAppearanceDraft}
                                                onChange={updateSiteAppearanceDraft}
                                            />
                                            <div style={{
                                                marginTop: '22px',
                                                paddingTop: '18px',
                                                borderTop: '1px solid var(--panel-card-border)',
                                                display: 'flex',
                                                justifyContent: 'flex-end'
                                            }}>
                                                <button
                                                    type="button"
                                                    className="btn btn-primary"
                                                    disabled={siteAppearanceSaving}
                                                    onClick={() => void saveSiteAppearance()}
                                                >
                                                    {siteAppearanceSaving ? '保存中...' : '保存背景'}
                                                </button>
                                            </div>
                                        </div>
                    </section>
                )}
            </div>
    );
};

export default AppearanceSettingsSection;
