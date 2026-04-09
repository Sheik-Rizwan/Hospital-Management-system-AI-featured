import React, { useState, useEffect } from 'react';
import { API_BASE, getAuthHeaders } from '../utils/api';

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
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';
import FormControl from '@mui/material/FormControl';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import InputLabel from '@mui/material/InputLabel';
import Tooltip from '@mui/material/Tooltip';
import Collapse from '@mui/material/Collapse';

// Icons
import CloseIcon from '@mui/icons-material/Close';
import SaveIcon from '@mui/icons-material/Save';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// Generate all 24 hours (0-23) with display labels
const ALL_HOURS = Array.from({ length: 24 }, (_, i) => {
    const h12 = i === 0 ? 12 : i > 12 ? i - 12 : i;
    const period = i < 12 ? 'AM' : 'PM';
    return { hour: i, label: `${h12} ${period}`, short: `${h12}${period}` };
});

const formatHour = (h) => `${String(h).padStart(2, '0')}:00`;
const formatEndHour = (h) => `${String((h + 1) % 24).padStart(2, '0')}:00`;

const DoctorScheduleManager = ({ onClose }) => {
    // Each day stores a Set of selected hours (0-23)
    const [schedules, setSchedules] = useState(() =>
        DAYS_OF_WEEK.map(day => ({ day_of_week: day, hours: new Set() }))
    );
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [slotDuration, setSlotDuration] = useState(30);
    const [expandedDay, setExpandedDay] = useState(null); // which day card is expanded

    useEffect(() => {
        loadSchedule();
    }, []);

    const loadSchedule = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/doctor/schedule`, { headers: getAuthHeaders() });
            const data = await res.json();

            if (data.success) {
                const dayHoursMap = {};
                DAYS_OF_WEEK.forEach(d => { dayHoursMap[d] = new Set(); });

                data.schedules.forEach(s => {
                    const startH = parseInt((s.start_time || '00:00').split(':')[0], 10);
                    const endH = parseInt((s.end_time || '01:00').split(':')[0], 10);

                    // If the schedule has a 1-hour block, select just that hour
                    // If it spans multiple hours (legacy shift), select all hours in range
                    if (endH === 0 && startH !== 0) {
                        // Overnight: e.g. 22:00 - 00:00 means hours 22, 23
                        for (let h = startH; h < 24; h++) dayHoursMap[s.day_of_week]?.add(h);
                    } else if (endH <= startH && startH !== 0) {
                        // Overnight wrap: e.g. 22:00 - 07:00
                        for (let h = startH; h < 24; h++) dayHoursMap[s.day_of_week]?.add(h);
                        for (let h = 0; h < endH; h++) dayHoursMap[s.day_of_week]?.add(h);
                    } else {
                        for (let h = startH; h < endH; h++) dayHoursMap[s.day_of_week]?.add(h);
                    }
                });

                const fullWeek = DAYS_OF_WEEK.map(day => ({
                    day_of_week: day,
                    hours: dayHoursMap[day]
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

    const handleHourToggle = (dayIndex, hour) => {
        setSchedules(prev => {
            const updated = prev.map((day, idx) => {
                if (idx !== dayIndex) return day;
                const newHours = new Set(day.hours);
                if (newHours.has(hour)) newHours.delete(hour);
                else newHours.add(hour);
                return { ...day, hours: newHours };
            });
            return updated;
        });
    };

    const handleApplyToAllDays = () => {
        const mondayHours = schedules[0].hours;
        setSchedules(prev =>
            prev.map((day, idx) => idx === 0 ? day : { ...day, hours: new Set(mondayHours) })
        );
        setSuccess('Monday schedule applied to all days!');
        setTimeout(() => setSuccess(''), 2000);
    };

    const handleSelectAllHours = (dayIndex) => {
        setSchedules(prev => prev.map((day, idx) => {
            if (idx !== dayIndex) return day;
            const allSelected = day.hours.size === 24;
            return { ...day, hours: allSelected ? new Set() : new Set(ALL_HOURS.map(h => h.hour)) };
        }));
    };

    const handleSave = async () => {
        setSaving(true);
        setError('');
        setSuccess('');

        try {
            const flattenedSchedules = [];

            schedules.forEach(day => {
                // Merge consecutive hours into blocks for efficiency
                const sortedHours = [...day.hours].sort((a, b) => a - b);
                if (sortedHours.length === 0) return;

                let blockStart = sortedHours[0];
                let blockEnd = sortedHours[0] + 1;

                for (let i = 1; i < sortedHours.length; i++) {
                    if (sortedHours[i] === blockEnd) {
                        blockEnd = sortedHours[i] + 1;
                    } else {
                        flattenedSchedules.push({
                            day_of_week: day.day_of_week,
                            start_time: formatHour(blockStart),
                            end_time: formatHour(blockEnd % 24),
                            is_available: true
                        });
                        blockStart = sortedHours[i];
                        blockEnd = sortedHours[i] + 1;
                    }
                }
                // Push last block
                flattenedSchedules.push({
                    day_of_week: day.day_of_week,
                    start_time: formatHour(blockStart),
                    end_time: formatHour(blockEnd % 24),
                    is_available: true
                });
            });

            // For days with no hours selected, send an empty entry to clear
            const daysWithSchedule = new Set(flattenedSchedules.map(s => s.day_of_week));
            DAYS_OF_WEEK.forEach(day => {
                if (!daysWithSchedule.has(day)) {
                    flattenedSchedules.push({
                        day_of_week: day,
                        start_time: '00:00',
                        end_time: '00:00',
                        is_available: false
                    });
                }
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

    const getSelectedSummary = (hours) => {
        if (hours.size === 0) return 'No hours selected';
        if (hours.size === 24) return 'All day (24 hrs)';
        const sorted = [...hours].sort((a, b) => a - b);
        // Build a readable summary of ranges
        const ranges = [];
        let start = sorted[0];
        let end = sorted[0];
        for (let i = 1; i < sorted.length; i++) {
            if (sorted[i] === end + 1) {
                end = sorted[i];
            } else {
                ranges.push(start === end ? ALL_HOURS[start].short : `${ALL_HOURS[start].short}–${ALL_HOURS[end].short}`);
                start = sorted[i];
                end = sorted[i];
            }
        }
        ranges.push(start === end ? ALL_HOURS[start].short : `${ALL_HOURS[start].short}–${ALL_HOURS[end].short}`);
        return ranges.join(', ');
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
                maxWidth: 900,
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
                            <Typography variant="h5" fontWeight={800}>Manage Availability</Typography>
                        </Stack>
                        <Typography variant="body2" sx={{ opacity: 0.8, fontStyle: 'italic', mt: 0.5 }}>
                            Select the hours you are available for appointments each day.
                        </Typography>
                    </Box>
                    {onClose && (
                        <IconButton onClick={onClose} sx={{ color: 'white' }}>
                            <CloseIcon />
                        </IconButton>
                    )}
                </Stack>
                <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                    <Chip size="small" label=" Recurring Weekly" sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white', fontWeight: 600 }} />
                    <Chip size="small" label={` ${slotDuration} min slots`} sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white', fontWeight: 600 }} />
                </Stack>
            </Box>

            <Box sx={{ p: { xs: 2, sm: 4 } }}>
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
                    {schedules.map((sched, idx) => {
                        const isExpanded = expandedDay === idx;
                        const hasHours = sched.hours.size > 0;

                        return (
                            <Paper
                                key={sched.day_of_week}
                                variant="outlined"
                                sx={{
                                    borderRadius: 2,
                                    borderColor: hasHours ? 'primary.main' : 'divider',
                                    transition: 'all 0.2s',
                                    overflow: 'hidden',
                                    '&:hover': { borderColor: 'primary.main', boxShadow: theme => theme.shadows[2] }
                                }}
                            >
                                {/* Day Header — always visible */}
                                <Box
                                    onClick={() => setExpandedDay(isExpanded ? null : idx)}
                                    sx={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        p: 2,
                                        cursor: 'pointer',
                                        userSelect: 'none',
                                        '&:hover': { bgcolor: 'action.hover' }
                                    }}
                                >
                                    <Stack direction="row" spacing={2} alignItems="center" flex={1} sx={{ minWidth: 0 }}>
                                        <Typography
                                            variant="h6"
                                            sx={{
                                                width: 110,
                                                flexShrink: 0,
                                                fontWeight: 800,
                                                color: hasHours ? 'primary.main' : 'text.secondary'
                                            }}
                                        >
                                            {sched.day_of_week}
                                        </Typography>
                                        <Typography
                                            variant="body2"
                                            sx={{
                                                color: hasHours ? 'text.primary' : 'text.disabled',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap'
                                            }}
                                        >
                                            {getSelectedSummary(sched.hours)}
                                        </Typography>
                                    </Stack>
                                    <Stack direction="row" spacing={1} alignItems="center">
                                        <Chip
                                            size="small"
                                            label={`${sched.hours.size} hrs`}
                                            color={hasHours ? 'primary' : 'default'}
                                            variant={hasHours ? 'filled' : 'outlined'}
                                        />
                                        {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                                    </Stack>
                                </Box>

                                {/* Hourly Grid — expandable */}
                                <Collapse in={isExpanded}>
                                    <Box sx={{ px: 2, pb: 2 }}>
                                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
                                            <Typography variant="caption" color="text.secondary">
                                                Tap hours to toggle availability
                                            </Typography>
                                            <Button
                                                size="small"
                                                variant="text"
                                                onClick={() => handleSelectAllHours(idx)}
                                                sx={{ fontSize: '0.75rem' }}
                                            >
                                                {sched.hours.size === 24 ? 'Deselect All' : 'Select All'}
                                            </Button>
                                        </Stack>

                                        <Grid container spacing={0.75}>
                                            {ALL_HOURS.map(({ hour, label }) => {
                                                const isSelected = sched.hours.has(hour);
                                                return (
                                                    <Grid item xs={3} sm={2} md={2} key={hour}>
                                                        <Tooltip title={`${label} – ${ALL_HOURS[(hour + 1) % 24].label}`} arrow>
                                                            <Box
                                                                onClick={() => handleHourToggle(idx, hour)}
                                                                sx={{
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    py: 1,
                                                                    px: 0.5,
                                                                    borderRadius: 1.5,
                                                                    cursor: 'pointer',
                                                                    fontWeight: 700,
                                                                    fontSize: '0.8rem',
                                                                    userSelect: 'none',
                                                                    transition: 'all 0.15s',
                                                                    border: '2px solid',
                                                                    borderColor: isSelected ? 'primary.main' : 'divider',
                                                                    bgcolor: isSelected ? 'primary.main' : 'transparent',
                                                                    color: isSelected ? 'white' : 'text.secondary',
                                                                    '&:hover': {
                                                                        borderColor: 'primary.main',
                                                                        bgcolor: isSelected ? 'primary.dark' : 'action.hover'
                                                                    }
                                                                }}
                                                            >
                                                                {label}
                                                            </Box>
                                                        </Tooltip>
                                                    </Grid>
                                                );
                                            })}
                                        </Grid>
                                    </Box>
                                </Collapse>
                            </Paper>
                        );
                    })}
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
