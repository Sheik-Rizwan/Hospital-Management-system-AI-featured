import React, { useState } from 'react';
import { API_BASE, getAuthHeaders, formatDate } from '../utils/api';

// MUI Components
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import TextField from '@mui/material/TextField';
import Paper from '@mui/material/Paper';
import Avatar from '@mui/material/Avatar';

// Icons
import CloseIcon from '@mui/icons-material/Close';
import PrintIcon from '@mui/icons-material/Print';
import AssignmentIcon from '@mui/icons-material/Assignment';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import SendIcon from '@mui/icons-material/Send';
import PersonIcon from '@mui/icons-material/Person';
import FavoriteIcon from '@mui/icons-material/Favorite';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import NotesIcon from '@mui/icons-material/Notes';
import TipsAndUpdatesIcon from '@mui/icons-material/TipsAndUpdates';
import HistoryIcon from '@mui/icons-material/History';
import BloodtypeIcon from '@mui/icons-material/Bloodtype';
import ThermostatIcon from '@mui/icons-material/Thermostat';
import AirIcon from '@mui/icons-material/Air';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';

const ViewHandoffModal = ({ handoff, onClose }) => {
    const [question, setQuestion] = useState('');
    const [chatMessages, setChatMessages] = useState([]);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState(0);

    if (!handoff) return null;

    const report = handoff.structured_report || {};

    const handleAskQuestion = async (e) => {
        e.preventDefault();
        if (!question.trim()) return;

        const userQuestion = question;
        setChatMessages(prev => [...prev, { type: 'user', text: userQuestion }]);
        setQuestion('');
        setLoading(true);

        try {
            const res = await fetch(`${API_BASE}/nurse/chatbot/handoff`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ handoff_id: handoff.handoff_id, question: userQuestion })
            });
            const data = await res.json();

            if (data.success) {
                setChatMessages(prev => [...prev, { type: 'bot', text: data.answer }]);
            } else {
                setChatMessages(prev => [...prev, { type: 'bot', text: `Error: ${data.error}` }]);
            }
        } catch (error) {
            setChatMessages(prev => [...prev, { type: 'bot', text: 'Failed to get response' }]);
        }
        setLoading(false);
    };

    const handlePrint = () => {
        window.print();
    };

    const printStyles = `
        @media print {
            body * {
                visibility: hidden;
            }
            #handoff-modal-content, #handoff-modal-content * {
                visibility: visible;
            }
            #handoff-modal-content {
                position: absolute;
                left: 0;
                top: 0;
                width: 100%;
            }
        }
    `;

    return (
        <Dialog 
            open={!!handoff} 
            onClose={onClose} 
            maxWidth="md" 
            fullWidth
            PaperProps={{ 
                id: 'handoff-modal-content',
                sx: { borderRadius: 3, bgcolor: 'background.paper', overflow: 'hidden' } 
            }}
        >
            <style>{printStyles}</style>
            <DialogTitle sx={{ p: 0 }}>
                <Box sx={{ p: 4, bgcolor: 'action.hover', borderBottom: 1, borderColor: 'divider' }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
                        <Box>
                            <Stack direction="row" spacing={1.5} alignItems="center">
                                <AssignmentIcon color="primary" sx={{ fontSize: 32 }} />
                                <Typography variant="h5" fontWeight={800}>Clinical Handoff Report</Typography>
                            </Stack>
                            <Typography variant="body2" color="text.secondary" fontFamily="monospace" sx={{ mt: 1 }}>
                                Patient: <Typography component="span" variant="body2" fontWeight={800} color="primary">{handoff.patient_name || report.patient_name || handoff.patient_id}</Typography> • {formatDate(handoff.timestamp)}
                            </Typography>
                        </Box>
                        <Stack direction="row" spacing={1}>
                            <Button 
                                className="no-print"
                                onClick={handlePrint} 
                                variant="outlined" 
                                color="inherit" 
                                startIcon={<PrintIcon />}
                                sx={{ borderRadius: 2 }}
                            >
                                Print
                            </Button>
                            <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
                        </Stack>
                    </Stack>

                    <Tabs 
                        className="no-print"
                        value={activeTab} 
                        onChange={(e, v) => setActiveTab(v)}
                        sx={{ minHeight: 40 }}
                    >
                        <Tab 
                            label="📄 Full Report" 
                            sx={{ fontWeight: 800, minHeight: 40, px: 3 }} 
                        />
                        <Tab 
                            label="🤖 AI Assistant" 
                            sx={{ fontWeight: 800, minHeight: 40, px: 3 }} 
                        />
                    </Tabs>
                </Box>
            </DialogTitle>

            <DialogContent sx={{ p: 4 }}>
                {activeTab === 0 ? (
                    <Stack spacing={4}>
                        {/* Patient Information */}
                        <Box>
                            <SectionHeader icon={<PersonIcon />} title="Patient Information" color="info.main" />
                            <Grid container spacing={2}>
                                <Grid item xs={6} sm={4}><InfoCard label="Patient Name" value={handoff.patient_name || report.patient_name || handoff.patient_id} /></Grid>
                                <Grid item xs={6} sm={4}><InfoCard label="Patient ID" value={handoff.patient_id || report.patient_id} /></Grid>
                                <Grid item xs={6} sm={4}><InfoCard label="Room Number" value={handoff.room_number || report.room_number || 'N/A'} /></Grid>
                                <Grid item xs={6} sm={4}><InfoCard label="Attending Nurse" value={handoff.nurse_name} /></Grid>
                                <Grid item xs={6} sm={4}><InfoCard label="Shift" value={handoff.shift} /></Grid>
                                <Grid item xs={6} sm={4}><InfoCard label="Report Date" value={formatDate(handoff.timestamp)} /></Grid>
                            </Grid>
                        </Box>

                        {/* Vitals Summary */}
                        {report.vitals && (
                            <Box>
                                <SectionHeader icon={<FavoriteIcon />} title="Vital Signs Summary" color="error.main" />
                                {typeof report.vitals === 'string' ? (
                                    <Paper variant="outlined" sx={{ p: 2.5, bgcolor: 'action.hover', fontFamily: 'monospace', fontSize: '13px' }}>
                                        {report.vitals}
                                    </Paper>
                                ) : (
                                    <Grid container spacing={2}>
                                        <Grid item xs={4} sm={2.4}>
                                            <VitalCardSmall label="Heart Rate" value={report.vitals.heart_rate || report.vitals.hr || report.vitals.pulse} unit="bpm" icon={<FavoriteIcon />} color="error" />
                                        </Grid>
                                        <Grid item xs={4} sm={2.4}>
                                            <VitalCardSmall label="BP" value={report.vitals.blood_pressure || report.vitals.bp} unit="mmHg" icon={<BloodtypeIcon />} color="secondary" />
                                        </Grid>
                                        <Grid item xs={4} sm={2.4}>
                                            <VitalCardSmall label="Temp" value={report.vitals.temperature || report.vitals.temp} unit="°F" icon={<ThermostatIcon />} color="warning" />
                                        </Grid>
                                        <Grid item xs={4} sm={2.4}>
                                            <VitalCardSmall label="SpO2" value={report.vitals.oxygen_saturation || report.vitals.spo2} unit="%" icon={<AirIcon />} color="info" />
                                        </Grid>
                                        <Grid item xs={4} sm={2.4}>
                                            <VitalCardSmall label="Resp" value={report.vitals.respiratory_rate || report.vitals.resp_rate} unit="/min" icon={<MonitorHeartIcon />} color="success" />
                                        </Grid>
                                    </Grid>
                                )}
                            </Box>
                        )}

                        {/* Medications */}
                        {report.medications && report.medications.length > 0 && (
                            <Box>
                                <SectionHeader icon={<MedicalServicesIcon />} title="Medications Administered" color="success.main" />
                                <Paper variant="outlined">
                                    <Stack divider={<Divider />}>
                                        {report.medications.map((med, idx) => (
                                            <Box key={idx} sx={{ p: 2 }}>
                                                <Stack direction="row" justifyContent="space-between" alignItems="center">
                                                    <Stack direction="row" spacing={2} alignItems="center">
                                                        <Box sx={{ w: 8, h: 8, borderRadius: '50%', bgcolor: 'success.main' }} />
                                                        <Typography variant="body2" fontWeight={700}>{med.name || med}</Typography>
                                                        {med.dose && <Typography variant="caption" sx={{ px: 1, py: 0.2, bgcolor: 'action.hover', borderRadius: 1 }}>{med.dose}</Typography>}
                                                    </Stack>
                                                    {med.time && <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>@ {med.time}</Typography>}
                                                </Stack>
                                            </Box>
                                        ))}
                                    </Stack>
                                </Paper>
                            </Box>
                        )}

                        {/* Care Given */}
                        {(report.care_given || report.interventions) && (
                            <Box>
                                <SectionHeader icon={<MedicalServicesIcon />} title="Care Provided" color="secondary.main" />
                                <Paper variant="outlined" sx={{ p: 2.5, bgcolor: 'action.hover', fontSize: '14px' }}>
                                    {report.care_given || report.interventions}
                                </Paper>
                            </Box>
                        )}

                        {/* Observations */}
                        {(report.observation || report.Observation || report.observations || report.notes) && (
                            <Box>
                                <SectionHeader icon={<NotesIcon />} title="Clinical Observations" color="warning.main" />
                                <Paper variant="outlined" sx={{ p: 2.5, bgcolor: 'action.hover', fontSize: '14px' }}>
                                    {report.observation || report.Observation || report.observations || report.notes}
                                </Paper>
                            </Box>
                        )}

                        {/* Recommendations */}
                        {(report.recommendation || report.Recommendation || report.plan) && (
                            <Box>
                                <SectionHeader icon={<TipsAndUpdatesIcon />} title="Recommendations / Plan" color="primary.main" />
                                <Paper variant="outlined" sx={{ p: 2.5, bgcolor: 'action.hover', fontSize: '14px' }}>
                                    {report.recommendation || report.Recommendation || report.plan}
                                </Paper>
                            </Box>
                        )}

                        {/* Raw Transcript */}
                        <Box sx={{ mt: 4 }} className="no-print">
                            <SectionHeader icon={<HistoryIcon />} title="Raw Transcript" color="text.secondary" />
                            <Paper variant="outlined" sx={{ p: 2.5, bgcolor: 'action.selected', color: 'text.secondary', fontFamily: 'monospace', fontSize: '12px' }}>
                                {handoff.transcript}
                            </Paper>
                        </Box>
                    </Stack>
                ) : (
                    <Box sx={{ height: 400, display: 'flex', flexDirection: 'column' }}>
                        <Box sx={{ 
                            flex: 1, 
                            bgcolor: 'action.hover', 
                            borderRadius: 3, 
                            p: 3, 
                            overflowY: 'auto',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 2
                        }}>
                            {chatMessages.length === 0 ? (
                                <Box sx={{ m: 'auto', textAlign: 'center', opacity: 0.5 }}>
                                    <SmartToyIcon sx={{ fontSize: 64, mb: 2 }} />
                                    <Typography variant="h6" fontWeight={800}>AI Clinical Assistant</Typography>
                                    <Typography variant="body2">Ask questions about this report, vitals, or med plan.</Typography>
                                </Box>
                            ) : (
                                chatMessages.map((msg, idx) => (
                                    <Box key={idx} sx={{ 
                                        alignSelf: msg.type === 'user' ? 'flex-end' : 'flex-start',
                                        maxWidth: '85%'
                                    }}>
                                        <Paper sx={{ 
                                            p: 1.5, 
                                            px: 2.5,
                                            borderRadius: 4,
                                            borderBottomRightRadius: msg.type === 'user' ? 0 : 4,
                                            borderBottomLeftRadius: msg.type === 'bot' ? 0 : 4,
                                            bgcolor: msg.type === 'user' ? 'primary.main' : 'background.paper',
                                            color: msg.type === 'user' ? 'white' : 'text.primary',
                                            boxShadow: 2
                                        }}>
                                            <Typography variant="body2">{msg.text}</Typography>
                                        </Paper>
                                    </Box>
                                ))
                            )}
                            {loading && (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 1, color: 'text.secondary' }}>
                                    <CircularProgress size={12} color="inherit" />
                                    <Typography variant="caption">Assistant is thinking...</Typography>
                                </Box>
                            )}
                        </Box>

                        <Box component="form" onSubmit={handleAskQuestion} sx={{ mt: 2, display: 'flex', gap: 1 }}>
                            <TextField 
                                fullWidth 
                                size="small" 
                                placeholder="Ask about medications, vitals history..." 
                                value={question} 
                                onChange={(e) => setQuestion(e.target.value)}
                                sx={{ bgcolor: 'background.paper', borderRadius: 2 }}
                            />
                            <Button 
                                type="submit" 
                                variant="contained" 
                                disabled={loading || !question.trim()} 
                                endIcon={<SendIcon />}
                                sx={{ borderRadius: 2, px: 3 }}
                            >
                                Send
                            </Button>
                        </Box>
                    </Box>
                )}
            </DialogContent>
        </Dialog>
    );
};

