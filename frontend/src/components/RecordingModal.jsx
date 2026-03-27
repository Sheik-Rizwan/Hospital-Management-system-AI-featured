import React, { useState, useRef, useEffect } from "react";
import { API_BASE, getAuthHeaders } from "../utils/api";

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
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import { styled, keyframes } from '@mui/material/styles';

// Icons
import MicIcon from '@mui/icons-material/Mic';
import StopIcon from '@mui/icons-material/Stop';
import CloseIcon from '@mui/icons-material/Close';

const pulse = keyframes`
  0% { transform: scale(1); opacity: 0.5; }
  50% { transform: scale(1.2); opacity: 0.2; }
  100% { transform: scale(1); opacity: 0.5; }
`;

const ping = keyframes`
  75%, 100% { transform: scale(2); opacity: 0; }
`;

const RecordingButton = styled(IconButton, {
  shouldForwardProp: (prop) => prop !== 'isRecording'
})(({ theme, isRecording }) => ({
  width: 80,
  height: 80,
  backgroundColor: isRecording ? theme.palette.error.main : theme.palette.primary.main,
  color: 'white',
  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  '&:hover': {
    backgroundColor: isRecording ? theme.palette.error.dark : theme.palette.primary.dark,
    transform: 'scale(1.05)',
  },
  '&:active': { transform: 'scale(0.95)' },
  boxShadow: theme.shadows[4]
}));

const RecordingModal = ({ onClose, onTranscript }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState("");
  const [stream, setStream] = useState(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const stopMediaStream = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  };

  useEffect(() => {
    return () => stopMediaStream();
  }, [stream]);

  const startRecording = async () => {
    setError("");
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setStream(mediaStream);

      const mediaRecorder = new MediaRecorder(mediaStream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      setError("Could not access microphone. Please allow permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/wav" });
        await sendAudioToBackend(audioBlob);
        stopMediaStream();
      };
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleCancel = () => {
    if (isRecording && mediaRecorderRef.current) mediaRecorderRef.current.stop();
    stopMediaStream();
    onClose();
  };

  const sendAudioToBackend = async (audioBlob) => {
    setIsProcessing(true);
    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.wav");
      const headers = getAuthHeaders();
      delete headers["Content-Type"];

      const res = await fetch(`${API_BASE}/nurse/transcribe-audio`, {
        method: "POST",
        headers: headers,
        body: formData,
      });

      const data = await res.json();
      if (data.success) {
        onTranscript(data.transcript);
        onClose();
      } else {
        setError(data.error || "Transcription failed");
      }
    } catch (err) {
      setError("Failed to send audio for transcription.");
    }
    setIsProcessing(false);
  };

  return (
    <Dialog 
        open 
        onClose={handleCancel} 
        maxWidth="xs" 
        fullWidth
        PaperProps={{ sx: { borderRadius: 4, bgcolor: 'background.paper' } }}
    >
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 0 }}>
        <Typography variant="h6" fontWeight={800} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ color: 'error.main', p: 0.5 }}></Box> 
          Voice Recording
        </Typography>
        <IconButton onClick={handleCancel} size="small"><CloseIcon /></IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 4, textAlign: 'center' }}>
        <Stack spacing={4} alignItems="center" sx={{ py: 2 }}>
            {error && <Alert severity="error" sx={{ width: '100%', borderRadius: 2 }}>{error}</Alert>}

            <Box sx={{ position: 'relative' }}>
                {isRecording && (
                    <>
                        <Box sx={{ 
                            position: 'absolute', 
                            inset: -10, 
                            borderRadius: '50%', 
                            bgcolor: 'error.main', 
                            animation: `${ping} 1.5s cubic-bezier(0, 0, 0.2, 1) infinite`,
                            opacity: 0.2 
                        }} />
                        <Box sx={{ 
                            position: 'absolute', 
                            inset: -20, 
                            borderRadius: '50%', 
                            bgcolor: 'error.main', 
                            animation: `${pulse} 2s ease-in-out infinite`,
                            opacity: 0.1 
                        }} />
                    </>
                )}
                
                <RecordingButton 
                    isRecording={isRecording} 
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={isProcessing}
                >
                    {isProcessing ? (
                        <CircularProgress color="inherit" size={40} />
                    ) : isRecording ? (
                        <StopIcon sx={{ fontSize: 40 }} />
                    ) : (
                        <MicIcon sx={{ fontSize: 40 }} />
                    )}
                </RecordingButton>
            </Box>

            <Box>
                <Typography variant="h6" fontWeight={700}>
                    {isProcessing ? "Transcribing..." : isRecording ? "Recording..." : "Ready to Record"}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    {isRecording ? "Tap to Stop" : "Tap the microphone to start"}
                </Typography>
            </Box>

            {isRecording && !isProcessing && (
                <Button 
                    variant="contained" 
                    color="error" 
                    onClick={stopRecording}
                    startIcon={<StopIcon />}
                    sx={{ borderRadius: 10, px: 4, py: 1.5, fontWeight: 800 }}
                >
                    Stop & Process
                </Button>
            )}

            {!isRecording && !isProcessing && (
                <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 200, display: 'block' }}>
                    Speak clearly. AI will transcribe and format your report automatically.
                </Typography>
            )}
        </Stack>
      </DialogContent>
    </Dialog>
  );
};

export default RecordingModal;
