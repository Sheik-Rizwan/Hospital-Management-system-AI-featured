import React, { useState, useMemo } from 'react';
import { formatTimeAmPm } from '../utils/api';

// MUI Components
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Grid from '@mui/material/Grid';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Avatar from '@mui/material/Avatar';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import RefreshIcon from '@mui/icons-material/Refresh';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import ScheduleIcon from '@mui/icons-material/Schedule';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import PhoneIcon from '@mui/icons-material/Phone';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

const STATUS_CONFIG = {
    pending: { color: 'warning', label: 'PENDING' },
    pending_doctor_approval: { color: 'warning', label: 'AWAITING APPROVAL' },
    approved: { color: 'success', label: 'APPROVED' },
    confirmed: { color: 'success', label: 'CONFIRMED' },
    completed: { color: 'primary', label: 'COMPLETED' },
    rejected: { color: 'error', label: 'REJECTED' },
    cancelled: { color: 'error', label: 'CANCELLED' },
};

const AppointmentCalendar = ({
    appointments = [],
    handleAppointmentAction,
    loadAppointments,
    onManageSchedule
}) => {
    const today = new Date();
    const [currentMonth, setCurrentMonth] = useState(today.getMonth());
    const [currentYear, setCurrentYear] = useState(today.getFullYear());
    const [selectedDate, setSelectedDate] = useState(null); // 'YYYY-MM-DD' or null

    // ─── Navigation ───
    const goToPrevMonth = () => {
        setCurrentMonth(prev => {
            if (prev === 0) { setCurrentYear(y => y - 1); return 11; }
            return prev - 1;
        });
        setSelectedDate(null);
    };

    const goToNextMonth = () => {
        setCurrentMonth(prev => {
            if (prev === 11) { setCurrentYear(y => y + 1); return 0; }
            return prev + 1;
        });
        setSelectedDate(null);
    };

    const goToToday = () => {
        setCurrentMonth(today.getMonth());
        setCurrentYear(today.getFullYear());
        setSelectedDate(null);
    };

    // ─── Group appointments by date ───
    const appointmentsByDate = useMemo(() => {
        const map = {};
        (appointments || []).forEach(apt => {
            const d = apt.date; // 'YYYY-MM-DD'
            if (!d) return;
            if (!map[d]) map[d] = [];
            map[d].push(apt);
        });
        Object.values(map).forEach(list =>
            list.sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))
        );
        return map;
    }, [appointments]);

    // ─── Build grid cells ───
    const calendarCells = useMemo(() => {
        const firstDay = new Date(currentYear, currentMonth, 1).getDay(); // 0=Sun
        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
        const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

        const cells = [];
        for (let i = firstDay - 1; i >= 0; i--) {
            const day = daysInPrevMonth - i;
            const m = currentMonth === 0 ? 11 : currentMonth - 1;
            const y = currentMonth === 0 ? currentYear - 1 : currentYear;
            const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            cells.push({ day, dateStr, isCurrentMonth: false });
        }
        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            cells.push({ day: d, dateStr, isCurrentMonth: true });
        }
        const remaining = 7 - (cells.length % 7);
        if (remaining < 7) {
            for (let d = 1; d <= remaining; d++) {
                const m = currentMonth === 11 ? 0 : currentMonth + 1;
                const y = currentMonth === 11 ? currentYear + 1 : currentYear;
                const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                cells.push({ day: d, dateStr, isCurrentMonth: false });
            }
        }
        return cells;
    }, [currentMonth, currentYear]);

    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const formatFullDate = (dateStr) => {
        const d = new Date(dateStr + 'T00:00:00');
        return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    };

    const getStatusChip = (status) => {
        const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
        return <Chip label={config.label} color={config.color} size="small" variant="soft" sx={{ fontSize: '0.65rem', fontWeight: 700, borderRadius: 1.5 }} />;
    };

    // ─── Date Detail View ───
    if (selectedDate) {
        const dayAppointments = appointmentsByDate[selectedDate] || [];

        return (
            <Box sx={{ p: 3 }}>
                <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 4 }}>
                    <Button 
                        startIcon={<ArrowBackIcon />} 
                        onClick={() => setSelectedDate(null)}
                        variant="outlined"
                        sx={{ borderRadius: 2 }}
                    >
                        Back to Calendar
                    </Button>
                    <Box sx={{ flex: 1 }}>
                        <Typography variant="h5" fontWeight={800}>{formatFullDate(selectedDate)}</Typography>
                        <Typography variant="body2" color="text.secondary">{dayAppointments.length} Clinically Scheduled Appointments</Typography>
                    </Box>
                </Stack>

                {dayAppointments.length === 0 ? (
                    <Box sx={{ py: 12, textAlign: 'center', opacity: 0.4 }}>
                        <EventAvailableIcon sx={{ fontSize: 64, mb: 2 }} />
                        <Typography variant="h6">No clinical activity scheduled for this day</Typography>
                    </Box>
                ) : (
                    <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden' }}>
                        <Table>
                            <TableHead sx={{ bgcolor: 'action.hover' }}>
                                <TableRow>
                                    <TableCell sx={{ fontWeight: 800 }}>ID</TableCell>
                                    <TableCell sx={{ fontWeight: 800 }}>Patient Details</TableCell>
                                    <TableCell sx={{ fontWeight: 800 }}>Status</TableCell>
                                    <TableCell sx={{ fontWeight: 800 }}>Timings</TableCell>
                                    <TableCell sx={{ fontWeight: 800 }} align="right">Actions</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {dayAppointments.map((apt, idx) => (
                                    <TableRow key={apt.appointment_id} hover>
                                        <TableCell sx={{ color: 'text.secondary', fontWeight: 700 }}>#{idx + 1}</TableCell>
                                        <TableCell>
                                            <Stack direction="row" spacing={2} alignItems="center">
                                                <Avatar sx={{ width: 40, height: 40, bgcolor: 'primary.main', fontWeight: 800 }}>
                                                    {(apt.patient_name || '?')[0].toUpperCase()}
                                                </Avatar>
                                                <Box>
                                                    <Typography variant="subtitle2" fontWeight={700}>{apt.patient_name || 'Anonymous Patient'}</Typography>
                                                    <Stack direction="row" spacing={1.5} sx={{ mt: 0.5 }}>
                                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.secondary' }}>
                                                            <PhoneIcon sx={{ fontSize: 12 }} />
                                                            <Typography variant="caption">{apt.patient_phone || 'N/A'}</Typography>
                                                        </Box>
                                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'primary.main' }}>
                                                            <MedicalServicesIcon sx={{ fontSize: 12 }} />
                                                            <Typography variant="caption" fontWeight={600}>{apt.service_name || 'General Consultation'}</Typography>
                                                        </Box>
                                                    </Stack>
                                                </Box>
                                            </Stack>
                                        </TableCell>
                                        <TableCell>{getStatusChip(apt.status)}</TableCell>
                                        <TableCell>
                                            <Stack direction="row" alignItems="center" spacing={1}>
                                                <ScheduleIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                                                <Typography variant="body2" fontWeight={600}>
                                                    {formatTimeAmPm(apt.start_time)} – {formatTimeAmPm(apt.end_time)}
                                                </Typography>
                                            </Stack>
                                        </TableCell>
                                        <TableCell align="right">
                                            <Stack direction="row" spacing={1} justifyContent="flex-end">
                                                {(apt.status === 'pending' || apt.status === 'pending_doctor_approval') && (
                                                    <>
                                                        <Button size="small" variant="contained" color="success" onClick={() => handleAppointmentAction(apt.appointment_id, 'approve')}>Approve</Button>
                                                        <Button size="small" variant="outlined" color="error" onClick={() => {
                                                            const reason = window.prompt('Provide rejection reason:');
                                                            if (reason !== null) handleAppointmentAction(apt.appointment_id, 'reject', reason);
                                                        }}>Reject</Button>
                                                    </>
                                                )}
                                                {(apt.status === 'approved' || apt.status === 'confirmed') && (
                                                    <Button size="small" variant="contained" color="primary" onClick={() => handleAppointmentAction(apt.appointment_id, 'complete')}>Complete</Button>
                                                )}
                                            </Stack>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </Box>
        );
    }

    // ─── Monthly Grid View ───
    return (
        <Box>
            {/* Header */}
            <Box sx={{ p: 2.5, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
                <Box>
                    <Typography variant="h6" fontWeight={800}>{MONTH_NAMES[currentMonth]} {currentYear}</Typography>
                    <Typography variant="caption" color="text.secondary">{appointments.length} Total Clinical Records</Typography>
                </Box>
                <Stack direction="row" spacing={1} alignItems="center">
                    <IconButton onClick={goToPrevMonth} size="small" sx={{ border: '1px solid', borderColor: 'divider' }}><ChevronLeftIcon /></IconButton>
                    <Button size="small" variant="outlined" onClick={goToToday} sx={{ px: 2, fontWeight: 700 }}>Today</Button>
                    <IconButton onClick={goToNextMonth} size="small" sx={{ border: '1px solid', borderColor: 'divider' }}><ChevronRightIcon /></IconButton>
                    <Box sx={{ width: 1, height: 24, bgcolor: 'divider', mx: 1 }} />
                    <IconButton onClick={loadAppointments} size="small" sx={{ color: 'primary.main' }}><RefreshIcon /></IconButton>
                    {onManageSchedule && (
                        <Button startIcon={<ScheduleIcon />} variant="contained" size="small" onClick={onManageSchedule} sx={{ ml: 1, borderRadius: 2 }}>Manage Shifts</Button>
                    )}
                </Stack>
            </Box>

            {/* Grid Container */}
            <Box sx={{ p: 0.5 }}>
                <Grid container spacing={0.5}>
                    {/* Day Headers */}
                    {DAYS.map(day => (
                        <Grid item xs={12 / 7} key={day} sx={{ width: `${100/7}%`, flexBasis: `${100/7}%`, maxWidth: `${100/7}%` }}>
                            <Box sx={{ textAlign: 'center', py: 1.5, bgcolor: 'action.hover' }}>
                                <Typography variant="caption" fontWeight={800} color="text.secondary">{day.toUpperCase()}</Typography>
                            </Box>
                        </Grid>
                    ))}

                    {/* Day Cells */}
                    {calendarCells.map(({ day, dateStr, isCurrentMonth }, i) => {
                        const dayApts = appointmentsByDate[dateStr] || [];
                        const isToday = dateStr === todayStr;
                        
                        return (
                            <Grid item xs={12 / 7} key={i} sx={{ width: `${100/7}%`, flexBasis: `${100/7}%`, maxWidth: `${100/7}%` }}>
                                <Paper 
                                    elevation={0}
                                    onClick={() => isCurrentMonth && setSelectedDate(dateStr)}
                                    sx={{ 
                                        height: 120, 
                                        p: 1,
                                        borderRadius: 0,
                                        border: '1px solid',
                                        borderColor: 'divider',
                                        bgcolor: !isCurrentMonth ? 'action.hover' : 'background.paper',
                                        opacity: !isCurrentMonth ? 0.4 : 1,
                                        cursor: isCurrentMonth ? 'pointer' : 'default',
                                        transition: '0.2s',
                                        '&:hover': isCurrentMonth ? { bgcolor: 'action.hover', borderColor: 'primary.main', zIndex: 2, position: 'relative' } : {}
                                    }}
                                >
                                    <Stack spacing={0.5} sx={{ height: '100%' }}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <Typography 
                                                variant="caption" 
                                                sx={{ 
                                                    fontWeight: 800, 
                                                    bgcolor: isToday ? 'primary.main' : 'transparent',
                                                    color: isToday ? 'white' : 'text.primary',
                                                    width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%'
                                                }}
                                            >
                                                {day}
                                            </Typography>
                                            {dayApts.length > 0 && <Chip label={dayApts.length} size="small" variant="soft" color="primary" sx={{ height: 18, fontSize: '0.65rem', fontWeight: 800 }} />}
                                        </Box>
                                        
                                        <Box sx={{ flex: 1, overflow: 'hidden' }}>
                                            {dayApts.slice(0, 2).map((apt, idx) => (
                                                <Box 
                                                    key={idx} 
                                                    sx={{ 
                                                        px: 0.8, py: 0.3, mb: 0.5, borderRadius: 1, 
                                                        bgcolor: STATUS_CONFIG[apt.status]?.color + '.soft' || 'action.selected',
                                                        borderLeft: '3px solid',
                                                        borderColor: STATUS_CONFIG[apt.status]?.color + '.main' || 'divider'
                                                    }}
                                                >
                                                    <Typography variant="caption" noWrap sx={{ display: 'block', fontSize: '0.65rem', fontWeight: 600 }}>
                                                        {formatTimeAmPm(apt.start_time)} • {apt.patient_name}
                                                    </Typography>
                                                </Box>
                                            ))}
                                            {dayApts.length > 2 && (
                                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', ml: 0.5 }}>
                                                    + {dayApts.length - 2} more
                                                </Typography>
                                            )}
                                        </Box>
                                    </Stack>
                                </Paper>
                            </Grid>
                        );
                    })}
                </Grid>
            </Box>
        </Box>
    );
};

export default AppointmentCalendar;