const SectionHeader = ({ icon, title, color }) => (
    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2, pb: 1, borderBottom: 1, borderColor: 'divider' }}>
        <Box sx={{ color }}>{icon}</Box>
        <Typography variant="subtitle1" fontWeight={800} color="text.primary">{title}</Typography>
    </Stack>
);

const InfoCard = ({ label, value }) => (
    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
        <Typography variant="caption" sx={{ textTransform: 'uppercase', fontWeight: 800, color: 'text.secondary', display: 'block', mb: 0.5 }}>
            {label}
        </Typography>
        <Typography variant="body2" fontWeight={700} noWrap>{value || 'N/A'}</Typography>
    </Paper>
);

const VitalCardSmall = ({ label, value, unit, icon, color }) => {
    let displayValue = typeof value === 'object' ? (value?.value || value?.val || '--') : (value || '--');
    
    return (
        <Paper variant="outlined" sx={{ 
            p: 1.5, 
            textAlign: 'center', 
            borderRadius: 3,
            bgcolor: `${color}.lighter`,
            borderColor: `${color}.main`,
            color: `${color}.main`,
            transition: 'all 0.2s',
            '&:hover': { transform: 'scale(1.05)' }
        }}>
            <Box sx={{ mb: 0.5 }}>{icon}</Box>
            <Typography variant="h6" fontWeight={800} sx={{ lineHeight: 1 }}>{displayValue}</Typography>
            <Typography variant="caption" sx={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', opacity: 0.7 }}>{label}</Typography>
            {unit && <Typography variant="caption" sx={{ display: 'block', fontSize: '8px', mt: -0.2 }}>{unit}</Typography>}
        </Paper>
    );
};

export default ViewHandoffModal;
