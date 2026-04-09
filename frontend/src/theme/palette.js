// Mantis-inspired palette — self-contained (no @ant-design/colors dependency)
const Palette = (mode) => {
    const isLight = mode === 'light';

    return {
        mode,
        primary: {
            lighter: '#e6f7ff',
            light: '#69c0ff',
            main: '#1890ff',
            dark: '#096dd9',
            darker: '#003a8c',
            contrastText: '#fff'
        },
        secondary: {
            lighter: '#f0f0f0',
            light: '#d9d9d9',
            main: '#8c8c8c',
            dark: '#595959',
            darker: '#262626',
            contrastText: '#fff'
        },
        error: {
            lighter: '#fff1f0',
            light: '#ff7875',
            main: '#ff4d4f',
            dark: '#cf1322',
            contrastText: '#fff'
        },
        warning: {
            lighter: '#fffbe6',
            light: '#ffd666',
            main: '#faad14',
            dark: '#d48806',
            contrastText: '#fff'
        },
        success: {
            lighter: '#f6ffed',
            light: '#95de64',
            main: '#52c41a',
            dark: '#389e0d',
            contrastText: '#fff'
        },
        info: {
            lighter: '#e6f7ff',
            light: '#69c0ff',
            main: '#1890ff',
            dark: '#096dd9',
            contrastText: '#fff'
        },
        grey: {
            0: '#ffffff',
            50: '#fafafa',
            100: '#f5f5f5',
            200: '#f0f0f0',
            300: '#d9d9d9',
            400: '#bfbfbf',
            500: '#8c8c8c',
            600: '#595959',
            700: '#434343',
            800: '#262626',
            900: '#1f1f1f',
            A50: '#f0f0f0',
            A100: '#d5d5d5',
            A200: '#aaaaaa',
            A400: '#616161',
            A700: '#303030'
        },
        text: {
            primary: isLight ? '#262626' : '#e6e6e6',
            secondary: isLight ? '#8c8c8c' : '#a6a6a6',
            disabled: isLight ? '#bfbfbf' : '#595959'
        },
        action: {
            disabled: isLight ? '#d9d9d9' : '#434343',
            hover: isLight ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.08)',
            selected: isLight ? 'rgba(24, 144, 255, 0.08)' : 'rgba(24, 144, 255, 0.16)'
        },
        divider: isLight ? '#f0f0f0' : '#303030',
        background: {
            paper: isLight ? '#ffffff' : '#1a223f',
            default: isLight ? '#fafafb' : '#111936'
        }
    };
};

export default Palette;
