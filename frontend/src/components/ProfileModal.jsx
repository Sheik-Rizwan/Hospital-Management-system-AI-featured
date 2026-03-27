import React, { useState, useEffect } from 'react';
import { API_BASE, getAuthHeaders } from '../utils/api';

// MUI Components
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';

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
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Avatar from '@mui/material/Avatar';
import Stack from '@mui/material/Stack';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Alert from '@mui/material/Alert';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';

// Icons
import CloseIcon from '@mui/icons-material/Close';
import PersonIcon from '@mui/icons-material/Person';
import LockIcon from '@mui/icons-material/Lock';
import SaveIcon from '@mui/icons-material/Save';

const ProfileModal = ({ isOpen, onClose, user, onUpdate }) => {
    const [formData, setFormData] = useState({
        full_name: '',
        email: '',
        phone: '',
        department: '',
        specialization: ''
    });
    const [passwordData, setPasswordData] = useState({
        current_password: '',
        new_password: '',
        confirm_password: ''
    });
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState({ text: '', type: '' });
    const [activeTab, setActiveTab] = useState(0); // 0: profile, 1: password

    useEffect(() => {
        if (isOpen && user) {
            setFormData({
                full_name: user.full_name || user.patient_name || '',
                email: user.email || '',
                phone: user.phone || '',
                department: user.department || '',
                specialization: user.specialization || ''
            });
        }
    }, [isOpen, user?.user_id]);

    const handleProfileUpdate = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage({ text: '', type: '' });

        try {
            const payload = { ...formData };
            if (user.role === 'patient' && payload.full_name) {
                payload.patient_name = payload.full_name;
            }
            const res = await fetch(`${API_BASE}/user/profile`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (data.success) {
                setMessage({ text: 'Profile updated successfully!', type: 'success' });
                const updatedUser = data.user ? { ...user, ...data.user } : { ...user, ...formData };
                sessionStorage.setItem('user', JSON.stringify(updatedUser));
                const role = updatedUser.role || user.role;
                if (role) {
                    sessionStorage.setItem(`${role}_user`, JSON.stringify(updatedUser));
                }
                if (onUpdate) onUpdate(updatedUser);
            } else {
                setMessage({ text: data.error || 'Update failed', type: 'error' });
            }
        } catch (e) {
            setMessage({ text: 'Network error', type: 'error' });
        }
        setLoading(false);
    };

    const handlePasswordChange = async (e) => {
        e.preventDefault();
        if (passwordData.new_password !== passwordData.confirm_password) {
            setMessage({ text: 'Passwords do not match', type: 'error' });
            return;
        }
        if (passwordData.new_password.length < 6) {
            setMessage({ text: 'Password must be at least 6 characters', type: 'error' });
            return;
        }

        setLoading(true);
        setMessage({ text: '', type: '' });

        try {
            const res = await fetch(`${API_BASE}/user/password`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    current_password: passwordData.current_password,
                    new_password: passwordData.new_password
                })
            });
            const data = await res.json();

            if (data.success) {
                setMessage({ text: 'Password changed successfully!', type: 'success' });
                setPasswordData({ current_password: '', new_password: '', confirm_password: '' });
            } else {
                setMessage({ text: data.error || 'Password change failed', type: 'error' });
            }
        } catch (e) {
            setMessage({ text: 'Network error', type: 'error' });
        }
        setLoading(false);
    };

    return (
        <Dialog 
            open={isOpen} 
            onClose={onClose} 
            maxWidth="xs" 
            fullWidth
            PaperProps={{
                sx: { 
                    borderRadius: 4,
                    overflow: 'hidden',
                    bgcolor: 'background.paper'
                }
            }}
        >
            {/* Header with Gradient */}
            <Box sx={{ 
                background: 'linear-gradient(135deg, #0d9488 0%, #2563eb 100%)', 
                p: 3, 
                color: 'white',
                position: 'relative'
            }}>
                <IconButton 
                    onClick={onClose} 
                    sx={{ position: 'absolute', top: 12, right: 12, color: 'white' }}
                >
                    <CloseIcon />
                </IconButton>

                <Stack direction="row" spacing={2} alignItems="center">
                    <Avatar 
                        sx={{ 
                            width: 64, 
                            height: 64, 
                            bgcolor: 'rgba(255,255,255,0.2)', 
                            fontSize: '1.5rem', 
                            fontWeight: 700,
                            border: '2px solid rgba(255,255,255,0.3)'
                        }}
                    >
                        {(formData.full_name || 'U')[0].toUpperCase()}
                    </Avatar>
                    <Box>
                        <Typography variant="h6" fontWeight={800}>
                            {(user?.role === 'doctor' ? 'Dr. ' : '') + (formData.full_name || 'User')}
                        </Typography>
                        <Typography variant="body2" sx={{ opacity: 0.8, textTransform: 'capitalize' }}>
                            {user?.role === 'doctor' 
                                ? `${formData.specialization || 'General'} Specialist` 
                                : user?.role || 'User'}
                        </Typography>
                    </Box>
                </Stack>
            </Box>

            <Tabs 
                value={activeTab} 
                onChange={(e, val) => { setActiveTab(val); setMessage({ text: '', type: '' }); }}
                variant="fullWidth"
                sx={{ borderBottom: 1, borderColor: 'divider' }}
            >
                <Tab icon={<PersonIcon />} iconPosition="start" label="Profile" />
                <Tab icon={<LockIcon />} iconPosition="start" label="Security" />
            </Tabs>

            <DialogContent sx={{ p: 3 }}>
                {message.text && (
                    <Alert severity={message.type} sx={{ mb: 3 }}>
                        {message.text}
                    </Alert>
                )}

                {activeTab === 0 ? (
                    <Box component="form" onSubmit={handleProfileUpdate} noValidate>
                        <Stack spacing={2.5}>
                            <TextField 
                                fullWidth 
                                label="Full Name" 
                                value={formData.full_name} 
                                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })} 
                                required 
                            />
                            <TextField 
                                fullWidth 
                                label="Email Address" 
                                type="email" 
                                value={formData.email} 
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })} 
                                required 
                            />
                            <TextField 
                                fullWidth 
                                label="Phone Number" 
                                value={formData.phone} 
                                onChange={(e) => setFormData({ ...formData, phone: e.target.value })} 
                            />
                            <TextField 
                                fullWidth 
                                label={user?.role === 'doctor' ? 'Specialization' : 'Department'} 
                                value={user?.role === 'doctor' ? formData.specialization : formData.department} 
                                onChange={(e) => setFormData({ 
                                    ...formData, 
                                    [user?.role === 'doctor' ? 'specialization' : 'department']: e.target.value 
                                })} 
                            />
                            <Button 
                                type="submit" 
                                variant="contained" 
                                size="large" 
                                disabled={loading}
                                startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
                                sx={{ py: 1.5, mt: 1, borderRadius: 2, fontWeight: 700 }}
                            >
                                {loading ? 'Saving Changes...' : 'Save Profile'}
                            </Button>
                        </Stack>
                    </Box>
                ) : (
                    <Box component="form" onSubmit={handlePasswordChange} noValidate>
                        <Stack spacing={2.5}>
                            <TextField 
                                fullWidth 
                                label="Current Password" 
                                type="password" 
                                value={passwordData.current_password} 
                                onChange={(e) => setPasswordData({ ...passwordData, current_password: e.target.value })} 
                                required 
                                autoComplete="current-password"
                            />
                            <Divider sx={{ my: 1 }} />
                            <TextField 
                                fullWidth 
                                label="New Password" 
                                type="password" 
                                value={passwordData.new_password} 
                                onChange={(e) => setPasswordData({ ...passwordData, new_password: e.target.value })} 
                                required 
                                autoComplete="new-password"
                                helperText="Minimum 6 characters"
                            />
                            <TextField 
                                fullWidth 
                                label="Confirm New Password" 
                                type="password" 
                                value={passwordData.confirm_password} 
                                onChange={(e) => setPasswordData({ ...passwordData, confirm_password: e.target.value })} 
                                required 
                                autoComplete="new-password"
                            />
                            <Button 
                                type="submit" 
                                variant="contained" 
                                color="secondary"
                                size="large" 
                                disabled={loading}
                                startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <LockIcon />}
                                sx={{ py: 1.5, mt: 1, borderRadius: 2, fontWeight: 700 }}
                            >
                                {loading ? 'Updating...' : 'Update Password'}
                            </Button>
                        </Stack>
                    </Box>
                )}
            </DialogContent>
        </Dialog>
    );
};
export default ProfileModal;
