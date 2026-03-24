import React, { useState } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { API_BASE, setRoleAuth } from '../utils/api';
import ThemeToggle from '../components/ThemeToggle';

// MUI Components
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardActionArea from '@mui/material/CardActionArea';
import TextField from '@mui/material/TextField';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Stack from '@mui/material/Stack';
import Avatar from '@mui/material/Avatar';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Tooltip from '@mui/material/Tooltip';

// Icons
import CloseIcon from '@mui/icons-material/Close';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import PeopleIcon from '@mui/icons-material/People';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import VpnKeyIcon from '@mui/icons-material/VpnKey';

const ROLES = [
    { key: 'nurse', title: 'Nurse', desc: 'Clinical Care & Vitals', icon: <MedicalServicesIcon />, color: '#3B82F6' },
    { key: 'doctor', title: 'Doctor', desc: 'Expert Clinical Overview', icon: <LocalHospitalIcon />, color: '#8B5CF6' },
    { key: 'patient', title: 'Patient', desc: 'Access Your Health Records', icon: <PeopleIcon />, color: '#10B981' },
    { key: 'super_admin', title: 'Admin', desc: 'Environment Management', icon: <AdminPanelSettingsIcon />, color: '#EF4444' },
    { key: 'vendor', title: 'Vendor', desc: 'Supply Chain Operations', icon: <LocalShippingIcon />, color: '#F59E0B' }
];

