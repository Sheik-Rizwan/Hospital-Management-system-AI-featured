import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import MenuIcon from '@mui/icons-material/Menu';
import ThemeToggle from '../components/ThemeToggle';

export default function TopBar({ onMenuToggle, children }) {
    return (
        <AppBar position="sticky" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
            <Toolbar sx={{ justifyContent: 'space-between' }}>
                {onMenuToggle && (
                    <IconButton edge="start" onClick={onMenuToggle} sx={{ display: { md: 'none' }, mr: 1, color: 'text.primary' }}>
                        <MenuIcon />
                    </IconButton>
                )}
                <Box sx={{ flex: 1 }} />
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {children}
                    <ThemeToggle />
                    <Box component="img" src="/logo.png" alt="CortexCraft.AI" sx={{ height: 32, width: 'auto', objectFit: 'contain', ml: 1 }} />
                </Box>
            </Toolbar>
        </AppBar>
    );
}
