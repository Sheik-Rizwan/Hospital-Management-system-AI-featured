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
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';

// Icons
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

const VendorSignup = () => {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        company_name: '',
        email: '',
        password: '',
        confirm_password: '',
        category: 'general',
        contact_person: '',
        phone: '',
        address: '',
        gst_number: ''
    });
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState({ type: '', msg: '' });

    const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

    const handleSubmit = async (e) => {
        e.preventDefault();
        setStatus({ type: '', msg: '' });

        if(formData.password !== formData.confirm_password) {
            setStatus({ type: 'error', msg: "Passwords do not match" });
            return;
        }

        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/auth/vendor/signup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            const data = await res.json();
            if (data.success) {
                setStatus({ type: 'success', msg: 'Registration successful! Awaiting administrative approval. Redirecting...' });
                setTimeout(() => navigate('/vendor-login'), 3000);
            } else {
                setStatus({ type: 'error', msg: data.error || 'Registration failed' });
            }
        } catch (error) {
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
                background: 'linear-gradient(135deg, #064e3b 0%, #059669 100%)',
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
                    elevation={12} 
                    sx={{ 
                        p: { xs: 4, md: 6 }, 
                        borderRadius: 5,
                        bgcolor: 'background.paper',
                        textAlign: 'center',
                        borderBottom: 8,
                        borderColor: 'success.main'
                    }}
                >
                    <Avatar sx={{ m: '0 auto 24px', bgcolor: 'success.main', width: 64, height: 64 }}>
                        <LocalShippingIcon fontSize="large" />
                    </Avatar>

                    <Typography variant="h4" fontWeight={900} gutterBottom sx={{ letterSpacing: -1 }}>
                        Vendor registration
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
                        Join the clinical supply chain and expand your business impact.
                    </Typography>

                    <Alert severity="info" icon={<InfoOutlinedIcon />} sx={{ mb: 4, textAlign: 'left' }}>
                        All vendor applications are subject to a standard 24-48 hour verification period before activation.
                    </Alert>

                    {status.msg && <Alert severity={status.type} sx={{ mb: 3, textAlign: 'left' }}>{status.msg}</Alert>}

                    <Box component="form" onSubmit={handleSubmit} noValidate>
                        <Grid container spacing={2.5}>
                            <Grid item xs={12} sm={6}>
                                <TextField fullWidth label="Company Name" name="company_name" onChange={handleChange} required />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <FormControl fullWidth required>
                                    <InputLabel>Category</InputLabel>
                                    <Select name="category" value={formData.category} label="Category" onChange={handleChange}>
                                        <MenuItem value="general">General Supplies</MenuItem>
                                        <MenuItem value="medicines">Medicines</MenuItem>
                                        <MenuItem value="equipment">Medical Equipment</MenuItem>
                                        <MenuItem value="lab">Lab Supplies</MenuItem>
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12}>
                                <TextField fullWidth label="Contact Email" name="email" type="email" onChange={handleChange} required />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField fullWidth label="Password" name="password" type="password" onChange={handleChange} required autoComplete="new-password" />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField fullWidth label="Confirm Password" name="confirm_password" type="password" onChange={handleChange} required autoComplete="new-password" />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField fullWidth label="Contact Person" name="contact_person" onChange={handleChange} />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField fullWidth label="Phone Number" name="phone" onChange={handleChange} />
                            </Grid>
                            <Grid item xs={12}>
                                <TextField fullWidth label="GST/Tax ID" name="gst_number" onChange={handleChange} placeholder="TRN or License Number" />
                            </Grid>
                        </Grid>

                        <Button 
                            type="submit" 
                            fullWidth 
                            variant="contained" 
                            size="large"
                            disabled={loading}
                            color="success"
                            sx={{ mt: 5, py: 1.8, borderRadius: 2, fontWeight: 700, fontSize: '1rem', textTransform: 'none' }}
                        >
                            {loading ? <CircularProgress size={24} color="inherit" /> : 'Register Supply Channel'}
                        </Button>

                        <Box sx={{ mt: 4 }}>
                            <Typography variant="body2" color="text.secondary">
                                Already registered?{' '}
                                <Link component={RouterLink} to="/vendor-login" fontWeight={700} underline="hover" color="success">
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
                        Back to Portal Select
                    </Button>
                </Box>
            </Container>
        </Box>
    );
};

export default VendorSignup;
