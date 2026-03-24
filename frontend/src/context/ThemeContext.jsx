import { createContext, useContext, useMemo, useState } from 'react';
import { ThemeProvider as MuiThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import ThemeCustom from '../theme';

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
    const [mode, setMode] = useState(() => {
        const stored = localStorage.getItem('theme');
        if (stored) return stored;
        if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark';
        return 'light';
    });

    const theme = useMemo(() => ThemeCustom(mode), [mode]);

    const toggleTheme = () => {
        setMode(prev => {
            const next = prev === 'dark' ? 'light' : 'dark';
            localStorage.setItem('theme', next);
            return next;
        });
    };

    return (
        <ThemeContext.Provider value={{ theme: mode, toggleTheme }}>
            <MuiThemeProvider theme={theme}>
                <CssBaseline />
                {children}
            </MuiThemeProvider>
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const ctx = useContext(ThemeContext);
    if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
    return ctx;
}