const Login = () => {
    const [selectedRole, setSelectedRole] = useState(null);
    const [showWhatsApp, setShowWhatsApp] = useState(false);
    const [whatsappPhone, setWhatsappPhone] = useState('');
    const [formData, setFormData] = useState({ email: '', password: '', patient_id: '' });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleLogin = async (e, forceType) => {
        if (e) e.preventDefault();
        setLoading(true);
        setError('');

        const type = forceType || selectedRole?.key;
        let endpoint = '';
        let payload = {};

        switch (type) {
            case 'nurse':
                endpoint = '/auth/nurse/login';
                payload = { email: formData.email, password: formData.password };
                break;
            case 'patient':
                endpoint = '/auth/patient/login';
                payload = { patient_id: formData.patient_id || formData.email, password: formData.password };
                break;
            case 'doctor':
                endpoint = '/auth/doctor/login';
                payload = { email: formData.email, password: formData.password };
                break;
            case 'super_admin':
                endpoint = '/auth/superadmin/login';
                payload = { email: formData.email, password: formData.password };
                break;
            case 'vendor':
                endpoint = '/vendor/login';
                payload = { email: formData.email, password: formData.password };
                break;
            default:
                setLoading(false);
                return;
        }

        try {
            const res = await fetch(`${API_BASE}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (data.success) {
                setRoleAuth(data.user.role, data.access_token, data.user);
                
                const dashboardMap = {
                    'nurse': '/nurse-dashboard',
                    'patient': '/patient-dashboard',
                    'doctor': '/doctor-dashboard',
                    'super_admin': '/admin-dashboard',
                    'vendor': '/vendor-dashboard'
                };
                navigate(dashboardMap[data.user.role] || '/');
            } else {
                setError(data.error || 'Identity verification failed');
            }
        } catch (err) {
            setError('System connectivity error. Please retry.');
        }
        setLoading(false);
    };

    const handleWhatsAppLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const res = await fetch(`${API_BASE}/auth/patient/whatsapp-login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: whatsappPhone })
            });
            const data = await res.json();

            if (data.success) {
                setRoleAuth(data.user.role, data.access_token, data.user);
                navigate('/patient-dashboard');
            } else {
                setError(data.error || 'Verified number not found');
            }
        } catch (err) {
            setError('Connectivity error. Please retry.');
        }
        setLoading(false);
    };

    const handleClose = () => {
        if (loading) return;
        setSelectedRole(null);
        setShowWhatsApp(false);
        setError('');
        setFormData({ email: '', password: '', patient_id: '' });
    };

    return (
        <Box 
            sx={{ 
                minHeight: '100vh', 
                background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)',
                color: 'white',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative'
            }}
        >
            {/* Navigation Header */}
            <Box sx={{ p: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Avatar sx={{ bgcolor: 'primary.main', width: 32, height: 32 }}>
                        <MedicalServicesIcon sx={{ fontSize: 18 }} />
                    </Avatar>
                    <Typography variant="h6" fontWeight={900} sx={{ letterSpacing: -0.5 }}>MedCore AI</Typography>
                </Box>
                <Stack direction="row" spacing={2} alignItems="center">
                    <ThemeToggle />
                    <Box component="img" src="/logo.png" sx={{ height: 32, opacity: 0.8 }} />
                </Stack>
            </Box>

            {/* Main Content */}
            <Container maxWidth="lg" sx={{ flex: 1, display: 'flex', alignItems: 'center', py: 6 }}>
                <Grid container spacing={8} alignItems="center">
                    <Grid item xs={12} lg={6}>
                        <Typography variant="overline" color="primary.light" sx={{ fontWeight: 800, letterSpacing: 3, mb: 1, display: 'block' }}>
                            NEXT-GEN HEALTHCARE OS
                        </Typography>
                        <Typography variant="h1" sx={{ fontWeight: 900, mb: 3, lineHeight: 1.1, fontSize: { xs: '3rem', md: '4.5rem' }, color: 'white' }}>
                            Clinical Intelligence <Box component="span" sx={{ color: 'primary.main' }}>Unleashed.</Box>
                        </Typography>
                        <Typography variant="h6" sx={{ color: 'rgba(255,255,255,0.7)', mb: 5, fontWeight: 400, maxWidth: 500 }}>
                            Empowering healthcare professionals with AI-driven workflows, patient insights, and seamless resource coordination.
                        </Typography>
                        
                        <Stack direction="row" spacing={3} sx={{ opacity: 0.6 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <VpnKeyIcon sx={{ fontSize: 16, color: 'white' }} />
                                <Typography variant="caption" sx={{ fontWeight: 700, color: 'white' }}>SECURE ACCESS</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <AdminPanelSettingsIcon sx={{ fontSize: 16, color: 'white' }} />
                                <Typography variant="caption" sx={{ fontWeight: 700, color: 'white' }}>HIPAA COMPLIANT</Typography>
                            </Box>
                        </Stack>
                    </Grid>

                    <Grid item xs={12} lg={6}>
                        <Box sx={{ p: { xs: 0, sm: 4 }, borderRadius: 6, bgcolor: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.1)' }}>
                            <Typography variant="h5" align="center" sx={{ fontWeight: 800, mb: 1, color: 'white' }}>Welcome Back</Typography>
                            <Typography variant="body2" align="center" sx={{ color: 'rgba(255, 255, 255, 0.6)', mb: 4 }}>Choose your access point to enter the workspace</Typography>
                            
                            <Grid container spacing={2}>
                                {ROLES.map(role => (
                                    <Grid item xs={12} sm={6} key={role.key}>
                                        <Card 
                                            sx={{ 
                                                bgcolor: 'rgba(255,255,255,0.05)', 
                                                border: '1px solid rgba(255,255,255,0.1)',
                                                '&:hover': { borderColor: role.color, transform: 'translateY(-4px)', bgcolor: 'rgba(255,255,255,0.08)' },
                                                transition: '0.3s'
                                            }}
                                        >
                                            <CardActionArea onClick={() => setSelectedRole(role)} sx={{ p: 2 }}>
                                                <Avatar sx={{ bgcolor: role.color, mb: 1.5, width: 44, height: 44 }}>{role.icon}</Avatar>
                                                <Typography variant="subtitle1" fontWeight={800} sx={{ color: 'white' }}>{role.title}</Typography>
                                                <Typography variant="caption" sx={{ display: 'block', color: 'rgba(255, 255, 255, 0.5)' }}>{role.desc}</Typography>
                                            </CardActionArea>
                                        </Card>
                                    </Grid>
                                ))}
                            </Grid>
                        </Box>
                    </Grid>
                </Grid>
            </Container>

            {/* Footer */}
            <Box sx={{ p: 4, textAlign: 'center', opacity: 0.4 }}>
                <Typography variant="caption" sx={{ color: 'white' }}>© 2026 CortexCraft.AI • All Clinical Data Encrypted • Version 4.2.0-LTS</Typography>
            </Box>

            {/* Role Login Dialog */}
            <Dialog 
                open={!!selectedRole} 
                onClose={handleClose} 
                maxWidth="xs" 
                fullWidth
                PaperProps={{ 
                    sx: { borderRadius: 4, p: 1, borderBottom: 6, borderColor: selectedRole?.color } 
                }}
            >
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
                    <Stack direction="row" spacing={2} alignItems="center">
                        <Avatar sx={{ bgcolor: selectedRole?.color }}>{selectedRole?.icon}</Avatar>
                        <Box>
                            <Typography variant="h6" fontWeight={900}>{selectedRole?.title} Login</Typography>
                            <Typography variant="caption" color="text.secondary">Secure Authentication Portal</Typography>
                        </Box>
                    </Stack>
                    <IconButton onClick={handleClose} size="small" disabled={loading}><CloseIcon /></IconButton>
                </DialogTitle>
                <DialogContent>
                    {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
                    <Box component="form" onSubmit={handleLogin} sx={{ mt: 1 }}>
                        <Stack spacing={2.5}>
                            <TextField 
                                fullWidth 
                                label={selectedRole?.key === 'patient' ? "Patient ID" : "Corporate Email"} 
                                variant="outlined" 
                                value={selectedRole?.key === 'patient' ? formData.patient_id : formData.email}
                                onChange={e => selectedRole?.key === 'patient' ? setFormData({...formData, patient_id: e.target.value}) : setFormData({...formData, email: e.target.value})}
                                required
                            />
                            <TextField 
                                fullWidth 
                                label="Security Password" 
                                type="password" 
                                variant="outlined" 
                                value={formData.password}
                                onChange={e => setFormData({...formData, password: e.target.value})}
                                required
                            />
                            <Button 
                                fullWidth 
                                variant="contained" 
                                size="large" 
                                type="submit" 
                                disabled={loading}
                                sx={{ py: 1.5, borderRadius: 2, bgcolor: selectedRole?.color, '&:hover': { bgcolor: selectedRole?.color, opacity: 0.9 } }}
                            >
                                {loading ? <CircularProgress size={24} color="inherit" /> : `Enter Workspace →`}
                            </Button>
                        </Stack>
                    </Box>
                    <Box sx={{ mt: 3, textAlign: 'center' }}>
                        <Typography variant="body2" sx={{ mb: 1 }}>
                            Don't have an account?{' '}
                            <Link component={RouterLink} to={`/${selectedRole?.key}-signup`} sx={{ fontWeight: 700, color: selectedRole?.color }}>Sign up now</Link>
                        </Typography>
                        {selectedRole?.key === 'patient' && (
                            <Button 
                                startIcon={<WhatsAppIcon sx={{ color: '#25D366' }} />} 
                                onClick={() => { setSelectedRole(null); setShowWhatsApp(true); }}
                                sx={{ textTransform: 'none', color: 'text.secondary', fontWeight: 500 }}
                            >
                                Login with WhatsApp Number
                            </Button>
                        )}
                    </Box>
                </DialogContent>
            </Dialog>

            {/* WhatsApp Login Dialog */}
            <Dialog 
                open={showWhatsApp} 
                onClose={handleClose} 
                maxWidth="xs" 
                fullWidth
                PaperProps={{ sx: { borderRadius: 4, p: 1, borderBottom: 6, borderColor: '#25D366' } }}
            >
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Stack direction="row" spacing={2} alignItems="center">
                        <Avatar sx={{ bgcolor: '#25D366' }}><WhatsAppIcon /></Avatar>
                        <Box>
                            <Typography variant="h6" fontWeight={800}>WhatsApp Login</Typography>
                            <Typography variant="caption" color="text.secondary">Vitals & Record Access</Typography>
                        </Box>
                    </Stack>
                    <IconButton onClick={handleClose} size="small"><CloseIcon /></IconButton>
                </DialogTitle>
                <DialogContent>
                    <Typography variant="body2" sx={{ mb: 3, opacity: 0.7 }}>Enter the phone number associated with your WhatsApp clinical consultations.</Typography>
                    {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
                    <Box component="form" onSubmit={handleWhatsAppLogin}>
                        <TextField 
                            fullWidth 
                            label="WhatsApp Phone Number" 
                            placeholder="e.g. 918885851826" 
                            variant="outlined" 
                            value={whatsappPhone}
                            onChange={e => setWhatsappPhone(e.target.value)}
                            required
                            sx={{ mb: 3 }}
                        />
                        <Button 
                            fullWidth 
                            variant="contained" 
                            size="large" 
                            type="submit" 
                            disabled={loading}
                            sx={{ py: 1.5, borderRadius: 2, bgcolor: '#25D366', '&:hover': { bgcolor: '#1ea952' } }}
                        >
                            {loading ? <CircularProgress size={24} color="inherit" /> : 'Verify & Continue'}
                        </Button>
                    </Box>
                    <Box sx={{ mt: 3, textAlign: 'center' }}>
                        <Button onClick={() => { setShowWhatsApp(false); setSelectedRole(ROLES.find(r => r.key === 'patient')); }} sx={{ color: 'text.secondary' }}>
                            Back to Patient ID Login
                        </Button>
                    </Box>
                </DialogContent>
            </Dialog>
        </Box>
    );
};

export default Login;