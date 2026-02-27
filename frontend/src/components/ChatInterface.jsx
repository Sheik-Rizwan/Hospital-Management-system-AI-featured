import React, { useState, useEffect, useRef } from 'react';
import { API_BASE, getAuthHeaders, formatDate } from '../utils/api';
import SocketChatRoom from './SocketChatRoom';

/**
 * WhatsApp-style Chat Interface.
 * Doctors can directly click a doctor/vendor to start chatting (no connection request needed).
 * Vendors still use connection requests to reach doctors.
 * Features: text, speech-to-text mic, file/image sharing with inline preview.
 */
const ChatInterface = ({ showNotify, filterRole, userRole }) => {
    const [tab, setTab] = useState('conversations'); // 'requests', 'conversations', 'search'
    const [requests, setRequests] = useState([]);
    const [conversations, setConversations] = useState([]);
    const [activeChat, setActiveChat] = useState(null);
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const messagesEndRef = useRef(null);
    const fileInputRef = useRef(null);
    const recognitionRef = useRef(null);
    // Read user from role-specific key when userRole is provided to avoid cross-role contamination
    const user = JSON.parse(
        (userRole ? sessionStorage.getItem(`${userRole}_user`) : null) ||
        sessionStorage.getItem('user') ||
        '{}'
    );
    const effectiveRole = userRole || user.role || '';
    const isVendor = effectiveRole === 'vendor';
    const isDoctor = effectiveRole === 'doctor';
    // Use role-specific token so both doctors and vendors authenticate correctly
    const authH = () => getAuthHeaders(effectiveRole || user.role || '');

    // Doctor search
    const [searchQuery, setSearchQuery] = useState('');
    const [doctorResults, setDoctorResults] = useState([]);
    const [requestMessage, setRequestMessage] = useState('');
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
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const loadRequests = async () => {
        try {
            const direction = isVendor ? 'sent' : 'received';
            const res = await fetch(`${API_BASE}/chat/requests?direction=${direction}`, {
                headers: authH()
            });
            const data = await res.json();
            if (data.success) {
                let reqs = data.requests || [];
                if (filterRole) {
                    reqs = reqs.filter(r => {
                        if (isVendor) return r.target_role === filterRole || (!r.target_role && filterRole === 'doctor');
                        return (r.vendor_role || 'vendor') === filterRole;
                    });
                }
                setRequests(reqs);
            }
        } catch (e) { }
    };

    const loadConversations = async () => {
        try {
            const res = await fetch(`${API_BASE}/chat/conversations`, {
                headers: authH()
            });
            const data = await res.json();
            if (data.success) {
                let convs = data.conversations || [];
                if (filterRole) {
                    convs = convs.filter(c => c.other_participant?.role === filterRole);
                }
                setConversations(convs);
            }
        } catch (e) { }
    };

    const loadMessages = async (chatId) => {
        try {
            const res = await fetch(`${API_BASE}/chat/${chatId}/messages`, {
                headers: authH()
            });
            const data = await res.json();
            if (data.success) setMessages(data.messages || []);
        } catch (e) { }
    };

    const handleRespondRequest = async (requestId, action) => {
        try {
            const res = await fetch(`${API_BASE}/chat/request/${requestId}`, {
                method: 'PUT',
                headers: authH(),
                body: JSON.stringify({ action })
            });
            const data = await res.json();
            if (data.success) {
                showNotify?.(`Request ${action}ed`, 'success');
                loadRequests();
                if (action === 'accept') loadConversations();
            } else {
                showNotify?.(data.error || 'Failed', 'error');
            }
        } catch (e) { showNotify?.('Error responding to request', 'error'); }
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file || !activeChat) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            setLoading(true);
            const uploadRes = await fetch(`${API_BASE}/chat/upload`, {
                method: 'POST',
                headers: { 'Authorization': authH()['Authorization'] },
                body: formData
            });
            const uploadData = await uploadRes.json();
            
            if (uploadData.success) {
                // Build the full URL — backend returns /uploads/filename
                const fileUrl = `${API_BASE}${uploadData.file_url}`;
                const res = await fetch(`${API_BASE}/chat/${activeChat.chat_id}/messages`, {
                    method: 'POST',
                    headers: authH(),
                    body: JSON.stringify({
                        content: file.name,
                        type: 'file',
                        file_url: fileUrl,
                        file_name: uploadData.file_name
                    })
                });
                const data = await res.json();
                if (data.success) {
                    setMessages(prev => [...prev, data.message]);
                }
            } else {
                showNotify?.(uploadData.error || 'Upload failed', 'error');
            }
        } catch (e) { showNotify?.('Failed to upload file', 'error'); }
        setLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!newMessage.trim() || !activeChat) return;
        try {
            const res = await fetch(`${API_BASE}/chat/${activeChat.chat_id}/messages`, {
                method: 'POST',
                headers: authH(),
                body: JSON.stringify({ content: newMessage, type: 'text' })
            });
            const data = await res.json();
            if (data.success) {
                setMessages(prev => [...prev, data.message]);
                setNewMessage('');
            }
        } catch (e) { showNotify?.('Failed to send message', 'error'); }
    };

    // Search doctors (auto-load all if no query)
    const searchDoctors = async (query = '') => {
        try {
            const res = await fetch(`${API_BASE}/chat/doctors?q=${encodeURIComponent(query)}`, {
                headers: authH()
            });
            const data = await res.json();
            if (data.success) setDoctorResults(data.doctors || []);
        } catch (e) { }
    };

    // Start direct chat with a doctor (no connection request)
    const startDirectChat = async (doctorId, doctorRole = 'doctor') => {
        try {
            setLoading(true);
            const res = await fetch(`${API_BASE}/chat/direct`, {
                method: 'POST',
                headers: authH(),
                body: JSON.stringify({ target_id: doctorId, target_role: doctorRole })
            });
            const data = await res.json();
            if (data.success) {
                setActiveChat(data.chat);
                loadMessages(data.chat.chat_id);
                loadConversations();
            } else {
                showNotify?.(data.error || 'Failed to start chat', 'error');
            }
        } catch (e) { showNotify?.('Error starting chat', 'error'); }
        setLoading(false);
    };

    // Vendor: send connection request (vendors still use this flow)
    const sendConnectionRequest = async (doctorId) => {
        try {
            const res = await fetch(`${API_BASE}/chat/request`, {
                method: 'POST',
                headers: authH(),
                body: JSON.stringify({
                    target_id: doctorId,
                    target_role: 'doctor',
                    message: requestMessage
                })
            });
            const data = await res.json();
            if (data.success) {
                showNotify?.('Connection request sent!', 'success');
                setShowSendRequest(null);
                setRequestMessage('');
                loadRequests();
            } else {
                showNotify?.(data.error || 'Failed to send request', 'error');
            }
        } catch (e) { showNotify?.('Error sending request', 'error'); }
    };

    const openChat = (conv) => {
        setActiveChat(conv);
        loadMessages(conv.chat_id);
        setTab('conversations');
    };

    // Speech-to-text using Web Speech API
    const toggleRecording = () => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            showNotify?.('Speech recognition not supported in this browser', 'error');
            return;
        }

        if (isRecording && recognitionRef.current) {
            recognitionRef.current.stop();
            setIsRecording(false);
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            setNewMessage(prev => prev ? prev + ' ' + transcript : transcript);
            setIsRecording(false);
        };
        recognition.onerror = () => { setIsRecording(false); };
        recognition.onend = () => { setIsRecording(false); };

        recognitionRef.current = recognition;
        recognition.start();
        setIsRecording(true);
    };

    // Helper: check if a file URL is an image
    const isImageFile = (url) => {
        if (!url) return false;
        return /\.(jpg|jpeg|png|gif|webp|bmp)(\?.*)?$/i.test(url);
    };

    // ============ ACTIVE CHAT VIEW (Socket.IO real-time) ============
    if (activeChat) {
        return (
            <SocketChatRoom
                chat={activeChat}
                authRole={user.role || ''}
                onBack={() => setActiveChat(null)}
            />
        );
    }

    // ============ legacy placeholder — never reached ============
    if (false) {
        const other = activeChat ? activeChat.other_participant || {} : {};
        return (
            <div className="flex flex-col h-full">
                {/* Chat Header */}
                <div className="flex items-center gap-3 p-4 bg-sidebar border-b border-border">
                    <button onClick={() => setActiveChat(null)} className="p-2 hover:bg-card rounded transition" title="Back">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                    </button>
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#10A37F] to-[#3B82F6] flex items-center justify-center text-white font-bold">
                        {(other.name || '?')[0].toUpperCase()}
                    </div>
                    <div className="flex-1">
                        <p className="font-bold text-foreground">{other.name || 'Unknown'}</p>
                        <p className="text-xs text-muted-foreground">
                            {other.phone && <span>📞 {other.phone}</span>}
                            {other.phone && other.email && <span> • </span>}
                            {other.email && <span>✉️ {other.email}</span>}
                            {!other.phone && !other.email && <span className="capitalize">{other.role}</span>}
                        </p>
                    </div>
                    <button onClick={() => setActiveChat(null)} className="px-3 py-1.5 bg-error hover:bg-[#DC2626] text-white rounded-lg text-sm transition font-medium" title="Exit Chat">
                        ✕ Exit
                    </button>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar" style={{backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23565869\' fill-opacity=\'0.08\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")'}}>
                    {messages.length === 0 && (
                        <div className="text-center py-12 text-muted-foreground">
                            <span className="text-4xl block mb-3">💬</span>
                            <p>No messages yet. Start the conversation!</p>
                        </div>
                    )}
                    {messages.map((msg, i) => {
                        const isMine = msg.sender_id === user.user_id;
                        return (
                            <div key={msg.message_id || i} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[70%] p-3 rounded-2xl ${
                                    isMine
                                        ? 'bg-primary text-white rounded-br-md'
                                        : 'bg-card text-foreground border border-border rounded-bl-md'
                                }`}>
                                    {/* Text content */}
                                    {msg.content && <p className="text-sm whitespace-pre-wrap">{msg.content}</p>}
                                    
                                    {/* File/Image attachment */}
                                    {msg.file_url && (
                                        isImageFile(msg.file_url) ? (
                                            <div className="mt-2">
                                                <img 
                                                    src={msg.file_url} 
                                                    alt={msg.file_name || 'Image'} 
                                                    className="max-w-full rounded-lg cursor-pointer hover:opacity-90 transition"
                                                    style={{maxHeight: '300px', objectFit: 'cover'}}
                                                    onClick={() => window.open(msg.file_url, '_blank')}
                                                />
                                            </div>
                                        ) : (
                                            <a href={msg.file_url} target="_blank" rel="noreferrer"
                                               className="flex items-center gap-2 mt-2 p-2 bg-black/20 rounded-lg hover:bg-black/30 transition">
                                                <span className="text-2xl">📄</span>
                                                <div>
                                                    <p className="text-sm font-medium">{msg.file_name || 'File'}</p>
                                                    <p className="text-xs opacity-60">Click to download</p>
                                                </div>
                                            </a>
                                        )
                                    )}
                                    
                                    <p className={`text-[10px] mt-1 ${isMine ? 'text-white/60' : 'text-muted-foreground'}`}>
                                        {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}) : ''}
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                    <div ref={messagesEndRef} />
                </div>

                {/* Message Input */}
                <form onSubmit={handleSendMessage} className="p-3 bg-sidebar border-t border-border flex gap-2 items-center">
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        className="hidden"
                        accept="image/*,.pdf,.doc,.docx"
                    />
                    <button 
                        type="button" 
                        onClick={() => fileInputRef.current?.click()}
                        className="p-3 bg-card text-text-secondary hover:text-white rounded-xl border border-border transition"
                        title="Attach file"
                    >
                        📎
                    </button>
                    <input
                        type="text"
                        value={newMessage}
                        onChange={e => setNewMessage(e.target.value)}
                        placeholder="Type a message..."
                        className="flex-1 bg-card border border-border rounded-xl px-4 py-3 text-white focus:border-primary focus:outline-none"
                    />
                    <button
                        type="button"
                        onClick={toggleRecording}
                        className={`p-3 rounded-xl border transition ${
                            isRecording 
                                ? 'bg-red-600 text-white border-red-500 animate-pulse' 
                                : 'bg-card text-text-secondary hover:text-white border-border'
                        }`}
                        title={isRecording ? 'Stop recording' : 'Voice input'}
                    >
                        🎤
                    </button>
                    <button type="submit" disabled={!newMessage.trim()} className="px-4 py-3 bg-primary hover:bg-primary-hover disabled:opacity-50 text-white rounded-xl transition font-medium">
                        Send
                    </button>
                </form>
            </div>
        );
    }

    // ============ MAIN VIEW (tabs) ============
    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center border-b border-border pb-4">
                <h2 className="text-3xl font-bold text-foreground">
                    {filterRole === 'vendor' ? 'Vendor Chat' : filterRole === 'doctor' ? 'Doctor Chat' : isVendor ? 'Doctor Communication' : 'Chat'}
                </h2>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 flex-wrap">
                <button onClick={() => setTab('conversations')}
                    className={`px-4 py-2 rounded-lg font-medium transition ${tab === 'conversations' ? 'bg-primary text-white' : 'bg-card text-muted-foreground hover:text-white'}`}>
                    💬 Chats ({conversations.length})
                </button>
                {(isVendor || filterRole === 'doctor') && (
                    <button onClick={() => { setTab('search'); searchDoctors(''); }}
                        className={`px-4 py-2 rounded-lg font-medium transition ${tab === 'search' ? 'bg-primary text-white' : 'bg-card text-muted-foreground hover:text-white'}`}>
                        🔍 Find Doctors
                    </button>
                )}
                {/* My Requests tab: vendors see their sent requests; doctors in vendor-chat see a notice directing to the Requests page */}
                {isVendor && (
                    <button onClick={() => setTab('requests')}
                        className={`px-4 py-2 rounded-lg font-medium transition ${tab === 'requests' ? 'bg-primary text-white' : 'bg-card text-muted-foreground hover:text-white'}`}>
                        📤 My Requests {requests.filter(r => r.status === 'pending').length > 0 && (
                            <span className="ml-1 bg-amber-500 text-black text-xs px-2 py-0.5 rounded-full font-bold">
                                {requests.filter(r => r.status === 'pending').length}
                            </span>
                        )}
                    </button>
                )}
            </div>

            {/* Conversations Tab */}
            {tab === 'conversations' && (
                <div className="space-y-3">
                    {conversations.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <span className="text-4xl block mb-3">💬</span>
                            <p>No active conversations yet</p>
                            <p className="text-sm mt-2">Click "Find Doctors" to start a conversation</p>
                        </div>
                    ) : (
                        conversations.map(conv => (
                            <div key={conv.chat_id} onClick={() => openChat(conv)}
                                className="bg-card p-4 rounded-xl border border-border hover:border-primary cursor-pointer transition flex items-center gap-4">
                                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#10A37F] to-[#3B82F6] flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                                    {(conv.other_participant?.name || '?')[0].toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-bold text-foreground">{conv.other_participant?.name || 'Unknown'}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {conv.other_participant?.phone && <span>📞 {conv.other_participant.phone}</span>}
                                        {conv.other_participant?.phone && conv.other_participant?.email && <span> • </span>}
                                        {conv.other_participant?.email && <span>✉️ {conv.other_participant.email}</span>}
                                        {!conv.other_participant?.phone && !conv.other_participant?.email && <span className="capitalize">{conv.other_participant?.role}</span>}
                                    </p>
                                    {conv.last_message && (
                                        <p className="text-sm text-text-secondary truncate mt-1">
                                            {conv.last_message.content}
                                        </p>
                                    )}
                                </div>
                                <span className="text-muted-foreground text-sm">→</span>
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* Requests Tab */}
            {tab === 'requests' && (
                <div className="space-y-3">
                    {isVendor && (
                        <div className="bg-muted/50 border border-border rounded-lg px-4 py-3 text-sm text-muted-foreground">
                            💡 These are your sent connection requests. Once a doctor accepts, use <strong className="text-foreground">Open Chat</strong> to start chatting.
                        </div>
                    )}
                    {requests.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <span className="text-4xl block mb-3">{isVendor ? '📤' : '📥'}</span>
                            <p>No {isVendor ? 'sent' : 'incoming'} requests</p>
                        </div>
                    ) : (
                        requests.map(req => (
                            <div key={req.request_id} className="bg-card p-4 rounded-xl border border-border flex justify-between items-center gap-4">
                                <div className="min-w-0 flex-1">
                                    <p className="font-bold text-foreground">
                                        {isVendor ? `To: ${req.target_name || 'Doctor'}` : `From: ${req.vendor_name}`}
                                    </p>
                                    {req.message && <p className="text-sm text-text-secondary mt-1 truncate">{req.message}</p>}
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {req.created_at ? formatDate(req.created_at) : ''} •{' '}
                                        <span className={`font-bold uppercase ${
                                            req.status === 'pending' ? 'text-[#F59E0B]' :
                                            req.status === 'accepted' ? 'text-primary' : 'text-[#EF4444]'
                                        }`}>{req.status}</span>
                                    </p>
                                </div>
                                <div className="flex gap-2 shrink-0">
                                    {/* Vendor: "Open Chat" button once accepted */}
                                    {isVendor && req.status === 'accepted' && (
                                        <button
                                            onClick={async () => {
                                                try {
                                                    const res = await fetch(`${API_BASE}/chat/direct`, {
                                                        method: 'POST',
                                                        headers: authH(),
                                                        body: JSON.stringify({ target_id: req.target_id, target_role: 'doctor' })
                                                    });
                                                    const data = await res.json();
                                                    if (data.success && data.chat) {
                                                        openChat(data.chat);
                                                    }
                                                } catch (e) { showNotify?.('Could not open chat', 'error'); }
                                            }}
                                            className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm font-medium transition">
                                            💬 Open Chat
                                        </button>
                                    )}
                                    {/* Doctor: Accept / Reject for pending (doctors only get here if filterRole matches) */}
                                    {!isVendor && req.status === 'pending' && (
                                        <div className="flex gap-2">
                                            <button onClick={() => handleRespondRequest(req.request_id, 'accept')}
                                                className="px-3 py-1.5 bg-primary text-white rounded-lg text-sm hover:bg-primary-hover transition">
                                                ✓ Accept
                                            </button>
                                            <button onClick={() => handleRespondRequest(req.request_id, 'reject')}
                                                className="px-3 py-1.5 bg-error text-white rounded-lg text-sm hover:bg-[#DC2626] transition">
                                                ✕ Reject
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* Search Doctors Tab */}
            {tab === 'search' && (
                <div className="space-y-4">
                    <div className="flex gap-2">
                        <input
                            type="text" value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && searchDoctors(searchQuery)}
                            placeholder="Search by name, specialization, or department..."
                            className="flex-1 bg-card border border-border rounded-lg px-4 py-3 text-white focus:border-primary focus:outline-none"
                        />
                        <button onClick={() => searchDoctors(searchQuery)} className="px-4 py-3 bg-primary hover:bg-primary-hover text-white rounded-lg transition">
                            Search
                        </button>
                    </div>
                    {doctorResults.length === 0 && (
                        <div className="text-center py-8 text-muted-foreground">
                            <span className="text-3xl block mb-2">🔍</span>
                            <p>No doctors found</p>
                        </div>
                    )}
                    {doctorResults.map(doc => (
                        <div key={doc.user_id} className="bg-card p-4 rounded-xl border border-border flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#10A37F] to-[#3B82F6] flex items-center justify-center text-white font-bold">
                                    {(doc.full_name || '?')[0].toUpperCase()}
                                </div>
                                <div>
                                    <p className="font-bold text-foreground">Dr. {doc.full_name}</p>
                                    <p className="text-sm text-text-secondary">{doc.specialization || 'General'} • {doc.department || 'N/A'}</p>
                                </div>
                            </div>
                            {isDoctor ? (
                                /* Doctors: click to directly start chatting */
                                <button onClick={() => startDirectChat(doc.user_id, 'doctor')}
                                    disabled={loading}
                                    className="px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-hover transition disabled:opacity-50">
                                    💬 Chat
                                </button>
                            ) : (
                                /* Vendors: connection request flow */
                                showSendRequest === doc.user_id ? (
                                    <div className="flex gap-2 items-center">
                                        <input
                                            type="text" value={requestMessage}
                                            onChange={e => setRequestMessage(e.target.value)}
                                            placeholder="Short intro message..."
                                            className="bg-card border border-border rounded px-3 py-2 text-white text-sm w-48 focus:border-primary focus:outline-none"
                                        />
                                        <button onClick={() => sendConnectionRequest(doc.user_id)}
                                            className="px-3 py-2 bg-primary text-white rounded text-sm hover:bg-primary-hover transition">Send</button>
                                        <button onClick={() => setShowSendRequest(null)}
                                            className="px-3 py-2 bg-card text-muted-foreground rounded text-sm hover:text-white transition">✕</button>
                                    </div>
                                ) : (
                                    <button onClick={() => setShowSendRequest(doc.user_id)}
                                        className="px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-[#2563EB] transition">
                                        📩 Connect
                                    </button>
                                )
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ChatInterface;
