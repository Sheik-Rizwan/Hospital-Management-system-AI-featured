import React, { useState, useEffect, useRef, useCallback } from 'react';
import { API_BASE, getAuthHeaders, formatDate } from '../utils/api';
import { useSocket } from '../hooks/useSocket';

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
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Avatar from '@mui/material/Avatar';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import MicIcon from '@mui/icons-material/Mic';
import SendIcon from '@mui/icons-material/Send';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import CircularProgress from '@mui/material/CircularProgress';
import Tooltip from '@mui/material/Tooltip';

const SocketChatRoom = ({ chat, onBack, authRole = '' }) => {
    // Prefer role-specific user to avoid cross-role contamination in same browser
    const user = JSON.parse(
        (authRole ? sessionStorage.getItem(`${authRole}_user`) : null) ||
        sessionStorage.getItem('user') ||
        '{}'
    );
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [typingLabel, setTypingLabel] = useState('');
    const [isRecording, setIsRecording] = useState(false);
    const messagesEndRef = useRef(null);
    const typingTimerRef = useRef(null);
    const recognitionRef = useRef(null);
    const fileInputRef = useRef(null);

    // ── helpers ──────────────────────────────────────────────
    const authHeaders = useCallback(() => getAuthHeaders(authRole || user?.role || ''), [authRole, user?.role]);

    const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });

    // ── load history (REST) ──────────────────────────────────
    const loadHistory = useCallback(async () => {
        if (!chat?.chat_id) return;
        try {
            const res = await fetch(`${API_BASE}/chat/${chat.chat_id}/messages?limit=100`, {
                headers: authHeaders()
            });
            const data = await res.json();
            if (data.success) {
                setMessages(data.messages || []);
            }
        } catch (e) {
            console.error('Error loading history:', e);
        } finally {
            setLoading(false);
        }
    }, [chat?.chat_id, authHeaders]);

    // ── socket events ─────────────────────────────────────────
    const socket = useSocket({
        new_message: (msg) => {
            if (msg.chat_id === chat?.chat_id) {
                setMessages(prev => {
                    // Deduplicate by message_id
                    if (prev.some(m => m.message_id === msg.message_id)) return prev;
                    return [...prev, msg];
                });
            }
        },
        user_typing: (data) => {
            if (data.sender_id !== user.user_id) {
                setTypingLabel(`${data.sender_name} is typing…`);
                clearTimeout(typingTimerRef.current);
                if (data.is_typing !== false) {
                    typingTimerRef.current = setTimeout(() => setTypingLabel(''), 3000);
                } else {
                    setTypingLabel('');
                }
            }
        },
        joined_chat: () => {
            loadHistory();
        }
    });

    // ── mount: join socket room ────────────────────────────────
    useEffect(() => {
        if (!chat?.chat_id) return;
        setLoading(true);
        loadHistory();

        socket.emit('join_chat', { chat_id: chat.chat_id });

        return () => {
            socket.emit('leave_chat', { chat_id: chat.chat_id });
            clearTimeout(typingTimerRef.current);
        };
    }, [chat?.chat_id]); // eslint-disable-line

    // Auto-scroll on new messages
    useEffect(() => scrollToBottom(), [messages, typingLabel]);

    // ── send message ──────────────────────────────────────────
    const sendMessage = useCallback(async () => {
        const content = newMessage.trim();
        if (!content || sending) return;

        setSending(true);
        setNewMessage('');

        socket.emit('chat_message', {
            chat_id: chat.chat_id,
            content,
            sender_id: user.user_id,
            sender_name: user.full_name || user.company_name || 'Unknown',
            sender_role: user.role || '',
            message_type: 'text'
        });

        setSending(false);
    }, [newMessage, sending, chat, user, socket]);

    // Emit typing indicator when user types
    const handleTyping = (e) => {
        setNewMessage(e.target.value);
        socket.emit('typing', {
            chat_id: chat.chat_id,
            sender_id: user.user_id,
            sender_name: user.full_name || user.company_name || 'Someone',
            is_typing: true
        });
        clearTimeout(typingTimerRef.current);
        typingTimerRef.current = setTimeout(() => {
            socket.emit('typing', {
                chat_id: chat.chat_id,
                sender_id: user.user_id,
                sender_name: user.full_name || user.company_name || 'Someone',
                is_typing: false
            });
        }, 1500);
    };

    // ── voice input (speech-to-text) ─────────────────────────
    const toggleVoice = () => {
        if (isRecording) {
            recognitionRef.current?.stop();
            setIsRecording(false);
            return;
        }
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) { return; }
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';
        recognition.onresult = (e) => {
            const transcript = e.results[0][0].transcript;
            setNewMessage(prev => prev ? `${prev} ${transcript}` : transcript);
        };
        recognition.onend = () => setIsRecording(false);
        recognition.onerror = () => setIsRecording(false);
        recognitionRef.current = recognition;
        recognition.start();
        setIsRecording(true);
    };

    // ── file upload ───────────────────────────────────────────
    const handleFileUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('file', file);
        try {
            const token = sessionStorage.getItem(`${authRole}_token`) || sessionStorage.getItem('token');
            const res = await fetch(`${API_BASE}/chat/upload`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });
            const data = await res.json();
            if (data.success) {
                socket.emit('chat_message', {
                    chat_id: chat.chat_id,
                    content: data.file_name,
                    sender_id: user.user_id,
                    sender_name: user.full_name || user.company_name || 'Unknown',
                    sender_role: user.role || '',
                    message_type: 'file',
                    file_url: data.file_url,
                    file_name: data.file_name
                });
            }
        } catch (e) {
            console.error('File upload error:', e);
        }
        e.target.value = '';
    };

    const isMe = (msg) => msg.sender_id === user.user_id;

    const renderContent = (msg) => {
        if (msg.type === 'file' || msg.type === 'image') {
            const isImage = msg.type === 'image' ||
                (msg.file_name || '').match(/\.(png|jpg|jpeg|gif|webp)$/i);
            const url = msg.file_url?.startsWith('/')
                ? `${API_BASE.replace('/api', '')}${msg.file_url}`
                : msg.file_url;
            if (isImage) return <Box component="img" src={url} alt={msg.file_name} sx={{ maxWidth: '100%', borderRadius: 2, mt: 1, display: 'block' }} />;
            return (
                <Button 
                    href={url} 
                    target="_blank" 
                    startIcon={<AttachFileIcon />} 
                    sx={{ textTransform: 'none', color: isMe(msg) ? 'white' : 'primary.main', bgcolor: 'action.hover', mt: 1 }}
                >
                    {msg.file_name || 'Download file'}
                </Button>
            );
        }
        return <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.content}</Typography>;
    };

    const other = chat?.other_participant || {};

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: 'background.default', border: '1px solid', borderColor: 'divider', borderRadius: 3, overflow: 'hidden' }}>
            {/* Header */}
            <Paper square elevation={0} sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                <IconButton onClick={onBack} size="small"><ArrowBackIcon /></IconButton>
                <Avatar sx={{ width: 44, height: 44, bgcolor: 'primary.main', fontWeight: 800 }}>
                    {(other.name || '?')[0].toUpperCase()}
                </Avatar>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle1" fontWeight={700} noWrap>{other.name || 'Chat'}</Typography>
                    <Stack direction="row" spacing={1} alignItems="center">
                        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'success.main' }} />
                        <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'capitalize' }}>{other.role || 'Member'}</Typography>
                    </Stack>
                </Box>
                <IconButton size="small"><MoreVertIcon /></IconButton>
            </Paper>

            {/* Messages Area */}
            <Box sx={{ flex: 1, overflowY: 'auto', p: 3, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress size={30} /></Box>
                ) : messages.length === 0 ? (
                    <Box sx={{ textAlign: 'center', py: 8, opacity: 0.4 }}>
                        <Typography variant="h2"></Typography>
                        <Typography variant="body2">Start a conversation with {other.name || 'this member'}</Typography>
                    </Box>
                ) : (
                    messages.map((msg) => {
                        const mine = isMe(msg);
                        return (
                            <Box key={msg.message_id} sx={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                                <Box sx={{ maxWidth: '75%', minWidth: '80px' }}>
                                    {!mine && (
                                        <Typography variant="caption" sx={{ ml: 1, fontWeight: 700, opacity: 0.6, fontSize: '0.65rem' }}>
                                            {msg.sender_name}
                                        </Typography>
                                    )}
                                    <Paper 
                                        elevation={0}
                                        sx={{ 
                                            p: 1.5, 
                                            borderRadius: 3, 
                                            borderTopLeftRadius: mine ? 3 : 0,
                                            borderTopRightRadius: mine ? 0 : 3,
                                            bgcolor: mine ? 'primary.main' : 'action.hover',
                                            color: mine ? 'white' : 'text.primary',
                                            border: mine ? 'none' : '1px solid',
                                            borderColor: 'divider'
                                        }}
                                    >
                                        {renderContent(msg)}
                                        <Typography variant="caption" sx={{ display: 'block', textAlign: 'right', mt: 0.5, opacity: 0.6, fontSize: '0.6rem' }}>
                                            {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                        </Typography>
                                    </Paper>
                                </Box>
                            </Box>
                        );
                    })
                )}
                {typingLabel && (
                    <Typography variant="caption" sx={{ fontStyle: 'italic', color: 'text.secondary', ml: 1 }}>
                        {typingLabel}
                    </Typography>
                )}
                <div ref={messagesEndRef} />
            </Box>

            {/* Input Footer */}
            <Paper square elevation={0} sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
                <Stack direction="row" spacing={1} alignItems="center">
                    <Tooltip title="Attach File">
                        <IconButton onClick={() => fileInputRef.current?.click()} size="small" sx={{ bgcolor: 'action.hover' }}>
                            <AttachFileIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                    <input ref={fileInputRef} type="file" className="hidden" style={{ display: 'none' }} onChange={handleFileUpload} />

                    <TextField
                        fullWidth
                        size="small"
                        placeholder="Type a clinical message..."
                        value={newMessage}
                        onChange={handleTyping}
                        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                        sx={{ '& .MuiOutlinedInput-root': { borderRadius: 4, bgcolor: 'action.hover' } }}
                    />

                    <Tooltip title={isRecording ? "Stop Recording" : "Voice Input"}>
                        <IconButton 
                            onClick={toggleVoice} 
                            size="small"
                            sx={{ 
                                bgcolor: isRecording ? 'error.main' : 'action.hover', 
                                color: isRecording ? 'white' : 'inherit',
                                '&:hover': { bgcolor: isRecording ? 'error.dark' : 'action.selected' }
                            }}
                        >
                            <MicIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>

                    <Button 
                        variant="contained" 
                        onClick={sendMessage} 
                        disabled={!newMessage.trim() || sending}
                        sx={{ borderRadius: 3, px: 3, minWidth: 'unset' }}
                    >
                        <SendIcon />
                    </Button>
                </Stack>
            </Paper>
        </Box>
    );
};

export default SocketChatRoom;
