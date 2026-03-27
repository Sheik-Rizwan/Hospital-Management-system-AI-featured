import React from 'react';
import { formatDate } from '../utils/api';

// MUI Components
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';

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
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';

// Icons — using only guaranteed-stable MUI icon names
import CloseIcon from '@mui/icons-material/Close';
import FavoriteIcon from '@mui/icons-material/Favorite';
import OpacityIcon from '@mui/icons-material/Opacity';           // Blood pressure
import DeviceThermostatIcon from '@mui/icons-material/DeviceThermostat'; // Temperature
import WavesIcon from '@mui/icons-material/Waves';               // SpO2 / oxygen
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart'; // Respiratory / heart monitor

/**
 * Safely resolve a vital reading to a plain string.
 * Handles: number, string, undefined, null, or object {value?, systolic?, diastolic?, unit?}
 */
const resolveVital = (raw) => {
    if (raw === null || raw === undefined) return '--';
    if (typeof raw === 'number') return String(raw);
    if (typeof raw === 'string') return raw || '--';
    if (typeof raw === 'object') {
        // Blood pressure nested object
        if (raw.systolic !== undefined && raw.diastolic !== undefined) {
            return `${raw.systolic}/${raw.diastolic}`;
        }
        // Generic {value, unit} shape
        if (raw.value !== undefined) {
            return String(raw.value);
        }
        // Last resort: convert to string without throwing
        try { return JSON.stringify(raw); } catch { return '--'; }
    }
    return '--';
};

