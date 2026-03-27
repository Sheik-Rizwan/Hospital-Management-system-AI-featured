import React, { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { API_BASE } from '../utils/api';
import ThemeToggle from '../components/ThemeToggle';

// MUI Components

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
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Link from '@mui/material/Link';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Avatar from '@mui/material/Avatar';
import Tooltip from '@mui/material/Tooltip';

// Icons
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

const SuperAdminSignup = () => {
    const [formData, setFormData] = useState({
        full_name: '',
        email: '',
        invite_code: '',
        password: '',
        confirmPassword: ''
    });
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState({ type: '', msg: '' });
    const navigate = useNavigate();

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setStatus({ type: '', msg: '' });

        if (formData.password !== formData.confirmPassword) {
            setStatus({ type: 'error', msg: 'Passwords do not match' });
            return;
        }

        if (formData.password.length < 6) {
            setStatus({ type: 'error', msg: 'Password must be at least 6 characters' });
            return;
        }

        setLoading(true);

        try {
            const res = await fetch(`${API_BASE}/auth/superadmin/signup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: formData.email,
                    password: formData.password,
                    full_name: formData.full_name,
                    invite_code: formData.invite_code
                })
            });

            const data = await res.json();

            if (data.success) {
                setStatus({ type: 'success', msg: 'Admin account created! Redirecting to login...' });
                setTimeout(() => navigate('/'), 2000);
            } else {
                setStatus({ type: 'error', msg: data.error || 'Registration failed' });
            }
        } catch (err) {
            setStatus({ type: 'error', msg: 'Network error. Please try again.' });
        }

        setLoading(false);
    };

    return (
        <Box 
            sx={{ 
                minHeight: '100vh', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                background: 'linear-gradient(135deg, #450a0a 0%, #991b1b 100%)',
                p: 3,
                position: 'relative'
            }}
        >
            {/* Header Icons */}
            <Box sx={{ position: 'absolute', top: 24, right: 24, display: 'flex', alignItems: 'center', gap: 2 }}>
                <ThemeToggle />
                <Box component="img" src="/logo.png" sx={{ height: 32, opacity: 0.9 }} />
            </Box>

            <Container maxWidth="sm">
                <Paper 
                    elevation={24} 
                    sx={{ 
                        p: { xs: 4, md: 6 }, 
                        borderRadius: 5,
                        bgcolor: 'background.paper',
                        textAlign: 'center',
                        borderBottom: 8,
                        borderColor: 'error.main'
                    }}
                >
                    <Avatar sx={{ m: '0 auto 24px', bgcolor: 'error.main', width: 64, height: 64 }}>
                        <AdminPanelSettingsIcon fontSize="large" />
                    </Avatar>

                    <Typography variant="h4" fontWeight={900} gutterBottom sx={{ letterSpacing: -1 }}>
                        Admin Registration
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
                        Establish a high-level administrative presence in the clinical workspace.
                    </Typography>

                    <Alert severity="warning" icon={<InfoOutlinedIcon />} sx={{ mb: 4, textAlign: 'left', bgcolor: 'rgba(237, 108, 2, 0.05)' }}>
                        System security requires a verified invite code for all administrative enrollments.
                    </Alert>

                    {status.msg && <Alert severity={status.type} sx={{ mb: 4, textAlign: 'left' }}>{status.msg}</Alert>}

                    <Box component="form" onSubmit={handleSubmit} noValidate>
                        <Stack spacing={2.5}>
                            <TextField fullWidth label="Full Name" name="full_name" value={formData.full_name} onChange={handleChange} required />
                            <TextField fullWidth label="Corporate Email" name="email" type="email" value={formData.email} onChange={handleChange} required />
                            <TextField 
                                fullWidth 
                                label="Invite Code" 
                                name="invite_code" 
                                value={formData.invite_code} 
                                onChange={handleChange} 
                                required 
                                placeholder="Enter secure code"
                                InputProps={{ endAdornment: <Tooltip title="Contact system owner for a code"><InfoOutlinedIcon sx={{ color: 'text.disabled', fontSize: 20 }} /></Tooltip> }}
                            />
                            
                            <Grid container spacing={2}>
                                <Grid item xs={12} sm={6}>
                                    <TextField fullWidth label="Password" name="password" type="password" value={formData.password} onChange={handleChange} required autoComplete="new-password" />
                                </Grid>
                                <Grid item xs={12} sm={6}>
                                    <TextField fullWidth label="Confirm Password" name="confirmPassword" type="password" value={formData.confirmPassword} onChange={handleChange} required autoComplete="new-password" />
                                </Grid>
                            </Grid>

                            <Button 
                                type="submit" 
                                fullWidth 
                                variant="contained" 
                                size="large"
                                disabled={loading}
                                color="error"
                                sx={{ mt: 2, py: 1.8, borderRadius: 2, fontWeight: 700, fontSize: '1rem', textTransform: 'none', boxShadow: 3 }}
                            >
                                {loading ? <CircularProgress size={24} color="inherit" /> : 'Establish Admin Identity'}
                            </Button>
                        </Stack>

                        <Box sx={{ mt: 4 }}>
                            <Typography variant="body2" color="text.secondary">
                                Already have an account?{' '}
                                <Link component={RouterLink} to="/" fontWeight={700} underline="hover" color="error">
                                    Login here
                                </Link>
                            </Typography>
                        </Box>
                    </Box>
                </Paper>

                <Box sx={{ mt: 4, textAlign: 'center' }}>
                    <Button 
                        startIcon={<ArrowBackIcon />} 
                        component={RouterLink} 
                        to="/" 
                        sx={{ color: 'white', opacity: 0.8, '&:hover': { opacity: 1 } }}
                    >
                        Return to Gateway
                    </Button>
                </Box>
            </Container>
        </Box>
    );
};

export default SuperAdminSignup;
