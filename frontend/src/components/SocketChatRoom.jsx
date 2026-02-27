/**
 * SocketChatRoom.jsx — Real-time chat room powered by Socket.IO.
 *
 * - Loads message history from REST API on mount.
 * - Joins the socket.io room (chat_id) so messages arrive instantly.
 * - Sends messages via socket event (also persisted by the server).
 * - Shows a live typing indicator.
 * - Falls back gracefully if socket is disconnected.
 *
 * Props:
 *   chat       {Object}  - chat object { chat_id, other_participant, ... }
 *   onBack     {Function}- called when user clicks ← Back
 *   authRole   {string}  - 'doctor' | 'vendor' | '' (used for correct JWT header)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { API_BASE, getAuthHeaders, formatDate } from '../utils/api';
import { useSocket } from '../hooks/useSocket';

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
            // Successfully joined — load fresh history
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
    useEffect(() => scrollToBottom(), [messages]);

    // ── send message ──────────────────────────────────────────
    const sendMessage = useCallback(async () => {
        const content = newMessage.trim();
        if (!content || sending) return;

        setSending(true);
        setNewMessage('');

        // Optimistic UI — add immediately
        const optimistic = {
            message_id: `opt_${Date.now()}`,
            chat_id: chat.chat_id,
            sender_id: user.user_id,
            sender_name: user.full_name || 'You',
            content,
            type: 'text',
            timestamp: new Date().toISOString(),
            optimistic: true
        };
        setMessages(prev => [...prev, optimistic]);

        // Send via socket (server also saves to DB and broadcasts)
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
        if (!SpeechRecognition) { alert('Speech recognition not supported in this browser.'); return; }
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
        }
        e.target.value = '';
    };

    // ── helpers for rendering ─────────────────────────────────
    const isMe = (msg) => msg.sender_id === user.user_id;

    const renderContent = (msg) => {
        if (msg.type === 'file' || msg.type === 'image') {
            const isImage = msg.type === 'image' ||
                (msg.file_name || '').match(/\.(png|jpg|jpeg|gif|webp)$/i);
            const url = msg.file_url?.startsWith('/')
                ? `${API_BASE.replace('/api', '')}${msg.file_url}`
                : msg.file_url;
            if (isImage) return <img src={url} alt={msg.file_name} className="max-w-[240px] rounded-lg mt-1" />;
            return (
                <a href={url} target="_blank" rel="noreferrer"
                    className="flex items-center gap-2 text-blue-300 hover:underline">
                    📎 <span className="truncate max-w-[200px]">{msg.file_name || 'Download file'}</span>
                </a>
            );
        }
        return <p className="whitespace-pre-wrap break-words">{msg.content}</p>;
    };

    const other = chat?.other_participant || {};

    // ── render ────────────────────────────────────────────────
    return (
        <div className="flex flex-col h-full bg-background min-h-0">
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card shrink-0">
                <button onClick={onBack}
                    className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-white transition text-lg">
                    ←
                </button>
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#10A37F] to-[#3B82F6] flex items-center justify-center text-white font-bold text-lg shrink-0">
                    {(other.name || '?')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                    <p className="font-bold text-foreground truncate">{other.name || 'Chat'}</p>
                    <p className="text-xs text-muted-foreground capitalize">{other.role || ''}</p>
                </div>
                <div className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" title="Live chat" />
                    <span className="text-xs text-muted-foreground">Live</span>
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 min-h-0">
                {loading ? (
                    <div className="flex items-center justify-center h-32 text-muted-foreground">
                        <span className="text-sm">Loading messages…</span>
                    </div>
                ) : messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                        <span className="text-3xl mb-2">💬</span>
                        <p className="text-sm">No messages yet. Say hello!</p>
                    </div>
                ) : (
                    messages.map(msg => (
                        <div key={msg.message_id}
                            className={`flex ${isMe(msg) ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[70%] px-4 py-2.5 rounded-2xl text-sm ${
                                isMe(msg)
                                    ? 'bg-primary text-white rounded-br-sm'
                                    : 'bg-card text-foreground border border-border rounded-bl-sm'
                            } ${msg.optimistic ? 'opacity-70' : ''}`}>
                                {!isMe(msg) && (
                                    <p className="text-xs font-bold mb-1 opacity-80">{msg.sender_name}</p>
                                )}
                                {renderContent(msg)}
                                <p className={`text-[10px] mt-1 ${isMe(msg) ? 'text-white/60' : 'text-muted-foreground'} text-right`}>
                                    {msg.timestamp
                                        ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                        : ''}
                                </p>
                            </div>
                        </div>
                    ))
                )}
                {typingLabel && (
                    <div className="flex justify-start">
                        <div className="bg-card border border-border px-4 py-2 rounded-2xl text-sm text-muted-foreground italic">
                            {typingLabel}
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input bar */}
            <div className="shrink-0 border-t border-border bg-card px-3 py-2">
                <div className="flex items-center gap-2">
                    {/* File upload button */}
                    <button onClick={() => fileInputRef.current?.click()}
                        className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-white transition shrink-0"
                        title="Attach file">
                        📎
                    </button>
                    <input ref={fileInputRef} type="file"
                        accept="image/*,.pdf,.doc,.docx"
                        className="hidden"
                        onChange={handleFileUpload} />

                    {/* Text input */}
                    <input
                        type="text"
                        value={newMessage}
                        onChange={handleTyping}
                        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                        placeholder="Type a message…"
                        className="flex-1 bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none min-w-0"
                    />

                    {/* Mic button */}
                    <button onClick={toggleVoice}
                        className={`p-2 rounded-lg transition shrink-0 ${
                            isRecording
                                ? 'bg-red-500 text-white animate-pulse'
                                : 'hover:bg-muted text-muted-foreground hover:text-white'
                        }`}
                        title={isRecording ? 'Stop recording' : 'Voice input'}>
                        🎤
                    </button>

                    {/* Send button */}
                    <button
                        onClick={sendMessage}
                        disabled={!newMessage.trim() || sending}
                        className="px-4 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-xl text-sm font-medium transition disabled:opacity-40 shrink-0">
                        Send
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SocketChatRoom;