const PatientsVitalsModal = ({ isOpen, onClose, patients }) => {
    return (
        <Dialog
            open={isOpen}
            onClose={onClose}
            maxWidth="lg"
            fullWidth
            PaperProps={{
                sx: {
                    borderRadius: 3,
                    bgcolor: 'background.paper',
                    maxHeight: '90vh'
                }
            }}
        >
            <DialogTitle sx={{
                borderBottom: 1,
                borderColor: 'divider',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                py: 2.5,
                px: 3
            }}>
                <Box>
                    <Stack direction="row" spacing={1.5} alignItems="center">
                        <MonitorHeartIcon color="primary" sx={{ fontSize: 32 }} />
                        <Typography variant="h5" fontWeight={800}>Live Vitals Monitor</Typography>
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                        Real-time overview of all patient vitals from latest handoffs
                    </Typography>
                </Box>
                <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
            </DialogTitle>

            <DialogContent sx={{ p: 4, bgcolor: 'action.hover' }}>
                <Grid container spacing={3}>
                    {!patients || patients.length === 0 ? (
                        <Grid size={12}>
                            <Box sx={{ py: 10, textAlign: 'center', color: 'text.secondary' }}>
                                <Typography variant="h1" sx={{ mb: 2, opacity: 0.2 }}></Typography>
                                <Typography variant="h6">No vitals data available.</Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                                    Vitals are populated from nurse handoff records. Record a handoff with vital signs to see data here.
                                </Typography>
                            </Box>
                        </Grid>
                    ) : (
                        patients
                            .filter(p => p != null)  // guard against null entries
                            .map((p, index) => {
                                // Support both 'vitals' and 'latest_vitals' shapes from API
                                const v = (p.vitals && typeof p.vitals === 'object') ? p.vitals
                                    : (p.latest_vitals && typeof p.latest_vitals === 'object') ? p.latest_vitals
                                    : {};

                                const patientName = typeof p.patient_name === 'string' ? p.patient_name : 'Unknown Patient';
                                const patientId   = p.patient_id ? String(p.patient_id) : `patient-${index}`;
                                const roomNo      = p.room_number ? String(p.room_number) : 'N/A';

                                return (
                                    <Grid size={{ xs: 12, md: 6, lg: 4 }} key={patientId}>
                                        <Card sx={{
                                            borderRadius: 3,
                                            height: '100%',
                                            transition: 'all 0.3s',
                                            '&:hover': { transform: 'translateY(-4px)', boxShadow: 6 }
                                        }}>
                                            <CardContent>
                                                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 3 }}>
                                                    <Box>
                                                        <Typography variant="h6" fontWeight={800} color="primary" noWrap>
                                                            {patientName}
                                                        </Typography>
                                                        <Typography variant="caption" color="text.secondary" fontFamily="monospace">
                                                            ID: {patientId} • Room: {roomNo}
                                                        </Typography>
                                                    </Box>
                                                    {p.last_updated && (
                                                        <Chip
                                                            size="small"
                                                            label={formatDate(p.last_updated)}
                                                            variant="outlined"
                                                            sx={{ fontSize: '10px' }}
                                                        />
                                                    )}
                                                </Stack>

                                                {Object.keys(v).length > 0 ? (
                                                    <Grid container spacing={1.5}>
                                                        <Grid size={4}>
                                                            <VitalCardSmall
                                                                icon={<FavoriteIcon sx={{ fontSize: 20 }} />}
                                                                label="HR"
                                                                value={resolveVital(v.heart_rate ?? v.hr)}
                                                                unit="bpm"
                                                                status={v.heart_rate?.status}
                                                                color="error"
                                                            />
                                                        </Grid>
                                                        <Grid size={4}>
                                                            <VitalCardSmall
                                                                icon={<OpacityIcon sx={{ fontSize: 20 }} />}
                                                                label="BP"
                                                                value={resolveVital(v.blood_pressure ?? v.bp)}
                                                                unit="mmHg"
                                                                status={v.blood_pressure?.status}
                                                                color="secondary"
                                                            />
                                                        </Grid>
                                                        <Grid size={4}>
                                                            <VitalCardSmall
                                                                icon={<DeviceThermostatIcon sx={{ fontSize: 20 }} />}
                                                                label="Temp"
                                                                value={resolveVital(v.temperature_celsius ?? v.temperature ?? v.temp)}
                                                                unit="°C"
                                                                color="warning"
                                                            />
                                                        </Grid>
                                                        <Grid size={4}>
                                                            <VitalCardSmall
                                                                icon={<WavesIcon sx={{ fontSize: 20 }} />}
                                                                label="SpO2"
                                                                value={resolveVital(v.oxygen_saturation ?? v.spo2)}
                                                                unit="%"
                                                                status={v.oxygen_saturation?.status}
                                                                color="info"
                                                            />
                                                        </Grid>
                                                        <Grid size={4}>
                                                            <VitalCardSmall
                                                                icon={<MonitorHeartIcon sx={{ fontSize: 20 }} />}
                                                                label="Resp"
                                                                value={resolveVital(v.respiratory_rate ?? v.resp_rate)}
                                                                unit="/min"
                                                                status={v.respiratory_rate?.status}
                                                                color="success"
                                                            />
                                                        </Grid>
                                                    </Grid>
                                                ) : (
                                                    <Box sx={{
                                                        py: 4,
                                                        textAlign: 'center',
                                                        bgcolor: 'action.selected',
                                                        borderRadius: 2,
                                                        border: '1px dashed',
                                                        borderColor: 'divider'
                                                    }}>
                                                        <Typography variant="body2" color="text.secondary">No recorded vitals</Typography>
                                                    </Box>
                                                )}
                                            </CardContent>
                                        </Card>
                                    </Grid>
                                );
                            })
                    )}
                </Grid>
            </DialogContent>

            <Box sx={{ px: 3, py: 2, borderTop: 1, borderColor: 'divider', textAlign: 'center', bgcolor: 'background.paper' }}>
                <Typography variant="caption" color="text.secondary">
                    Updates automatically from latest nurse handoff reports.
                    <Typography component="span" variant="caption" sx={{ ml: 1, color: 'success.main', fontWeight: 800 }}>
                        ● System Online
                    </Typography>
                </Typography>
            </Box>
        </Dialog>
    );
};

const VitalCardSmall = ({ icon, label, value, unit, status, color }) => {
    const isCritical = status ? ['critical', 'low', 'elevated'].includes(String(status).toLowerCase()) : false;

    return (
        <Paper variant="outlined" sx={{
            p: 1.5,
            textAlign: 'center',
            borderRadius: 2,
            transition: 'all 0.2s',
            bgcolor: isCritical ? `${color}.lighter` : 'background.paper',
            borderColor: isCritical ? `${color}.main` : 'divider',
            '&:hover': { transform: 'scale(1.05)' }
        }}>
            <Box sx={{ color: `${color}.main`, mb: 0.5 }}>{icon}</Box>
            <Typography variant="body2" fontWeight={800} sx={{ lineHeight: 1 }}>
                {/* value is always a safe string from resolveVital() */}
                {value}{' '}
                <Typography component="span" variant="caption" sx={{ fontSize: '8px', opacity: 0.7 }}>{unit}</Typography>
            </Typography>
            <Typography variant="caption" sx={{ fontSize: '9px', fontWeight: 700, opacity: 0.6, textTransform: 'uppercase' }}>
                {label}
            </Typography>
        </Paper>
    );
};

export default PatientsVitalsModal;
