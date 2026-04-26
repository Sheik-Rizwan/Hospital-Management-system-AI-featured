import React, { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { API_BASE } from '../utils/api';
import ThemeToggle from '../components/ThemeToggle';

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
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

/**
 * GenericSignup — Reusable, config-driven signup form.
 *
 * Props:
 *   roleConfig: {
 *     key: string,           // 'lab_technician'
 *     title: string,         // 'Lab Technician Registration'
 *     subtitle: string,      // 'Join the clinical lab team'
 *     color: string,         // '#06B6D4'
 *     gradient: string,      // 'linear-gradient(135deg, #0e7490 0%, #06B6D4 100%)'
 *     icon: ReactNode,       // <ScienceIcon />
 *     endpoint: string,      // '/auth/lab/signup'
 *     fields: [              // extra fields beyond email/password/name
 *       { name: 'employee_id', label: 'Employee ID', required: true },
 *       ...
 *     ]
 *   }
 */
const GenericSignup = ({ roleConfig }) => {
    const { key, title, subtitle, color, gradient, icon, endpoint, fields = [] } = roleConfig;

    const allFields = [
        { name: 'full_name', label: 'Full Name', required: true },
        { name: 'email', label: 'Email', type: 'email', required: true },
        { name: 'phone', label: 'Phone', required: false },
        ...fields,
        { name: 'password', label: 'Password', type: 'password', required: true, autoComplete: 'new-password' },
        { name: 'confirmPassword', label: 'Confirm Password', type: 'password', required: true, autoComplete: 'new-password' },
    ];

    const initialForm = {};
    allFields.forEach(f => { initialForm[f.name] = ''; });

    const [formData, setFormData] = useState(initialForm);
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
            const body = { ...formData };
            delete body.confirmPassword;

            const res = await fetch(`${API_BASE}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await res.json();

            if (data.success) {
                setStatus({ type: 'success', msg: `${title} account created! Redirecting to login...` });
                setTimeout(() => navigate('/'), 2000);
            } else {
                setStatus({ type: 'error', msg: data.error || 'Registration failed' });
            }
        } catch {
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
                background: gradient || `linear-gradient(135deg, ${color}88 0%, ${color} 100%)`,
                p: 3,
                position: 'relative',
            }}
        >
            <Box sx={{ position: 'absolute', top: 24, right: 24, display: 'flex', alignItems: 'center', gap: 2 }}>
                <ThemeToggle />
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
                        borderColor: color,
                    }}
                >
                    <Avatar sx={{ m: '0 auto 24px', bgcolor: color, width: 64, height: 64 }}>
                        {icon}
                    </Avatar>

                    <Typography variant="h4" fontWeight={900} gutterBottom sx={{ letterSpacing: -1 }}>
                        {title}
                    </Typography>
                    {subtitle && (
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
                            {subtitle}
                        </Typography>
                    )}

                    {status.msg && <Alert severity={status.type} sx={{ mb: 3, textAlign: 'left' }}>{status.msg}</Alert>}

                    <Box component="form" onSubmit={handleSubmit} noValidate>
                        <Stack spacing={2.5}>
                            {allFields.map((field) => (
                                <TextField
                                    key={field.name}
                                    fullWidth
                                    label={field.label}
                                    name={field.name}
                                    type={field.type || 'text'}
                                    value={formData[field.name] || ''}
                                    onChange={handleChange}
                                    required={field.required}
                                    autoComplete={field.autoComplete || 'off'}
                                    select={!!field.options}
                                    SelectProps={field.options ? { native: true } : undefined}
                                >
                                    {field.options && field.options.map(opt => (
                                        <option key={opt} value={opt}>{opt}</option>
                                    ))}
                                </TextField>
                            ))}

                            <Button
                                type="submit"
                                fullWidth
                                variant="contained"
                                size="large"
                                disabled={loading}
                                sx={{
                                    mt: 2, py: 1.8, borderRadius: 2, fontWeight: 700,
                                    fontSize: '1rem', textTransform: 'none', boxShadow: 3,
                                    bgcolor: color, '&:hover': { bgcolor: color, filter: 'brightness(0.9)' },
                                }}
                            >
                                {loading ? <CircularProgress size={24} color="inherit" /> : 'Create Account'}
                            </Button>
                        </Stack>

                        <Box sx={{ mt: 4 }}>
                            <Typography variant="body2" color="text.secondary">
                                Already have an account?{' '}
                                <Link component={RouterLink} to="/" fontWeight={700} underline="hover" sx={{ color }}>
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
                        Return to Login
                    </Button>
                </Box>
            </Container>
        </Box>
    );
};

export default GenericSignup;
