import React, { useState, useEffect } from 'react';
import { API_BASE, getAuthHeaders } from '../utils/api';

// MUI Components
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';
import FormControl from '@mui/material/FormControl';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Checkbox from '@mui/material/Checkbox';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Divider from '@mui/material/Divider';
import Chip from '@mui/material/Chip';
import InputLabel from '@mui/material/InputLabel';

// Icons
import CloseIcon from '@mui/icons-material/Close';
import SaveIcon from '@mui/icons-material/Save';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import WbSunnyIcon from '@mui/icons-material/WbSunny';
import NightlightIcon from '@mui/icons-material/Nightlight';
import DarkModeIcon from '@mui/icons-material/DarkMode';

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const DoctorScheduleManager = ({ onClose }) => {
    const [schedules, setSchedules] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [slotDuration, setSlotDuration] = useState(30);

    useEffect(() => {
        loadSchedule();
    }, []);

    const loadSchedule = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/doctor/schedule`, {
                headers: getAuthHeaders()
            });
            const data = await res.json();
            
            if (data.success) {
                const existingMap = {};
                data.schedules.forEach(s => {
                    if (!existingMap[s.day_of_week]) {
                        existingMap[s.day_of_week] = { shifts: [], raw: [] };
                    }
                    const hour = parseInt((s.start_time || '00:00').split(':')[0], 10);
                    let shiftType = '';
                    if (hour < 12) shiftType = 'morning';
                    else if (hour < 18) shiftType = 'evening';
                    else shiftType = 'night';
                    
                    if (!existingMap[s.day_of_week].shifts.includes(shiftType)) {
                        existingMap[s.day_of_week].shifts.push(shiftType);
                    }
                    existingMap[s.day_of_week].raw.push(s);
                });

                const fullWeek = DAYS_OF_WEEK.map(day => ({
                    day_of_week: day,
                    shifts: existingMap[day]?.shifts || [],
                    is_available: (existingMap[day]?.shifts || []).length > 0
                }));

                setSchedules(fullWeek);
                if (data.schedules.length > 0) {
                    setSlotDuration(data.schedules[0]?.slot_duration || 30);
                }
            }
        } catch (e) {
            setError('Failed to load schedule');
        }
        setLoading(false);
    };

    const handleShiftToggle = (dayIndex, shiftKey) => {
        const updated = [...schedules];
        const day = updated[dayIndex];
        if (day.shifts.includes(shiftKey)) {
            day.shifts = day.shifts.filter(s => s !== shiftKey);
        } else {
            day.shifts.push(shiftKey);
        }
        day.is_available = day.shifts.length > 0;
        setSchedules(updated);
    };

    const handleApplyToAllDays = () => {
        const monday = schedules[0];
        const updated = schedules.map((day, idx) => {
            if (idx === 0) return day;
            return {
                ...day,
                shifts: [...monday.shifts],
                is_available: monday.is_available
            };
        });
        setSchedules(updated);
        setSuccess('Monday schedule applied to all days!');
        setTimeout(() => setSuccess(''), 2000);
    };

    const handleSave = async () => {
        setSaving(true);
        setError('');
        setSuccess('');

        try {
            const flattenedSchedules = [];
            const SHIFT_TIMES = {
                'morning': { start: '07:00', end: '14:00' },
                'evening': { start: '14:00', end: '22:00' },
                'night': { start: '22:00', end: '07:00' }
            };

            schedules.forEach(day => {
                day.shifts.forEach(shiftKey => {
                    flattenedSchedules.push({
                        day_of_week: day.day_of_week,
                        start_time: SHIFT_TIMES[shiftKey].start,
                        end_time: SHIFT_TIMES[shiftKey].end,
                        is_available: true
                    });
                });
            });

            const res = await fetch(`${API_BASE}/doctor/schedule`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    schedules: flattenedSchedules,
                    slot_duration: slotDuration
                })
            });

            const data = await res.json();
            if (data.success) {
                setSuccess('Schedule saved successfully!');
                setTimeout(() => setSuccess(''), 3000);
            } else {
                setError(data.error || 'Failed to save schedule');
            }
        } catch (e) {
            setError('Failed to save schedule');
        }
        setSaving(false);
    };

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 8 }}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Paper 
            elevation={0}
            sx={{ 
                maxWidth: 800, 
                width: '100%', 
                maxHeight: '90vh',
                bgcolor: 'background.paper',
                borderRadius: 3,
                overflowY: 'auto',
                border: 1,
                borderColor: 'divider'
            }}
        >
            {/* Header */}
            <Box sx={{ 
                background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)', 
                p: 3, 
                color: 'white',
                position: 'relative'
            }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Box>
                        <Stack direction="row" spacing={1.5} alignItems="center">
                            <CalendarMonthIcon />
                            <Typography variant="h5" fontWeight={800}>Recurring Yearly Schedule</Typography>
                        </Stack>
                        <Typography variant="body2" sx={{ opacity: 0.8, fontStyle: 'italic', mt: 0.5 }}>
                            This schedule applies to every month of the year until updated.
                        </Typography>
                    </Box>
                    {onClose && (
                        <IconButton onClick={onClose} sx={{ color: 'white' }}>
                            <CloseIcon />
                        </IconButton>
                    )}
                </Stack>
                <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                    <Chip size="small" label="✓ Recurring" sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white', fontWeight: 600 }} />
                    <Chip size="small" label="✓ 2026-2027" sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white', fontWeight: 600 }} />
                </Stack>
            </Box>

            <Box sx={{ p: 4 }}>
                {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
                {success && <Alert severity="success" sx={{ mb: 3 }}>{success}</Alert>}

                {/* Settings Panel */}
                <Paper variant="outlined" sx={{ p: 3, mb: 4, bgcolor: 'background.default', borderRadius: 2 }}>
                    <Grid container spacing={3} alignItems="center">
                        <Grid item xs={12} sm={6}>
                            <FormControl fullWidth size="small">
                                <InputLabel>Appointment Duration</InputLabel>
                                <Select
                                    label="Appointment Duration"
                                    value={slotDuration}
                                    onChange={(e) => setSlotDuration(e.target.value)}
                                >
                                    <MenuItem value={15}>15 minutes</MenuItem>
                                    <MenuItem value={20}>20 minutes</MenuItem>
                                    <MenuItem value={30}>30 minutes</MenuItem>
                                    <MenuItem value={45}>45 minutes</MenuItem>
                                    <MenuItem value={60}>60 minutes</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={12} sm={6} textAlign={{ sm: 'right' }}>
                            <Button 
                                startIcon={<ContentPasteIcon />} 
                                color="primary" 
                                variant="text" 
                                onClick={handleApplyToAllDays}
                                sx={{ fontWeight: 700 }}
                            >
                                Apply Monday to All
                            </Button>
                        </Grid>
                    </Grid>
                </Paper>

                {/* Days Grid */}
                <Stack spacing={2}>
                    {schedules.map((sched, idx) => (
                        <Paper 
                            key={sched.day_of_week} 
                            variant="outlined"
                            sx={{ 
                                p: 2, 
                                borderRadius: 2,
                                display: 'flex',
                                flexWrap: 'wrap',
                                alignItems: 'center',
                                gap: 2,
                                borderColor: sched.is_available ? 'primary.main' : 'divider',
                                transition: 'all 0.2s',
                                '&:hover': { borderColor: 'primary.main', boxShadow: theme => theme.shadows[2] }
                            }}
                        >
                            <Typography 
                                variant="h6" 
                                sx={{ 
                                    width: 120, 
                                    fontWeight: 800,
                                    color: sched.is_available ? 'primary.main' : 'text.secondary'
                                }}
                            >
                                {sched.day_of_week}
                            </Typography>

                            <Stack direction="row" spacing={1.5} flex={1} flexWrap="wrap">
                                {[
                                    { key: 'morning', label: 'Morning', time: '7AM-2PM', icon: <WbSunnyIcon fontSize="small" />, color: 'info' },
                                    { key: 'evening', label: 'Evening', time: '2PM-10PM', icon: <NightlightIcon fontSize="small" />, color: 'warning' },
                                    { key: 'night', label: 'Night', time: '10PM-7AM', icon: <DarkModeIcon fontSize="small" />, color: 'secondary' }
                                ].map(shift => (
                                    <Chip
                                        key={shift.key}
                                        icon={shift.icon}
                                        label={
                                            <Box sx={{ textAlign: 'left' }}>
                                                <Typography variant="caption" sx={{ display: 'block', fontWeight: 700 }}>{shift.label}</Typography>
                                                <Typography variant="caption" sx={{ opacity: 0.8 }}>{shift.time}</Typography>
                                            </Box>
                                        }
                                        onClick={() => handleShiftToggle(idx, shift.key)}
                                        color={sched.shifts.includes(shift.key) ? shift.color : 'default'}
                                        variant={sched.shifts.includes(shift.key) ? 'filled' : 'outlined'}
                                        sx={{ 
                                            height: 48, 
                                            px: 1, 
                                            borderRadius: 2,
                                            '& .MuiChip-label': { px: 1.5 }
                                        }}
                                    />
                                ))}
                            </Stack>
                        </Paper>
                    ))}
                </Stack>

                <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, mt: 5 }}>
                    {onClose && (
                        <Button 
                            variant="outlined" 
                            color="inherit" 
                            onClick={onClose}
                            sx={{ px: 4 }}
                        >
                            Cancel
                        </Button>
                    )}
                    <Button 
                        variant="contained" 
                        size="large" 
                        onClick={handleSave}
                        disabled={saving}
                        startIcon={saving ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
                        sx={{ px: 6, py: 1.5, borderRadius: 2, fontWeight: 800 }}
                    >
                        {saving ? 'Saving...' : 'Save Schedule'}
                    </Button>
                </Box>
            </Box>
        </Paper>
    );
};

export default DoctorScheduleManager;
