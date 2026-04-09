import { useState } from 'react';

import FavoriteBorderOutlinedIcon from '@mui/icons-material/FavoriteBorderOutlined';
import WaterDropOutlinedIcon from '@mui/icons-material/WaterDropOutlined';
import DeviceThermostatOutlinedIcon from '@mui/icons-material/DeviceThermostatOutlined';
import AirOutlinedIcon from '@mui/icons-material/AirOutlined';
import AutoFixHighOutlinedIcon from '@mui/icons-material/AutoFixHighOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import ArrowBackOutlinedIcon from '@mui/icons-material/ArrowBackOutlined';
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';
import MedicationOutlinedIcon from '@mui/icons-material/MedicationOutlined';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import PersonOutlineOutlinedIcon from '@mui/icons-material/PersonOutlineOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import RadioButtonUncheckedOutlinedIcon from '@mui/icons-material/RadioButtonUncheckedOutlined';
import AutorenewOutlinedIcon from '@mui/icons-material/AutorenewOutlined';
import WbSunnyOutlinedIcon from '@mui/icons-material/WbSunnyOutlined';
import WbTwilightOutlinedIcon from '@mui/icons-material/WbTwilightOutlined';
import NightlightOutlinedIcon from '@mui/icons-material/NightlightOutlined';
import HourglassEmptyOutlinedIcon from '@mui/icons-material/HourglassEmptyOutlined';
import EditNoteOutlinedIcon from '@mui/icons-material/EditNoteOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import RestaurantOutlinedIcon from '@mui/icons-material/RestaurantOutlined';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import VolumeUpOutlinedIcon from '@mui/icons-material/VolumeUpOutlined';

import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Avatar from '@mui/material/Avatar';
import Stack from '@mui/material/Stack';
import Divider from '@mui/material/Divider';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import ListSubheader from '@mui/material/ListSubheader';
import Badge from '@mui/material/Badge';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import OutlinedInput from '@mui/material/OutlinedInput';
import InputAdornment from '@mui/material/InputAdornment';
import Tooltip from '@mui/material/Tooltip';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme as useMuiTheme } from '@mui/material/styles';
import MenuIcon from '@mui/icons-material/Menu';
import MenuOpenIcon from '@mui/icons-material/MenuOpen';
import SearchIcon from '@mui/icons-material/Search';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import LogoutIcon from '@mui/icons-material/Logout';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import { useTheme } from '../context/ThemeContext';

const DRAWER_WIDTH = 260;
const COLLAPSED_WIDTH = 0;

