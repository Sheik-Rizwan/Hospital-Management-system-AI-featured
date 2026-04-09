import React, { useState, useEffect, useRef } from "react";
import { API_BASE, getAuthHeaders, formatDate } from "../utils/api";
import SocketChatRoom from "./SocketChatRoom";

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
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import Avatar from '@mui/material/Avatar';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import IconButton from '@mui/material/IconButton';
import SearchIcon from '@mui/icons-material/Search';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import SendIcon from '@mui/icons-material/Send';
import PageHeader from './ui/PageHeader';
import PersonSearchIcon from '@mui/icons-material/PersonSearch';
import SendMeIcon from '@mui/icons-material/SendAndArchive';

const ChatInterface = ({ showNotify, filterRole, userRole }) => {
  const [tab, setTab] = useState("conversations"); // 'requests', 'conversations', 'search'
  const [requests, setRequests] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [chatLang, setChatLang] = useState('en-IN'); // language for mic input
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);

  // Read user from role-specific key
  const user = JSON.parse(
    (userRole ? sessionStorage.getItem(`${userRole}_user`) : null) ||
      sessionStorage.getItem("user") ||
      "{}",
  );
  const effectiveRole = userRole || user.role || "";
  const isVendor = effectiveRole === "vendor";
  const authH = () => getAuthHeaders(effectiveRole || user.role || "");

  const [searchQuery, setSearchQuery] = useState("");
  const [doctorResults, setDoctorResults] = useState([]);
  const [requestMessage, setRequestMessage] = useState("");
  const [showSendRequest, setShowSendRequest] = useState(null);

  useEffect(() => {
    loadRequests();
    loadConversations();
    const interval = setInterval(() => {
      if (activeChat) loadMessages(activeChat.chat_id);
      loadConversations();
    }, 5000);
    return () => clearInterval(interval);
  }, [activeChat]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadRequests = async () => {
    try {
      const direction = isVendor ? "sent" : "received";
      const res = await fetch(`${API_BASE}/chat/requests?direction=${direction}`, {
          headers: authH(),
      });
      const data = await res.json();
      if (data.success) {
        let reqs = data.requests || [];
        if (filterRole) {
          reqs = reqs.filter((r) => {
            if (isVendor) return r.target_role === filterRole || (!r.target_role && filterRole === "doctor");
            return (r.vendor_role || "vendor") === filterRole;
          });
        }
        setRequests(reqs);
      }
    } catch (e) {}
  };

  const loadConversations = async () => {
    try {
      const res = await fetch(`${API_BASE}/chat/conversations`, {
        headers: authH(),
      });
      const data = await res.json();
      if (data.success) {
        let convs = data.conversations || [];
        if (filterRole) convs = convs.filter((c) => c.other_participant?.role === filterRole);
        setConversations(convs);
      }
    } catch (e) {}
  };

  const loadMessages = async (chatId) => {
    try {
      const res = await fetch(`${API_BASE}/chat/${chatId}/messages`, {
        headers: authH(),
      });
      const data = await res.json();
      if (data.success) setMessages(data.messages || []);
    } catch (e) {}
  };

  const searchDoctors = async (query = "") => {
    try {
      const res = await fetch(`${API_BASE}/chat/doctors?q=${encodeURIComponent(query)}`, {
          headers: authH(),
      });
      const data = await res.json();
      if (data.success) setDoctorResults(data.doctors || []);
    } catch (e) {}
  };

  const startDirectChat = async (doctorId, doctorRole = "doctor") => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/chat/direct`, {
        method: "POST",
        headers: authH(),
        body: JSON.stringify({ target_id: doctorId, target_role: doctorRole }),
      });
      const data = await res.json();
      if (data.success) {
        setActiveChat(data.chat);
        loadMessages(data.chat.chat_id);
        loadConversations();
      } else {
        showNotify?.(data.error || "Failed to start chat", "error");
      }
    } catch (e) {
      showNotify?.("Error starting chat", "error");
    } finally {
      setLoading(false);
    }
  };

  const sendConnectionRequest = async (doctorId) => {
    try {
      const res = await fetch(`${API_BASE}/chat/request`, {
        method: "POST",
        headers: authH(),
        body: JSON.stringify({
          target_id: doctorId,
          target_role: "doctor",
          message: requestMessage,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showNotify?.("Connection request sent!", "success");
        setShowSendRequest(null);
        setRequestMessage("");
        loadRequests();
      } else {
        showNotify?.(data.error || "Failed to send request", "error");
      }
    } catch (e) {
      showNotify?.("Error sending request", "error");
    }
  };

  const openChat = (conv) => {
    setActiveChat(conv);
    loadMessages(conv.chat_id);
    setTab("conversations");
  };

  if (activeChat) {
    return (
      <Box sx={{ height: 'calc(100vh - 160px)', display: 'flex', flexDirection: 'column' }}>
        <SocketChatRoom
          chat={activeChat}
          authRole={user.role || ""}
          onBack={() => setActiveChat(null)}
        />
      </Box>
    );
  }

  return (
    <Stack spacing={4} sx={{ maxWidth: 1200, mx: 'auto' }}>
      <PageHeader 
        title={filterRole === "vendor" ? "Vendor Communications" : filterRole === "doctor" ? "Medical Support Chat" : "Clinical Messaging"}
        subtitle="Secure, real-time consultation and vendor coordination"
      />

      {/* Tabs */}
      <Stack direction="row" spacing={1.5}>
        <Button
          variant={tab === "conversations" ? "contained" : "outlined"}
          onClick={() => setTab("conversations")}
          startIcon={<ChatBubbleOutlineIcon />}
          sx={{ borderRadius: 2 }}
        >
          Conversations ({conversations.length})
        </Button>
        <Button
          variant={tab === "search" ? "contained" : "outlined"}
          onClick={() => { setTab("search"); searchDoctors(""); }}
          startIcon={<PersonSearchIcon />}
          sx={{ borderRadius: 2 }}
        >
          Find Members
        </Button>
        {isVendor && (
          <Button
            variant={tab === "requests" ? "contained" : "outlined"}
            onClick={() => setTab("requests")}
            startIcon={<SendMeIcon />}
            sx={{ borderRadius: 2 }}
          >
            My Requests {requests.filter(r => r.status === "pending").length > 0 && (
              <Chip label={requests.filter(r => r.status === "pending").length} size="small" color="error" sx={{ ml:1, height: 20 }} />
            )}
          </Button>
        )}
      </Stack>

      {/* Conversations Tab */}
      {tab === "conversations" && (
        <Grid container spacing={2}>
          {conversations.length === 0 ? (
            <Grid item xs={12}>
              <Card variant="outlined" sx={{ py: 12, textAlign: 'center', bgcolor: 'action.hover', borderStyle: 'dashed' }}>
                 <Typography variant="h2" sx={{ opacity: 0.1, mb: 2 }}></Typography>
                 <Typography variant="h6" color="text.secondary">No active conversations</Typography>
                 <Button onClick={() => setTab("search")} sx={{ mt: 2 }}>Search for members </Button>
              </Card>
            </Grid>
          ) : (
            conversations.map((conv) => (
              <Grid item xs={12} key={conv.chat_id}>
                <Card variant="outlined" onClick={() => openChat(conv)} sx={{ cursor: 'pointer', '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' }, transition: '0.2s' }}>
                  <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2.5, p: 2.5, '&:last-child': { pb: 2.5 } }}>
                    <Avatar sx={{ width: 56, height: 56, bgcolor: 'primary.main', fontWeight: 800 }}>
                      {(conv.other_participant?.name || "?")[0].toUpperCase()}
                    </Avatar>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="subtitle1" fontWeight={700}>{conv.other_participant?.name || "Unknown"}</Typography>
                      <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                        {conv.other_participant?.phone || conv.other_participant?.email || conv.other_participant?.role}
                      </Typography>
                      {conv.last_message && (
                        <Typography variant="body2" color="text.secondary" noWrap sx={{ mt: 0.5 }}>
                          {conv.last_message.content}
                        </Typography>
                      )}
                    </Box>
                    <Typography variant="caption" color="text.disabled">{conv.last_message?.timestamp ? formatDate(conv.last_message.timestamp) : ''}</Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))
          )}
        </Grid>
      )}

      {/* Requests Tab */}
      {tab === "requests" && (
        <Stack spacing={2}>
          {requests.length === 0 ? (
             <Card variant="outlined" sx={{ py: 12, textAlign: 'center', bgcolor: 'action.hover', borderStyle: 'dashed' }}>
                <Typography variant="h2" sx={{ opacity: 0.1, mb: 2 }}></Typography>
                <Typography variant="h6" color="text.secondary">No sent requests</Typography>
             </Card>
          ) : (
            requests.map((req) => (
              <Card key={req.request_id} variant="outlined">
                <CardContent sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 2 }}>
                  <Box>
                    <Typography variant="subtitle1" fontWeight={700}>To: {req.target_name || "Doctor"}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>{req.message}</Typography>
                    <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                       <Typography variant="caption" color="text.disabled">{formatDate(req.created_at)}</Typography>
                       <Chip label={req.status} size="small" color={req.status === 'accepted' ? 'success' : req.status === 'pending' ? 'warning' : 'error'} variant="soft" sx={{ height: 18, fontSize: '0.6rem', fontWeight: 700 }} />
                    </Stack>
                  </Box>
                  {req.status === 'accepted' && (
                    <Button variant="contained" size="small" onClick={() => startDirectChat(req.target_id, "doctor")}>Open Chat</Button>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </Stack>
      )}

      {/* Search Tab */}
      {tab === "search" && (
        <Stack spacing={3}>
          <TextField
            fullWidth
            placeholder="Search providers by name, department, or specialty..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && searchDoctors(searchQuery)}
            InputProps={{
              startAdornment: <InputAdornment position="start"><SearchIcon color="disabled"/></InputAdornment>,
              endAdornment: <InputAdornment position="end"><Button onClick={() => searchDoctors(searchQuery)}>Search</Button></InputAdornment>
            }}
          />
          <Grid container spacing={2}>
            {doctorResults.map((doc) => (
              <Grid item xs={12} sm={6} key={doc.user_id}>
                <Card variant="outlined">
                  <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Avatar sx={{ bgcolor: 'secondary.main' }}>{(doc.full_name || "?")[0]}</Avatar>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="subtitle2" fontWeight={700}>Dr. {doc.full_name}</Typography>
                      <Typography variant="caption" color="text.secondary">{doc.specialization} • {doc.department}</Typography>
                    </Box>
                    {isVendor ? (
                        showSendRequest === doc.user_id ? (
                            <Stack spacing={1}>
                                <TextField size="small" placeholder="Intro message..." value={requestMessage} onChange={(e) => setRequestMessage(e.target.value)} />
                                <Stack direction="row" spacing={1}>
                                    <Button size="small" variant="contained" onClick={() => sendConnectionRequest(doc.user_id)}>Send</Button>
                                    <Button size="small" onClick={() => setShowSendRequest(null)}>Cancel</Button>
                                </Stack>
                            </Stack>
                        ) : (
                            <Button size="small" variant="outlined" onClick={() => setShowSendRequest(doc.user_id)}>Connect</Button>
                        )
                    ) : (
                        <Button variant="contained" size="small" onClick={() => startDirectChat(doc.user_id, "doctor")}>Chat</Button>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Stack>
      )}
    </Stack>
  );
};

export default ChatInterface;
