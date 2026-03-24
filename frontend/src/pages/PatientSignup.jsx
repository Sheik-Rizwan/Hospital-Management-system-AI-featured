import React, { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { API_BASE } from '../utils/api';
import ThemeToggle from '../components/ThemeToggle';

// MUI Components
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
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';

// Icons
import FavoriteIcon from '@mui/icons-material/Favorite';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

const PatientSignup = () => {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        patient_id: '',
        patient_name: '',
        date_of_birth: '',
        gender: '',
        password: '',
        confirm_password: '',
        email: '',
        phone: '',
        admission_date: '',
        room_number: '',
        diagnosis: '',
        terms: false
    });
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState({ type: '', msg: '' });

    const handleChange = (e) => {
        const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        setFormData({ ...formData, [e.target.name]: value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setStatus({ type: '', msg: '' });

        if (formData.password !== formData.confirm_password) {
            setStatus({ type: 'error', msg: "Passwords do not match!" });
            return;
        }

        if (!formData.terms) {
            setStatus({ type: 'warning', msg: "You must agree to the Terms of Service." });
            return;
        }

        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/auth/patient/signup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            const data = await res.json();

            if (data.success) {
                setStatus({ type: 'success', msg: data.message || 'Account created successfully! Redirecting...' });
                setTimeout(() => navigate('/'), 2000);
            } else {
                setStatus({ type: 'error', msg: data.error || 'Signup failed' });
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
                background: 'linear-gradient(135deg, #065f46 0%, #10b981 100%)',
                p: 3,
                position: 'relative'
            }}
        >
            {/* Header Icons */}
            <Box sx={{ position: 'absolute', top: 24, right: 24, display: 'flex', alignItems: 'center', gap: 2 }}>
                <ThemeToggle />
                <Box component="img" src="/logo.png" sx={{ height: 32, opacity: 0.9 }} />
            </Box>

            <Container maxWidth="md">
                <Paper 
                    elevation={12} 
                    sx={{ 
                        p: { xs: 4, md: 6 }, 
                        borderRadius: 6,
                        bgcolor: 'background.paper',
                        textAlign: 'center',
                        position: 'relative',
                        overflow: 'hidden'
                    }}
                >
                    <Box sx={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: 8, bgcolor: '#10b981' }} />
                    
                    <Avatar sx={{ m: '0 auto 24px', bgcolor: '#10b981', width: 64, height: 64 }}>
                        <FavoriteIcon fontSize="large" />
                    </Avatar>

                    <Typography variant="h4" fontWeight={900} gutterBottom sx={{ letterSpacing: -1 }}>
                        Patient Registration
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
                        Create your medical identity to access your health transformation journey.
                    </Typography>

                    {status.msg && <Alert severity={status.type} sx={{ mb: 4, textAlign: 'left' }}>{status.msg}</Alert>}

                    <Box component="form" onSubmit={handleSubmit} noValidate>
                        <Grid container spacing={3}>
                            <Grid item xs={12} sm={6}>
                                <TextField fullWidth label="Patient ID" name="patient_id" value={formData.patient_id} onChange={handleChange} required placeholder="e.g. P001" />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField fullWidth label="Full Name" name="patient_name" value={formData.patient_name} onChange={handleChange} required />
                            </Grid>
                            
                            <Grid item xs={12} sm={6}>
                                <TextField fullWidth label="Date of Birth" name="date_of_birth" type="date" value={formData.date_of_birth} onChange={handleChange} required InputLabelProps={{ shrink: true }} />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <FormControl fullWidth required>
                                    <InputLabel>Gender</InputLabel>
                                    <Select name="gender" value={formData.gender} label="Gender" onChange={handleChange}>
                                        <MenuItem value="Male">Male</MenuItem>
                                        <MenuItem value="Female">Female</MenuItem>
                                        <MenuItem value="Other">Other</MenuItem>
                                    </Select>
                                </FormControl>
                            </Grid>

                            <Grid item xs={12} sm={6}>
                                <TextField fullWidth label="Password" name="password" type="password" value={formData.password} onChange={handleChange} required autoComplete="new-password" />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField fullWidth label="Confirm Password" name="confirm_password" type="password" value={formData.confirm_password} onChange={handleChange} required autoComplete="new-password" />
                            </Grid>

                            <Grid item xs={12} sm={6}>
                                <TextField fullWidth label="Email Address" name="email" type="email" value={formData.email} onChange={handleChange} placeholder="Optional" />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField fullWidth label="Phone Number" name="phone" value={formData.phone} onChange={handleChange} placeholder="Optional" />
                            </Grid>

                            <Grid item xs={12} sm={6}>
                                <TextField fullWidth label="Admission Date" name="admission_date" type="date" value={formData.admission_date} onChange={handleChange} required InputLabelProps={{ shrink: true }} />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField fullWidth label="Room Number" name="room_number" value={formData.room_number} onChange={handleChange} placeholder="e.g. 101-A" />
                            </Grid>

                            <Grid item xs={12}>
                                <TextField fullWidth label="Primary Diagnosis" name="diagnosis" value={formData.diagnosis} onChange={handleChange} multiline rows={3} placeholder="Initial assessment notes..." />
                            </Grid>

                            <Grid item xs={12}>
                                <FormControlLabel
                                    control={<Checkbox name="terms" checked={formData.terms} onChange={handleChange} color="primary" />}
                                    label={
                                        <Typography variant="body2" color="text.secondary">
                                            I agree to the <Link color="primary" underline="hover">Terms of Service</Link> and <Link color="primary" underline="hover">Privacy Policy</Link>
                                        </Typography>
                                    }
                                    sx={{ textAlign: 'left', width: '100%' }}
                                />
                            </Grid>
                        </Grid>

                        <Button 
                            type="submit" 
                            fullWidth 
                            variant="contained" 
                            size="large"
                            disabled={loading}
                            sx={{ mt: 5, py: 1.8, borderRadius: 2, fontWeight: 700, fontSize: '1rem', textTransform: 'none', bgcolor: '#065f46', '&:hover': { bgcolor: '#064e3b' } }}
                        >
                            {loading ? <CircularProgress size={24} color="inherit" /> : 'Activate Patient Account'}
                        </Button>

                        <Stack direction="row" spacing={1} justifyContent="center" sx={{ mt: 4 }}>
                            <Typography variant="body2" color="text.secondary">Already have an account?</Typography>
                            <Link component={RouterLink} to="/" fontWeight={700} underline="hover" color="primary">Login here</Link>
                        </Stack>
                    </Box>
                </Paper>

                <Box sx={{ mt: 4, textAlign: 'center' }}>
                    <Button 
                        startIcon={<ArrowBackIcon />} 
                        component={RouterLink} 
                        to="/" 
                        sx={{ color: 'white', opacity: 0.8, '&:hover': { opacity: 1 } }}
                    >
                        Back to Identity Portal
                    </Button>
                </Box>
            </Container>
        </Box>
    );
};

export default PatientSignup;