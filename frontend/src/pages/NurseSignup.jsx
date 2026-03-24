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

// Icons
import MedicalInformationIcon from '@mui/icons-material/MedicalInformation';

const NurseSignup = () => {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({});
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
            const res = await fetch(`${API_BASE}/auth/nurse/signup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            const data = await res.json();
            if (data.success) {
                setStatus({ type: 'success', msg: 'Registration successful! Redirecting...' });
                setTimeout(() => navigate('/'), 2000);
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
                background: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)',
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
                        borderColor: 'primary.main'
                    }}
                >
                    <Avatar sx={{ m: '0 auto 24px', bgcolor: 'primary.main', width: 64, height: 64 }}>
                        <MedicalInformationIcon fontSize="large" />
                    </Avatar>

                    <Typography variant="h4" fontWeight={900} gutterBottom sx={{ letterSpacing: -1 }}>
                        Nurse Registration
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
                        Join the clinical orchestration network and deliver exceptional patient care.
                    </Typography>

                    {status.msg && <Alert severity={status.type} sx={{ mb: 3, textAlign: 'left' }}>{status.msg}</Alert>}

                    <Box component="form" onSubmit={handleSubmit} noValidate>
                        <Grid container spacing={2.5}>
                            <Grid item xs={12} sm={6}>
                                <TextField fullWidth label="Full Name" name="full_name" onChange={handleChange} required />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField fullWidth label="Employee ID" name="employee_id" onChange={handleChange} required placeholder="NS-2024-001" />
                            </Grid>
                            <Grid item xs={12}>
                                <TextField fullWidth label="Corporate Email" name="email" type="email" onChange={handleChange} required />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField fullWidth label="Password" name="password" type="password" onChange={handleChange} required autoComplete="new-password" />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField fullWidth label="Confirm Password" name="confirm_password" type="password" onChange={handleChange} required autoComplete="new-password" />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField fullWidth label="Department" name="department" onChange={handleChange} placeholder="e.g. ICU" />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField fullWidth label="Phone Number" name="phone" onChange={handleChange} />
                            </Grid>
                        </Grid>

                        <Button 
                            type="submit" 
                            fullWidth 
                            variant="contained" 
                            size="large"
                            disabled={loading}
                            sx={{ mt: 5, py: 1.8, borderRadius: 2, fontWeight: 700, fontSize: '1rem', textTransform: 'none', bgcolor: '#1e3a8a', '&:hover': { bgcolor: '#172554' } }}
                        >
                            {loading ? <CircularProgress size={24} color="inherit" /> : 'Create Nursing Workspace'}
                        </Button>

                        <Box sx={{ mt: 4 }}>
                            <Typography variant="body2" color="text.secondary">
                                Already registered?{' '}
                                <Link component={RouterLink} to="/" fontWeight={700} underline="hover" color="primary">
                                    Login here
                                </Link>
                            </Typography>
                        </Box>
                    </Box>
                </Paper>
            </Container>
        </Box>
    );
};

export default NurseSignup;