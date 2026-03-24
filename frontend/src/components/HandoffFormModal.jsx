import React, { useState } from 'react';
import RecordingModal from './RecordingModal';

// MUI Components
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import FormControl from '@mui/material/FormControl';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import InputLabel from '@mui/material/InputLabel';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import IconButton from '@mui/material/IconButton';

// Icons
import CloseIcon from '@mui/icons-material/Close';
import MicIcon from '@mui/icons-material/Mic';
import SaveIcon from '@mui/icons-material/Save';

const HandoffFormModal = ({ isOpen, onClose, onSubmit, patients = [], user }) => {
    const [formData, setFormData] = useState({
        patient_id: '',
        nurse_name: user?.full_name || '',
        shift: '',
        transcript: ''
    });
    const [showRecorder, setShowRecorder] = useState(false);
    const [error, setError] = useState('');

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleTranscript = (text) => {
        setFormData(prev => ({ 
            ...prev, 
            transcript: prev.transcript ? prev.transcript + ' ' + text : text 
        }));
        setShowRecorder(false);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        setError('');
        
        if (!formData.patient_id || !formData.shift || !formData.transcript) {
            setError('Please fill in all required fields.');
            return;
        }
        
        onSubmit(formData);
    };

    return (
        <>
            <Dialog 
                open={isOpen} 
                onClose={onClose} 
                maxWidth="md" 
                fullWidth
                PaperProps={{ sx: { borderRadius: 3 } }}
            >
                <DialogTitle sx={{ 
                    borderBottom: 1, 
                    borderColor: 'divider', 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    py: 2
                }}>
                    <Typography variant="h5" fontWeight={800}>Record Handoff</Typography>
                    <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
                </DialogTitle>

                <DialogContent sx={{ p: 4 }}>
                    <Stack spacing={4}>
                        {error && <Alert severity="error">{error}</Alert>}

                        <Grid container spacing={3}>
                            <Grid item xs={12} md={4}>
                                <FormControl fullWidth required>
                                    <InputLabel>Patient</InputLabel>
                                    <Select
                                        name="patient_id"
                                        label="Patient"
                                        value={formData.patient_id}
                                        onChange={handleChange}
                                    >
                                        <MenuItem value=""><em>Select patient...</em></MenuItem>
                                        {patients.map(p => (
                                            <MenuItem key={p.patient_id} value={p.patient_id}>
                                                {p.patient_name} ({p.room_number || 'Room TBD'})
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            </Grid>

                            <Grid item xs={12} md={4}>
                                <TextField
                                    fullWidth
                                    label="Nurse Name"
                                    name="nurse_name"
                                    value={formData.nurse_name}
                                    InputProps={{ readOnly: true }}
                                    variant="outlined"
                                    sx={{ bgcolor: 'action.hover' }}
                                />
                            </Grid>

                            <Grid item xs={12} md={4}>
                                <FormControl fullWidth required>
                                    <InputLabel>Shift</InputLabel>
                                    <Select
                                        name="shift"
                                        label="Shift"
                                        value={formData.shift}
                                        onChange={handleChange}
                                    >
                                        <MenuItem value=""><em>Select...</em></MenuItem>
                                        <MenuItem value="Day">Day</MenuItem>
                                        <MenuItem value="Evening">Evening</MenuItem>
                                        <MenuItem value="Night">Night</MenuItem>
                                    </Select>
                                </FormControl>
                            </Grid>
                        </Grid>

                        <Box>
                            <Typography variant="subtitle2" fontWeight={700} color="text.secondary" gutterBottom>
                                Handoff Transcript *
                            </Typography>
                            <TextField
                                multiline
                                rows={6}
                                fullWidth
                                placeholder="Enter or record the handoff report..."
                                name="transcript"
                                value={formData.transcript}
                                onChange={handleChange}
                                InputProps={{
                                    sx: { fontFamily: 'monospace', fontSize: '0.9rem' }
                                }}
                            />
                            <Box sx={{ mt: 2 }}>
                                <Button
                                    variant="contained"
                                    color="error"
                                    startIcon={<MicIcon />}
                                    onClick={() => setShowRecorder(true)}
                                    sx={{ borderRadius: 10, px: 3, fontWeight: 700 }}
                                >
                                    Record Voice
                                </Button>
                            </Box>
                        </Box>
                    </Stack>
                </DialogContent>

                <DialogActions sx={{ p: 3, borderTop: 1, borderColor: 'divider' }}>
                    <Button onClick={onClose} variant="text" color="inherit">Cancel</Button>
                    <Button 
                        onClick={handleSubmit} 
                        variant="contained" 
                        color="success" 
                        startIcon={<SaveIcon />}
                        sx={{ px: 4, fontWeight: 700 }}
                    >
                        Save Handoff
                    </Button>
                </DialogActions>
            </Dialog>

            {showRecorder && (
                <RecordingModal
                    onClose={() => setShowRecorder(false)}
                    onTranscript={handleTranscript}
                />
            )}
        </>
    );
};

export default HandoffFormModal;
