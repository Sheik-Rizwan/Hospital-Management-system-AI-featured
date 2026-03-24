import React, { useState, useEffect } from 'react';
import { API_BASE, getAuthHeaders, formatTimeAmPm } from '../utils/api';
import VoiceBooking from './VoiceBooking';

// MUI Components
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Avatar from '@mui/material/Avatar';
import Chip from '@mui/material/Chip';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Stepper from '@mui/material/Stepper';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import Paper from '@mui/material/Paper';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Tooltip from '@mui/material/Tooltip';

// Icons
import CloseIcon from '@mui/icons-material/Close';
import MicIcon from '@mui/icons-material/Mic';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import EventIcon from '@mui/icons-material/Event';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import HistoryIcon from '@mui/icons-material/History';

const BookAppointment = ({ patientId = null, patientData = null, onClose, onSuccess, isNurseBooking = false, userRole = 'patient' }) => {
    const [activeStep, setActiveStep] = useState(0);
    const [doctors, setDoctors] = useState([]);
    const [selectedDoctor, setSelectedDoctor] = useState(null);
    const [selectedDate, setSelectedDate] = useState('');
    const [slots, setSlots] = useState([]);
    const [selectedSlot, setSelectedSlot] = useState(null);
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [filterSpecialization, setFilterSpecialization] = useState('');
    const [showVoice, setShowVoice] = useState(false);

    const steps = ['Select Doctor', 'Choose Time', 'Confirm'];
    const apiPath = (isNurseBooking || userRole === 'nurse') ? `${API_BASE}/nurse` : `${API_BASE}/patient`;

    useEffect(() => {
        loadDoctors();
    }, []);

    const loadDoctors = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${apiPath}/doctors`, {
                headers: getAuthHeaders()
            });
            const data = await res.json();
            if (data.success) {
                setDoctors(data.doctors);
            } else {
                setError(data.error || 'Failed to load doctors');
            }
        } catch (e) {
            setError('Failed to load doctors');
        }
        setLoading(false);
    };

    const loadAvailability = async (doctorId, date) => {
        setLoading(true);
        setSlots([]);
        try {
            const url = `${apiPath}/doctors/${doctorId}/availability?date=${date}`;
            const res = await fetch(url, {
                headers: getAuthHeaders()
            });
            const data = await res.json();
            if (data.success) {
                if (data.available) {
                    setSlots(data.slots.filter(s => s.available));
                } else {
                    setError(data.message || 'No availability');
                    setSlots([]);
                }
            } else {
                setError(data.error || 'Failed to load availability');
            }
        } catch (e) {
            setError('Failed to load availability');
        }
        setLoading(false);
    };

    const handleDateChange = (e) => {
        const date = e.target.value;
        setSelectedDate(date);
        setSelectedSlot(null);
        if (selectedDoctor && date) {
            loadAvailability(selectedDoctor.user_id, date);
        }
    };

    const handleBookAppointment = async () => {
        if (!selectedDoctor || !selectedDate || !selectedSlot) {
            setError('Please select doctor, date and time slot');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const payload = {
                doctor_id: selectedDoctor.user_id,
                date: selectedDate,
                start_time: selectedSlot.start,
                end_time: selectedSlot.end,
                notes: notes
            };

            if (isNurseBooking && patientId) {
                payload.patient_id = patientId;
            }

            const res = await fetch(`${apiPath}/appointments`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(payload)
            });

            const data = await res.json();

            if (data.success) {
                setSuccess('Appointment booked successfully!');
                if (onSuccess) onSuccess(data.appointment);
                setTimeout(() => {
                    if (onClose) onClose();
                }, 2000);
            } else {
                setError(data.error || 'Failed to book appointment');
            }
        } catch (e) {
            setError('Failed to book appointment');
        }
        setLoading(false);
    };

    const getMinDate = () => new Date().toISOString().split('T')[0];
    const getMaxDate = () => {
        const max = new Date();
        max.setMonth(max.getMonth() + 12);
        return max.toISOString().split('T')[0];
    };

    const uniqueSpecializations = [...new Set(doctors.map(d => d.specialization).filter(Boolean))];
    const filteredDoctors = filterSpecialization
        ? doctors.filter(d => d.specialization === filterSpecialization)
        : doctors;

    const handleNext = () => setActiveStep((prev) => prev + 1);
    const handleBack = () => setActiveStep((prev) => prev - 1);

    return (
        <Box sx={{ bgcolor: 'background.paper', borderRadius: 3, overflow: 'hidden', boxShadow: 24, maxWidth: 900, w: '100%', m: 'auto' }}>
            {showVoice && (
                <VoiceBooking
                    onClose={() => setShowVoice(false)}
                    onSuccess={(appt) => {
                        setShowVoice(false);
                        if (onSuccess) onSuccess(appt);
                    }}
                />
            )}

            {/* Header */}
            <Box sx={{ p: 4, bgcolor: 'primary.main', color: 'white' }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                    <Typography variant="h5" fontWeight={800}>
                        {isNurseBooking ? 'Book For Patient' : 'Book Appointment'}
                    </Typography>
                    <Stack direction="row" spacing={1}>
                        {!isNurseBooking && (
                            <Button 
                                onClick={() => setShowVoice(true)}
                                variant="contained" 
                                color="inherit" 
                                startIcon={<MicIcon />}
                                sx={{ color: 'primary.main', fontWeight: 800, borderRadius: 2 }}
                            >
                                Voice Book
                            </Button>
                        )}
                        {onClose && (
                            <IconButton onClick={onClose} sx={{ color: 'white' }}><CloseIcon /></IconButton>
                        )}
                    </Stack>
                </Stack>
                <Stepper activeStep={activeStep} sx={{ '& .MuiStepLabel-label': { color: 'white', opacity: 0.7 }, '& .MuiStepLabel-active .MuiStepLabel-label': { color: 'white', opacity: 1, fontWeight: 800 }, '& .MuiStepIcon-root': { color: 'rgba(255,255,255,0.3)' }, '& .MuiStepIcon-active': { color: 'white' } }}>
                    {steps.map((label) => (
                        <Step key={label}><StepLabel>{label}</StepLabel></Step>
                    ))}
                </Stepper>
            </Box>

            <Box sx={{ p: 4 }}>
                {error && <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }} onClose={() => setError('')}>{error}</Alert>}
                {success && <Alert severity="success" sx={{ mb: 3, borderRadius: 2 }}>{success}</Alert>}

                {activeStep === 0 && (
                    <Box>
                        <Stack direction="row" spacing={2} sx={{ mb: 4 }} alignItems="center">
                            <FormControl size="small" sx={{ minWidth: 200 }}>
                                <InputLabel>Specialization</InputLabel>
                                <Select
                                    value={filterSpecialization}
                                    label="Specialization"
                                    onChange={(e) => setFilterSpecialization(e.target.value)}
                                >
                                    <option value="">All Specializations</option>
                                    {uniqueSpecializations.map(spec => (
                                        <MenuItem key={spec} value={spec}>{spec}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Stack>

                        {loading ? (
                            <Box sx={{ py: 8, textAlign: 'center' }}><CircularProgress /></Box>
                        ) : (
                            <Grid container spacing={2}>
                                {filteredDoctors.map(doctor => (
                                    <Grid item xs={12} md={6} key={doctor.user_id}>
                                        <Card 
                                            variant="outlined" 
                                            onClick={() => setSelectedDoctor(doctor)}
                                            sx={{ 
                                                cursor: 'pointer', 
                                                transition: 'all 0.2s',
                                                borderColor: selectedDoctor?.user_id === doctor.user_id ? 'primary.main' : 'divider',
                                                bgcolor: selectedDoctor?.user_id === doctor.user_id ? 'primary.lighter' : 'background.paper',
                                                '&:hover': { transform: 'translateY(-2px)', boxShadow: 3 }
                                            }}
                                        >
                                            <CardContent>
                                                <Stack direction="row" spacing={2} alignItems="center">
                                                    <Avatar sx={{ width: 56, height: 56, bgcolor: 'primary.main', fontWeight: 800 }}>
                                                        {doctor.full_name?.charAt(0)}
                                                    </Avatar>
                                                    <Box sx={{ flex: 1 }}>
                                                        <Typography variant="subtitle1" fontWeight={800}>{doctor.full_name}</Typography>
                                                        <Typography variant="caption" color="primary" fontWeight={700} sx={{ display: 'block' }}>{doctor.specialization || 'General'}</Typography>
                                                        <Typography variant="caption" color="text.secondary">{doctor.department}</Typography>
                                                        <Box sx={{ mt: 1 }}>
                                                            {doctor.has_schedule ? (
                                                                <Chip label="Available" size="small" color="success" sx={{ height: 20, fontSize: '10px', fontWeight: 800 }} />
                                                            ) : (
                                                                <Chip label="No Schedule" size="small" sx={{ height: 20, fontSize: '10px', fontWeight: 800 }} />
                                                            )}
                                                        </Box>
                                                    </Box>
                                                </Stack>
                                            </CardContent>
                                        </Card>
                                    </Grid>
                                ))}
                            </Grid>
                        )}

                        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 4 }}>
                            <Button 
                                variant="contained" 
                                disabled={!selectedDoctor} 
                                onClick={handleNext} 
                                endIcon={<ArrowForwardIcon />}
                                sx={{ borderRadius: 2, px: 4 }}
                            >
                                Next
                            </Button>
                        </Box>
                    </Box>
                )}

                {activeStep === 1 && (
                    <Box>
                        <Typography variant="h6" fontWeight={800} sx={{ mb: 3 }}>
                            Schedule with Dr. {selectedDoctor?.full_name}
                        </Typography>

                        <TextField
                            label="Select Date"
                            type="date"
                            fullWidth
                            value={selectedDate}
                            onChange={handleDateChange}
                            InputLabelProps={{ shrink: true }}
                            inputProps={{ min: getMinDate(), max: getMaxDate() }}
                            sx={{ mb: 4 }}
                        />

                        {selectedDate && (
                            <Box>
                                {loading ? (
                                    <Box sx={{ py: 4, textAlign: 'center' }}><CircularProgress size={24} /></Box>
                                ) : slots.length > 0 ? (
                                    <Stack spacing={3}>
                                        {(() => {
                                            const shiftGroups = {};
                                            const shiftOrder = ['Morning', 'Afternoon', 'Evening', 'Night'];
                                            slots.forEach(slot => {
                                                const shift = slot.shift || 'Other';
                                                if (!shiftGroups[shift]) shiftGroups[shift] = [];
                                                shiftGroups[shift].push(slot);
                                            });
                                            const orderedShifts = shiftOrder.filter(s => shiftGroups[s]);
                                            return orderedShifts.map(shift => (
                                                <Paper variant="outlined" key={shift} sx={{ p: 2, bgcolor: 'action.hover' }}>
                                                    <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 2, textTransform: 'uppercase' }}>
                                                        {shift} Shift ({shiftGroups[shift].length} slots)
                                                    </Typography>
                                                    <Grid container spacing={1}>
                                                        {shiftGroups[shift].map((slot, idx) => (
                                                            <Grid item xs={4} sm={3} md={2} key={idx}>
                                                                <Button
                                                                    fullWidth
                                                                    variant={selectedSlot?.start === slot.start ? 'contained' : 'outlined'}
                                                                    size="small"
                                                                    onClick={() => setSelectedSlot(slot)}
                                                                    sx={{ borderRadius: 2, fontWeight: 700 }}
                                                                >
                                                                    {formatTimeAmPm(slot.start)}
                                                                </Button>
                                                            </Grid>
                                                        ))}
                                                    </Grid>
                                                </Paper>
                                            ));
                                        })()}
                                    </Stack>
                                ) : (
                                    <Typography variant="body2" color="text.secondary" textAlign="center">No available slots for this date</Typography>
                                )}
                            </Box>
                        )}

                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 4 }}>
                            <Button onClick={handleBack} startIcon={<ArrowBackIcon />}>Back</Button>
                            <Button 
                                variant="contained" 
                                disabled={!selectedSlot} 
                                onClick={handleNext} 
                                endIcon={<ArrowForwardIcon />}
                                sx={{ borderRadius: 2, px: 4 }}
                            >
                                Next
                            </Button>
                        </Box>
                    </Box>
                )}

                {activeStep === 2 && (
                    <Box>
                        <Paper variant="outlined" sx={{ p: 3, mb: 4, bgcolor: 'action.hover' }}>
                            <Grid container spacing={3}>
                                <Grid item xs={12} sm={6}>
                                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800, textTransform: 'uppercase' }}>Doctor</Typography>
                                    <Typography variant="h6" fontWeight={800}>{selectedDoctor?.full_name}</Typography>
                                    <Typography variant="body2" color="primary" fontWeight={700}>{selectedDoctor?.specialization}</Typography>
                                </Grid>
                                <Grid item xs={12} sm={6}>
                                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800, textTransform: 'uppercase' }}>Schedule</Typography>
                                    <Typography variant="h6" fontWeight={800}>{selectedDate}</Typography>
                                    <Typography variant="body2" color="text.secondary">{formatTimeAmPm(selectedSlot?.start)} - {formatTimeAmPm(selectedSlot?.end)}</Typography>
                                    {selectedSlot?.shift && <Chip label={selectedSlot.shift + ' Shift'} size="small" variant="soft" color="info" sx={{ mt: 1, fontWeight: 800 }} />}
                                </Grid>
                            </Grid>
                        </Paper>

                        <TextField
                            label="Notes / Reason (Optional)"
                            multiline
                            rows={3}
                            fullWidth
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Describe your symptoms..."
                            sx={{ mb: 4 }}
                        />

                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Button onClick={handleBack} startIcon={<ArrowBackIcon />}>Back</Button>
                            <Button 
                                variant="contained" 
                                color="success" 
                                onClick={handleBookAppointment} 
                                disabled={loading}
                                startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <CheckCircleIcon />}
                                sx={{ borderRadius: 2, px: 6, fontWeight: 800 }}
                            >
                                {loading ? 'Booking...' : 'Confirm Appointment'}
                            </Button>
                        </Box>
                    </Box>
                )}
            </Box>
        </Box>
    );
};
export default BookAppointment;
