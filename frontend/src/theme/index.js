// MUI Theme — Mantis-inspired (light/dark)
import { createTheme } from '@mui/material/styles';
import Palette from './palette';
import Typography from './typography';

const FONT_FAMILY = `'Public Sans', sans-serif`;

const componentOverrides = (palette) => ({
    MuiCssBaseline: {
        styleOverrides: {
            body: {
                scrollbarWidth: 'thin',
                '&::-webkit-scrollbar': { width: 6, height: 6 },
                '&::-webkit-scrollbar-thumb': {
                    borderRadius: 8,
                    backgroundColor: palette.divider
                }
            }
        }
    },
    MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
            root: { borderRadius: 8, fontWeight: 600, textTransform: 'none' }
        }
    },
    MuiCard: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
            root: {
                borderRadius: 12,
                border: `1px solid ${palette.divider}`,
                boxShadow: '0 2px 14px 0 rgba(32,40,45,0.08)'
            }
        }
    },
    MuiCardContent: {
        styleOverrides: {
            root: { padding: 20, '&:last-child': { paddingBottom: 20 } }
        }
    },
    MuiTableCell: {
        styleOverrides: {
            root: {
                borderColor: palette.divider,
                fontSize: '0.875rem'
            },
            head: {
                fontWeight: 600,
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: palette.text.secondary,
                backgroundColor: palette.mode === 'light' ? palette.grey[50] : palette.grey[900]
            }
        }
    },
    MuiChip: {
        styleOverrides: {
            root: { borderRadius: 8, fontWeight: 500, fontSize: '0.75rem' }
        }
    },
    MuiListItemButton: {
        styleOverrides: {
            root: {
                borderRadius: 8,
                marginBottom: 2,
                '&.Mui-selected': {
                    backgroundColor: palette.primary?.lighter || 'rgba(24,144,255,0.08)',
                    color: palette.primary?.main || '#1890ff',
                    '&:hover': {
                        backgroundColor: palette.primary?.lighter || 'rgba(24,144,255,0.12)'
                    }
                }
            }
        }
    },
    MuiDrawer: {
        styleOverrides: {
            paper: {
                borderRight: `1px solid ${palette.divider}`,
                boxShadow: 'none'
            }
        }
    },
    MuiAppBar: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
            root: {
                backgroundColor: palette.background?.paper || '#fff',
                color: palette.text?.primary,
                borderBottom: `1px solid ${palette.divider}`
            }
        }
    },
    MuiOutlinedInput: {
        styleOverrides: {
            root: { borderRadius: 8 },
            notchedOutline: { borderColor: palette.divider }
        }
    },
    MuiDialog: {
        styleOverrides: {
            paper: { borderRadius: 12 }
        }
    },
    MuiTab: {
        styleOverrides: {
            root: {
                textTransform: 'none',
                fontWeight: 500,
                fontSize: '0.875rem',
                minHeight: 48
            }
        }
    },
    MuiTabs: {
        styleOverrides: {
            indicator: { height: 3, borderRadius: '3px 3px 0 0' }
        }
    },
    MuiTextField: {
        defaultProps: { variant: 'outlined', size: 'small' }
    },
    MuiSelect: {
        defaultProps: { size: 'small' }
    },
    MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
            root: { backgroundImage: 'none' }
        }
    },
    MuiSnackbar: {
        defaultProps: {
            anchorOrigin: { vertical: 'top', horizontal: 'right' }
        }
    },
    MuiAlert: {
        styleOverrides: {
            root: { borderRadius: 8 }
        }
    },
    MuiTooltip: {
        styleOverrides: {
            tooltip: { borderRadius: 6, fontSize: '0.75rem' }
        }
    },
    MuiAvatar: {
        styleOverrides: {
            root: { fontSize: '0.875rem', fontWeight: 600 }
        }
    }
});

export default function ThemeCustom(mode) {
    const palette = Palette(mode);
    const typography = Typography(FONT_FAMILY);

    return createTheme({
        palette,
        typography,
        shape: { borderRadius: 8 },
        spacing: 8,
        shadows: [
            'none',
            '0 1px 2px rgba(0,0,0,0.04)',
            '0 2px 8px rgba(0,0,0,0.06)',
            '0 4px 12px rgba(0,0,0,0.08)',
            '0 6px 16px rgba(0,0,0,0.08)',
            '0 8px 24px rgba(0,0,0,0.08)',
            '0 10px 32px rgba(0,0,0,0.10)',
            '0 12px 40px rgba(0,0,0,0.10)',
            '0 14px 48px rgba(0,0,0,0.12)',
            ...Array(16).fill('0 14px 48px rgba(0,0,0,0.12)')
        ],
        components: componentOverrides(palette)
    });
}
