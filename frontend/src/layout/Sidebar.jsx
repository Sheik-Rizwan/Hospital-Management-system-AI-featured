import { useState } from 'react';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import MailOutlinedIcon from '@mui/icons-material/MailOutlined';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import Avatar from '@mui/material/Avatar';
import IconButton from '@mui/material/IconButton';
import Badge from '@mui/material/Badge';
import Tooltip from '@mui/material/Tooltip';
import LogoutIcon from '@mui/icons-material/LogoutOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import MenuIcon from '@mui/icons-material/Menu';

const DRAWER_WIDTH = 260;

export default function Sidebar({ items, title, activeId, onSelect, user, onLogout, onProfile, badge }) {
    return (
        <Box sx={{ width: DRAWER_WIDTH, flexShrink: 0, display: 'flex', flexDirection: 'column', height: '100%', borderRight: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
            {/* Header */}
            <Box sx={{ p: 2.5, borderBottom: 1, borderColor: 'divider' }}>
                <Typography variant="h5" fontWeight={700} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {title}
                </Typography>
                {user?.full_name && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {user.full_name}
                    </Typography>
                )}
                {user?.company_name && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <BusinessOutlinedIcon sx={{ fontSize: 14, mr: 0.5, verticalAlign: 'middle' }} /> {user.company_name}
                    </Typography>
                )}
                {user?.email && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <MailOutlinedIcon sx={{ fontSize: 14, mr: 0.5, verticalAlign: 'middle' }} /> {user.email}
                    </Typography>
                )}
            </Box>

            {/* Navigation */}
            <Box sx={{ flex: 1, overflowY: 'auto', px: 1, py: 2 }}>
                <List disablePadding>
                    {items.map((section, sIdx) => (
                        <Box key={sIdx}>
                            {section.label && (
                                <Typography variant="caption" color="text.secondary" sx={{ px: 2, py: 1, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                                    {section.label}
                                </Typography>
                            )}
                            {section.items.map((item) => (
                                <ListItemButton
                                    key={item.id}
                                    selected={activeId === item.id}
                                    onClick={() => onSelect(item.id)}
                                    sx={{ borderRadius: 1, mx: 0.5, mb: 0.25 }}
                                >
                                    <ListItemIcon sx={{ minWidth: 36, fontSize: '1.2rem' }}>{item.icon}</ListItemIcon>
                                    <ListItemText primary={item.label} primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: activeId === item.id ? 600 : 400 }} />
                                    {item.badge > 0 && (
                                        <Badge badgeContent={item.badge} color="warning" sx={{ mr: 1 }} />
                                    )}
                                </ListItemButton>
                            ))}
                            {sIdx < items.length - 1 && <Divider sx={{ my: 1.5 }} />}
                        </Box>
                    ))}
                </List>
            </Box>

            {/* Footer */}
            <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
                {onProfile && (
                    <Tooltip title="Profile">
                        <IconButton size="small" onClick={onProfile} sx={{ color: 'text.secondary' }}>
                            <PersonOutlineIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                )}
                <Tooltip title="Logout">
                    <IconButton size="small" onClick={onLogout} sx={{ color: 'error.main' }}>
                        <LogoutIcon fontSize="small" />
                    </IconButton>
                </Tooltip>
            </Box>
        </Box>
    );
}
