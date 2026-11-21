const STORAGE_KEY = 'pointer.workspace.background.v1';

export const WORKSPACE_BACKGROUND_PRESETS = [
    {id: 'default', name: '默认', css: 'transparent', dark: false},
    {id: 'mist', name: '晨雾', css: 'linear-gradient(135deg, #e8f2ff 0%, #dbeafe 55%, #f8fbff 100%)', dark: false},
    {id: 'mint', name: '薄荷', css: 'linear-gradient(135deg, #e6fbf0 0%, #d1fae5 60%, #f0fdf4 100%)', dark: false},
    {id: 'sakura', name: '樱花', css: 'linear-gradient(135deg, #fff1f6 0%, #ffe4ef 55%, #fff7ed 100%)', dark: false},
    {id: 'sunset', name: '晚霞', css: 'linear-gradient(135deg, #ffe8d6 0%, #ffd6a5 45%, #ffc6c6 100%)', dark: false},
    {id: 'sky', name: '海盐', css: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 55%, #e0f2fe 100%)', dark: false},
    {id: 'paper', name: '纸张', css: 'linear-gradient(135deg, #f7f3e9 0%, #efe8d8 100%)', dark: false},
    {id: 'night', name: '夜航', css: 'linear-gradient(135deg, #0b1220 0%, #111c33 55%, #1e2a44 100%)', dark: true},
    {id: 'forest', name: '深林', css: 'linear-gradient(135deg, #0f2027 0%, #203a43 55%, #2c5364 100%)', dark: true}
];

const DEFAULTS = {
    preset: 'default',
    color: '',
    image: '',
    dark: false,
    backgroundBlur: 0,
    panelBlur: 14,
    panelOpacity: 0.55
};

export const getWorkspacePreset = id => (
    WORKSPACE_BACKGROUND_PRESETS.find(preset => preset.id === id) ||
    WORKSPACE_BACKGROUND_PRESETS[0]
);

export const isDarkColor = value => {
    const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(value || ''));
    if (!match) return false;
    const red = Number.parseInt(match[1], 16);
    const green = Number.parseInt(match[2], 16);
    const blue = Number.parseInt(match[3], 16);
    return ((0.2126 * red) + (0.7152 * green) + (0.0722 * blue)) < 128;
};

export const isDarkBackground = settings => {
    if (!settings) return false;
    if (typeof settings.dark === 'boolean') return settings.dark;
    return Boolean(getWorkspacePreset(settings.preset).dark) || isDarkColor(settings.color);
};

const readSettings = () => {
    try {
        const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
        const merged = {...DEFAULTS, ...(stored && typeof stored === 'object' ? stored : {})};
        if (!stored || typeof stored.dark !== 'boolean') {
            merged.dark = Boolean(getWorkspacePreset(merged.preset).dark) || isDarkColor(merged.color);
        }
        return merged;
    } catch (error) {
        return {...DEFAULTS};
    }
};

let current = readSettings();

export const getWorkspaceBackground = () => current;

export const setWorkspaceBackground = patch => {
    current = {...current, ...(patch || {})};
    let persisted = true;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch (error) {
        persisted = false;
    }
    window.dispatchEvent(new CustomEvent('pointere-workspace-background-changed', {
        detail: current
    }));
    return persisted;
};

const blurFilter = settings => (
    settings.backgroundBlur ? `blur(${settings.backgroundBlur}px)` : 'none'
);

export const getWorkspaceBackgroundStyle = (settings, forceDark) => {
    const preset = getWorkspacePreset(settings.preset);
    const usePreset = preset.id !== 'default' && !settings.color && !settings.image;
    if (settings.image) {
        return {
            backgroundColor: 'transparent',
            backgroundImage: `url("${settings.image}")`,
            filter: blurFilter(settings)
        };
    }
    if (settings.color) {
        return {
            backgroundColor: settings.color,
            backgroundImage: 'none',
            filter: blurFilter(settings)
        };
    }
    if (usePreset) {
        return {
            backgroundColor: 'transparent',
            backgroundImage: preset.css,
            filter: blurFilter(settings)
        };
    }
    return {
        backgroundColor: forceDark ? '#0b1220' : '#f9f9f9',
        backgroundImage: 'none',
        filter: blurFilter(settings)
    };
};

export const getWorkspacePanelStyle = (settings, forceDark) => {
    const dark = Boolean(forceDark) || isDarkBackground(settings);
    return {
        '--pointer-workspace-panel-bg': dark ?
            `rgba(2, 5, 12, ${settings.panelOpacity})` :
            `rgba(255, 255, 255, ${settings.panelOpacity})`,
        '--pointer-workspace-panel-fill': dark ?
            `rgba(2, 5, 12, ${settings.panelOpacity})` :
            `rgba(249, 249, 249, ${settings.panelOpacity})`,
        '--pointer-workspace-panel-border': dark ?
            'rgba(255, 255, 255, .16)' :
            'rgba(0, 0, 0, .15)',
        '--pointer-workspace-panel-text': dark ?
            'rgba(235, 244, 255, .92)' :
            '#575e75',
        '--pointer-workspace-panel-hover-text': dark ? '#9ec5ff' : '#2f6fe4',
        '--pointer-workspace-panel-selected': dark ?
            'rgba(47, 111, 228, .28)' :
            'rgba(47, 111, 228, .12)',
        '--pointer-workspace-scrollbar': dark ?
            'rgba(255, 255, 255, .28)' :
            '#cecdce',
        '--pointer-workspace-panel-blur': `${settings.panelBlur}px`
    };
};
