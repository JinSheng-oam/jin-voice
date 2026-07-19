import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const defaultSiteAppearance = {
    backgroundMode: 'preset',
    backgroundPreset: 'aurora',
    backgroundImageUrl: '',
    backgroundMediaType: 'image',
    backgroundMediaId: null,
    backgroundMediaLibrary: [],
    backgroundBlur: 16,
    backgroundOpacity: 68,
    panelOpacity: 8,
    panelBlur: 22,
    panelGlow: 12,
    lgOpacity: 12,
    lgBlur: 24,
    lgSaturation: 120,
    lgBrightness: 110,
    lgEdgeHighlight: 25,
    lgEdgeHighlightBottom: 5,
    lgInnerGlow: 15,
    lgInsetShadow: 20,
    lgOuterShadow: 30
};

const useUIStore = create(
    persist(
        (set) => ({
            theme: 'light', // 'dark', 'light', 'system'
            setTheme: (theme) => set({ theme }),
            siteAppearance: defaultSiteAppearance,
            setSiteAppearance: (siteAppearance) => set((state) => ({
                siteAppearance: {
                    ...state.siteAppearance,
                    ...siteAppearance
                }
            })),

            // Language state (prepared for future i18n)
            language: 'zh-CN',
            setLanguage: (lang) => set({ language: lang }),
        }),
        {
            name: 'ui-storage', // unique name
            partialize: (state) => ({
                theme: state.theme,
                language: state.language
            })
        }
    )
);

export default useUIStore;
