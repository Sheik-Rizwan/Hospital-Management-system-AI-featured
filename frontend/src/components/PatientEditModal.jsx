import React, { useState, useEffect } from 'react';
import { API_BASE, getAuthHeaders } from '../utils/api';

// MUI Components
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';

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
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';

// Icons
import CloseIcon from '@mui/icons-material/Close';
import SaveIcon from '@mui/icons-material/Save';

const PatientEditModal = ({ isOpen, onClose, patient, onUpdate }) => {
    const [formData, setFormData] = useState({
        patient_name: '',
        phone: '',
        age: '',
        room_number: '',
        diagnosis: '',
        notes: ''
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (patient) {
            setFormData({
                patient_name: patient.patient_name || '',
                phone: patient.phone || '',
                age: patient.age || '',
                room_number: patient.room_number || '',
                diagnosis: patient.diagnosis || '',
                notes: patient.notes || ''
            });
        }
    }, [patient]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const userStr = sessionStorage.getItem('user');
            const user = userStr ? JSON.parse(userStr) : {};
            const role = user.role || 'doctor'; 
            const endpoint = `${API_BASE}/${role}/patients/${patient.patient_id}`;

            const res = await fetch(endpoint, {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify(formData)
            });

            const data = await res.json();

            if (data.success) {
                onUpdate(); 
                onClose();
            } else {
                setError(data.error || 'Failed to update patient');
            }
        } catch (err) {
            setError('An error occurred. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog 
            open={isOpen} 
            onClose={onClose} 
            maxWidth="sm" 
            fullWidth
            PaperProps={{ sx: { borderRadius: 3 } }}
        >
            <DialogTitle sx={{ 
                borderBottom: 1, 
                borderColor: 'divider', 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center' 
            }}>
                <Typography variant="h6" fontWeight={800}>Edit Patient Details</Typography>
                <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
            </DialogTitle>

            <DialogContent sx={{ p: 4 }}>
                <Box component="form" onSubmit={handleSubmit} noValidate sx={{ mt: 1 }}>
                    <Stack spacing={3}>
                        {error && <Alert severity="error">{error}</Alert>}

                        <Grid container spacing={3}>
                            <Grid item xs={12} sm={6}>
                                <TextField
                                    fullWidth
                                    label="Patient Name"
                                    name="patient_name"
                                    value={formData.patient_name}
                                    onChange={handleChange}
                                    required
                                />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField
                                    fullWidth
                                    label="Phone Number"
                                    name="phone"
                                    value={formData.phone}
                                    onChange={handleChange}
                                />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField
                                    fullWidth
                                    label="Age"
                                    name="age"
                                    value={formData.age}
                                    onChange={handleChange}
                                />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField
                                    fullWidth
                                    label="Room Number"
                                    name="room_number"
                                    value={formData.room_number}
                                    onChange={handleChange}
                                />
                            </Grid>
                        </Grid>

                        <TextField
                            fullWidth
                            label="Diagnosis"
                            name="diagnosis"
                            value={formData.diagnosis}
                            onChange={handleChange}
                        />

                        <TextField
                            fullWidth
                            label="Notes / Special Instructions"
                            name="notes"
                            multiline
                            rows={4}
                            value={formData.notes}
                            onChange={handleChange}
                        />
                    </Stack>
                </Box>
            </DialogContent>

            <DialogActions sx={{ p: 3, borderTop: 1, borderColor: 'divider' }}>
                <Button onClick={onClose} color="inherit">Cancel</Button>
                <Button 
                    onClick={handleSubmit} 
                    variant="contained" 
                    color="primary" 
                    disabled={loading}
                    startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
                    sx={{ px: 4, fontWeight: 700 }}
                >
                    {loading ? 'Saving...' : 'Save Changes'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default PatientEditModal;