export default function DashboardLayout({
    children,
    sidebarItems = [],
    sidebarGroups = [],
    activeView,
    onViewChange,
    title = 'Dashboard',
    subtitle = '',
    user = {},
    onLogout,
    onProfileClick,
    notifications = [],
    onNotificationClick,
    searchValue = '',
    onSearchChange,
    searchPlaceholder = 'Search...',
    headerActions,
    userSection,
    logoSrc = '/logo.png'
}) {
    const muiTheme = useMuiTheme();
    const { theme: mode, toggleTheme } = useTheme();
    const isMobile = useMediaQuery(muiTheme.breakpoints.down('md'));
    const [mobileOpen, setMobileOpen] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [profileAnchor, setProfileAnchor] = useState(null);
    const [notifAnchor, setNotifAnchor] = useState(null);

    const handleDrawerToggle = () => {
        if (isMobile) setMobileOpen(!mobileOpen);
        else setSidebarOpen(!sidebarOpen);
    };
    const isDark = mode === 'dark';
    const drawerWidth = isMobile ? DRAWER_WIDTH : (sidebarOpen ? DRAWER_WIDTH : COLLAPSED_WIDTH);

    const userName = user?.full_name || user?.patient_name || user?.contact_person || 'User';
    const userInitial = userName[0]?.toUpperCase() || 'U';

    /* ─── Sidebar content ─── */
    const sidebarContent = (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Logo & Title */}
            <Box sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box
                    sx={{
                        width: 36, height: 36, borderRadius: 1.5,
                        background: `linear-gradient(135deg, ${muiTheme.palette.primary.main}, ${muiTheme.palette.primary.dark})`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', fontWeight: 700, fontSize: 18
                    }}
                >
                    +
                </Box>
                <Box>
                    <Typography variant="subtitle1" fontWeight={700} noWrap>{title}</Typography>
                    {subtitle && <Typography variant="caption" color="text.secondary" noWrap>{subtitle}</Typography>}
                </Box>
            </Box>

            <Divider />

            {/* Navigation */}
            <Box sx={{ flex: 1, overflowY: 'auto', px: 1.5, py: 1 }}>
                {sidebarGroups.length > 0 ? (
                    sidebarGroups.map((group, gi) => (
                        <List
                            key={gi}
                            subheader={
                                group.label ? (
                                    <ListSubheader
                                        disableSticky
                                        sx={{
                                            fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase',
                                            letterSpacing: '0.08em', color: 'text.secondary', lineHeight: 2.5,
                                            bgcolor: 'transparent', px: 1, mt: gi > 0 ? 1 : 0
                                        }}
                                    >
                                        {group.label}
                                    </ListSubheader>
                                ) : null
                            }
                            disablePadding
                        >
                            {group.items.map((item) => (
                                <ListItemButton
                                    key={item.id}
                                    selected={activeView === item.id}
                                    onClick={() => { onViewChange?.(item.id); if (isMobile) setMobileOpen(false); }}
                                    sx={{ my: 0.25, py: 1 }}
                                >
                                    <ListItemIcon sx={{ minWidth: 36, color: activeView === item.id ? 'primary.main' : 'text.secondary', fontSize: 20 }}>
                                        {item.icon}
                                    </ListItemIcon>
                                    <ListItemText
                                        primary={item.label}
                                        primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: activeView === item.id ? 600 : 400 }}
                                    />
                                    {item.badge > 0 && (
                                        <Badge badgeContent={item.badge} color="warning" sx={{ mr: 1 }} />
                                    )}
                                </ListItemButton>
                            ))}
                        </List>
                    ))
                ) : (
                    <List disablePadding>
                        {sidebarItems.map((item) => (
                            <ListItemButton
                                key={item.id}
                                selected={activeView === item.id}
                                onClick={() => { onViewChange?.(item.id); if (isMobile) setMobileOpen(false); }}
                                sx={{ my: 0.25, py: 1 }}
                            >
                                <ListItemIcon sx={{ minWidth: 36, color: activeView === item.id ? 'primary.main' : 'text.secondary', fontSize: 20 }}>
                                    {item.icon}
                                </ListItemIcon>
                                <ListItemText
                                    primary={item.label}
                                    primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: activeView === item.id ? 600 : 400 }}
                                />
                                {item.badge > 0 && (
                                    <Badge badgeContent={item.badge} color="warning" sx={{ mr: 1 }} />
                                )}
                            </ListItemButton>
                        ))}
                    </List>
                )}
            </Box>

            <Divider />

            {/* User section */}
            {userSection || (
                <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Avatar
                        sx={{
                            width: 36, height: 36,
                            bgcolor: 'primary.main', color: 'primary.contrastText',
                            fontSize: '0.875rem', fontWeight: 700
                        }}
                    >
                        {userInitial}
                    </Avatar>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={600} noWrap>{userName}</Typography>
                        <Typography variant="caption" color="text.secondary" noWrap>
                            {user?.role?.replace('_', ' ') || ''}
                        </Typography>
                    </Box>
                    <Tooltip title="Profile">
                        <IconButton size="small" onClick={onProfileClick} sx={{ color: 'text.secondary' }}>
                            <PersonOutlineIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Logout">
                        <IconButton size="small" onClick={onLogout} sx={{ color: 'error.main' }}>
                            <LogoutIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </Box>
            )}
        </Box>
    );

    return (
        <Box sx={{ display: 'flex', height: '100vh', bgcolor: 'background.default' }}>
            {/* Sidebar Drawer */}
            <Drawer
                variant={isMobile ? 'temporary' : 'persistent'}
                open={isMobile ? mobileOpen : sidebarOpen}
                onClose={handleDrawerToggle}
                ModalProps={{ keepMounted: true }}
                sx={{
                    width: drawerWidth,
                    flexShrink: 0,
                    transition: 'width 0.2s ease',
                    '& .MuiDrawer-paper': {
                        width: DRAWER_WIDTH,
                        bgcolor: 'background.paper',
                        borderRight: 1,
                        borderColor: 'divider',
                        overflowX: 'hidden',
                        transition: 'width 0.2s ease'
                    }
                }}
            >
                {sidebarContent}
            </Drawer>

            {/* Main area */}
            <Box
                sx={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    minWidth: 0,
                    transition: muiTheme.transitions.create(['margin', 'width'], {
                        easing: muiTheme.transitions.easing.sharp,
                        duration: muiTheme.transitions.duration.leavingScreen,
                    }),
                    ...(sidebarOpen && !isMobile && {
                        transition: muiTheme.transitions.create(['margin', 'width'], {
                            easing: muiTheme.transitions.easing.easeOut,
                            duration: muiTheme.transitions.duration.enteringScreen,
                        }),
                        marginLeft: `${DRAWER_WIDTH}px`,
                    }),
                }}
            >
                {/* Top Bar */}
                <AppBar position="static" elevation={0} sx={{ bgcolor: 'background.paper', color: 'text.primary', borderBottom: 1, borderColor: 'divider' }}>
                    <Toolbar sx={{ gap: 1, minHeight: { xs: 56, sm: 64 }, px: { xs: 1.5, sm: 2 } }}>
                        {/* Always-visible sidebar toggle */}
                        <Tooltip title={sidebarOpen && !isMobile ? 'Collapse sidebar' : 'Expand sidebar'}>
                            <IconButton
                                edge="start"
                                onClick={handleDrawerToggle}
                                sx={{ 
                                    mr: 2, 
                                    color: 'text.secondary', 
                                    flexShrink: 0,
                                    bgcolor: 'action.hover',
                                    borderRadius: 2,
                                    p: 1
                                }}
                            >
                                {(isMobile ? mobileOpen : sidebarOpen) ? <MenuOpenIcon /> : <MenuIcon />}
                            </IconButton>
                        </Tooltip>

                        {/* Brand: Logo + Title */}

                        <Stack direction="row" alignItems="center" spacing={1} sx={{ flexShrink: 0 }}>
                            <Box
                                sx={{
                                    width: 32, height: 32, borderRadius: 1.5,
                                    background: `linear-gradient(135deg, ${muiTheme.palette.primary.main}, ${muiTheme.palette.primary.dark})`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: '#fff', fontWeight: 700, fontSize: 16, flexShrink: 0
                                }}
                            >
                                +
                            </Box>
                            <Typography
                                variant="subtitle1"
                                fontWeight={700}
                                noWrap
                                sx={{ display: { xs: 'none', sm: 'block' }, background: `linear-gradient(135deg, ${muiTheme.palette.primary.main}, ${muiTheme.palette.secondary.main})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
                            >
                                MedCore AI
                            </Typography>
                        </Stack>

                        {/* Spacer */}
                        <Box sx={{ flex: 1 }} />

                        {/* Centered search */}
                        {onSearchChange && (
                            <OutlinedInput
                                value={searchValue}
                                onChange={(e) => onSearchChange(e.target.value)}
                                placeholder={searchPlaceholder}
                                size="small"
                                startAdornment={
                                    <InputAdornment position="start">
                                        <SearchIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
                                    </InputAdornment>
                                }
                                sx={{
                                    width: { xs: 160, sm: 280, md: 360 },
                                    bgcolor: 'action.hover',
                                    '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
                                    borderRadius: 2
                                }}
                            />
                        )}

                        {/* Spacer */}
                        <Box sx={{ flex: 1 }} />

                        {/* Right-side actions */}
                        <Stack direction="row" spacing={0.5} alignItems="center">
                            {headerActions}

                            {/* Theme toggle */}
                            <Tooltip title={isDark ? 'Light mode' : 'Dark mode'}>
                                <IconButton onClick={toggleTheme} sx={{ color: 'text.secondary' }}>
                                    {isDark ? <LightModeOutlinedIcon /> : <DarkModeOutlinedIcon />}
                                </IconButton>
                            </Tooltip>

                            {/* Notifications */}
                            <Tooltip title="Notifications">
                                <IconButton onClick={(e) => setNotifAnchor(e.currentTarget)} sx={{ color: 'text.secondary' }}>
                                    <Badge badgeContent={notifications.length} color="error" max={99}>
                                        <NotificationsNoneIcon />
                                    </Badge>
                                </IconButton>
                            </Tooltip>

                            {/* Profile avatar */}
                            <Tooltip title={userName}>
                                <IconButton onClick={(e) => setProfileAnchor(e.currentTarget)} sx={{ p: 0.5 }}>
                                    <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: '0.8rem', fontWeight: 700 }}>
                                        {userInitial}
                                    </Avatar>
                                </IconButton>
                            </Tooltip>

                            {/* Logo */}
                            {logoSrc && (
                                <Box
                                    component="img"
                                    src={logoSrc}
                                    alt="Logo"
                                    sx={{ height: 28, width: 'auto', objectFit: 'contain', ml: 0.5, display: { xs: 'none', sm: 'block' } }}
                                />
                            )}
                        </Stack>
                    </Toolbar>
                </AppBar>

                {/* Content area */}
                <Box sx={{ flex: 1, overflow: 'auto', p: { xs: 2, sm: 3 } }}>
                    {children}
                </Box>
            </Box>

            {/* Profile dropdown */}
            <Menu
                anchorEl={profileAnchor}
                open={Boolean(profileAnchor)}
                onClose={() => setProfileAnchor(null)}
                transformOrigin={{ horizontal: 'right', vertical: 'top' }}
                anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
                slotProps={{ paper: { sx: { width: 200, mt: 1 } } }}
            >
                <MenuItem onClick={() => { setProfileAnchor(null); onProfileClick?.(); }}>
                    <ListItemIcon><PersonOutlineIcon fontSize="small" /></ListItemIcon>
                    Profile
                </MenuItem>
                <Divider />
                <MenuItem onClick={() => { setProfileAnchor(null); onLogout?.(); }} sx={{ color: 'error.main' }}>
                    <ListItemIcon><LogoutIcon fontSize="small" sx={{ color: 'error.main' }} /></ListItemIcon>
                    Logout
                </MenuItem>
            </Menu>

            {/* Notifications dropdown */}
            <Menu
                anchorEl={notifAnchor}
                open={Boolean(notifAnchor)}
                onClose={() => setNotifAnchor(null)}
                transformOrigin={{ horizontal: 'right', vertical: 'top' }}
                anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
                slotProps={{ paper: { sx: { width: 320, maxHeight: 400, mt: 1 } } }}
            >
                <Box sx={{ px: 2, py: 1.5 }}>
                    <Typography variant="subtitle1" fontWeight={600}>Notifications</Typography>
                </Box>
                <Divider />
                {notifications.length === 0 ? (
                    <MenuItem disabled>
                        <Typography variant="body2" color="text.secondary">No new notifications</Typography>
                    </MenuItem>
                ) : (
                    notifications.slice(0, 10).map((n, i) => (
                        <MenuItem key={n.id || i} onClick={() => { setNotifAnchor(null); onNotificationClick?.(n); }} sx={{ whiteSpace: 'normal', py: 1.5 }}>
                            <Box>
                                <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>{n.message}</Typography>
                                {n.time && <Typography variant="caption" color="text.secondary">{n.time}</Typography>}
                            </Box>
                        </MenuItem>
                    ))
                )}
            </Menu>
        </Box>
    );
}
