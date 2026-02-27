import React, { useState } from 'react';
import { API_BASE, getAuthHeaders, formatDate } from '../utils/api';

const ViewHandoffModal = ({ handoff, onClose }) => {
    const [question, setQuestion] = useState('');
    const [chatMessages, setChatMessages] = useState([]);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('report');

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

    // Print report function
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
                position: fixed;
                left: 0;
                top: 0;
                width: 100%;
                height: 100%;
                margin: 0;
                padding: 20px;
                background: white !important;
                color: black !important;
                z-index: 9999;
                overflow: visible;
            }
            /* Hide specific non-printable UI elements */
            .no-print, button {
                display: none !important;
            }
            /* Force text colors for print */
            h2, h3, p, span, div {
                color: black !important;
                text-shadow: none !important;
            }
            /* Borders */
            .border {
                border-color: #ddd !important;
            }
        }
    `;

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <style>{printStyles}</style>
            <div id="handoff-modal-content" className="bg-surface border border-border rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col animate-fade-in-up">
                {/* Header */}
                <div className="bg-card/50 border-b border-border p-4">
                    <div className="flex justify-between items-center mb-4">
                        <div>
                            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                                📋 Clinical Handoff Report
                            </h2>
                            <p className="text-muted-foreground text-sm mt-1 font-mono">
                                Patient: <span className="text-primary font-bold">{handoff.patient_name || report.patient_name || handoff.patient_id}</span> • {formatDate(handoff.timestamp)}
                            </p>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={handlePrint}
                                className="px-3 py-1.5 bg-card border border-border rounded-lg hover:bg-border text-text-secondary hover:text-white text-sm flex items-center gap-2 transition-colors"
                            >
                                🖨️ Print
                            </button>
                            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-card hover:bg-error-soft text-muted-foreground hover:text-error transition-colors">✕</button>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-2">
                        <button
                            onClick={() => setActiveTab('report')}
                            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'report' ? 'bg-primary text-white shadow-lg shadow-teal-900/50' : 'bg-transparent text-muted-foreground hover:bg-card hover:text-white'}`}
                        >
                            📄 Full Report
                        </button>
                        <button
                            onClick={() => setActiveTab('chat')}
                            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'chat' ? 'bg-primary text-white shadow-lg shadow-teal-900/50' : 'bg-transparent text-muted-foreground hover:bg-card hover:text-white'}`}
                        >
                            🤖 AI Assistant
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-surface/50">
                    {activeTab === 'report' ? (
                        <div className="space-y-8 print:space-y-4">
                            {/* Patient Information Section */}
                            <section>
                                <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2 pb-2 border-b border-slate-800">
                                    <span className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center text-blue-400 text-xl border border-blue-500/20">👤</span>
                                    Patient Information
                                </h3>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                    <InfoCard label="Patient Name" value={handoff.patient_name || report.patient_name || handoff.patient_id} />
                                    <InfoCard label="Patient ID" value={handoff.patient_id || report.patient_id} />
                                    <InfoCard label="Room Number" value={handoff.room_number || report.room_number || 'N/A'} />
                                    <InfoCard label="Attending Nurse" value={handoff.nurse_name} />
                                    <InfoCard label="Shift" value={handoff.shift} />
                                    <InfoCard label="Report Date" value={formatDate(handoff.timestamp)} />
                                </div>
                            </section>

                            {/* Vitals Summary Section */}
                            {(report.vitals) && (
                                <section>
                                     <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2 pb-2 border-b border-slate-800">
                                        <span className="w-8 h-8 bg-red-500/10 rounded-lg flex items-center justify-center text-error text-xl border border-red-500/20">💓</span>
                                        Vital Signs Summary
                                    </h3>
                                    {/* Handle both object (old/structured) and string (new AI) formats */}
                                    {typeof report.vitals === 'string' ? (
                                        <div className="bg-card/30 border border-border/50 rounded-xl p-5 text-sm text-text-secondary leading-relaxed whitespace-pre-wrap font-mono">
                                            {report.vitals}
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                            {(() => {
                                                const getSafeVital = (keys) => {
                                                    if (!report.vitals) return null;
                                                    for (const k of keys) {
                                                        if (report.vitals[k]) return report.vitals[k];
                                                    }
                                                    return null;
                                                };
                                                
                                                const getBloodPressure = () => {
                                                    if (!report.vitals) return null;
                                                    const bp = report.vitals.blood_pressure || report.vitals.bp;
                                                    if (bp) {
                                                        if (!bp.value && (bp.systolic || bp.diastolic)) {
                                                            const sys = bp.systolic || '?';
                                                            const dia = bp.diastolic || '?';
                                                            return { ...bp, value: `${sys}/${dia}` };
                                                        }
                                                    }
                                                    return bp;
                                                };
                                                
                                                return (
                                                    <>
                                                        <VitalCard label="Heart Rate" value={getSafeVital(['heart_rate', 'hr', 'pulse'])} unit="bpm" icon="❤️" color="red" />
                                                        <VitalCard label="Blood Pressure" value={getBloodPressure()} unit="mmHg" icon="🩸" color="purple" />
                                                        <VitalCard label="Temperature" value={getSafeVital(['temperature', 'temperature_celsius', 'temp'])} unit="°F" icon="🌡️" color="orange" />
                                                        <VitalCard label="SpO2" value={getSafeVital(['oxygen_saturation', 'spo2', 'o2_sat'])} unit="%" icon="🫁" color="blue" />
                                                        <VitalCard label="Resp. Rate" value={getSafeVital(['respiratory_rate', 'resp_rate'])} unit="/min" icon="💨" color="teal" />
                                                    </>
                                                );
                                            })()}
                                        </div>
                                    )}
                                </section>
                            )}

                            {/* Medications Section */}
                            {report.medications && report.medications.length > 0 && (
                                <section>
                                    <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2 pb-2 border-b border-slate-800">
                                        <span className="w-8 h-8 bg-green-500/10 rounded-lg flex items-center justify-center text-success text-xl border border-green-500/20">💊</span>
                                        Medications Administered
                                    </h3>
                                    <div className="bg-card/50 border border-border/50 rounded-xl p-4">
                                        <ul className="space-y-3">
                                            {report.medications.map((med, idx) => (
                                                <li key={idx} className="flex items-center gap-3 text-sm border-b border-border/50 last:border-0 pb-2 last:pb-0">
                                                    <span className="w-2 h-2 bg-green-500 rounded-full shadow-[0_0_8px_rgba(34,197,94,0.5)]"></span>
                                                    <span className="font-bold text-foreground">{med.name || med}</span>
                                                    {med.dose && <span className="text-muted-foreground px-2 py-0.5 bg-card rounded text-xs">{med.dose}</span>}
                                                    {med.time && <span className="text-muted-foreground ml-auto font-mono text-xs">@ {med.time}</span>}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </section>
                            )}

                            {/* Care Given Section */}
                            {(report.care_given || report.interventions) && (
                                <section>
                                    <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2 pb-2 border-b border-slate-800">
                                        <span className="w-8 h-8 bg-purple-500/10 rounded-lg flex items-center justify-center text-purple-400 text-xl border border-purple-500/20">🩺</span>
                                        Care Provided
                                    </h3>
                                    <div className="bg-card/30 border border-border/50 rounded-xl p-5 text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">
                                        {report.care_given || report.interventions}
                                    </div>
                                </section>
                            )}

                            {/* Clinical Notes / Observations Section (NEW & OLD) */}
                            {(report.observation || report.Observation || report.observations || report.notes) && (
                                <section>
                                    <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2 pb-2 border-b border-slate-800">
                                        <span className="w-8 h-8 bg-yellow-500/10 rounded-lg flex items-center justify-center text-yellow-400 text-xl border border-yellow-500/20">📝</span>
                                        Clinical Observations
                                    </h3>
                                    <div className="bg-card/30 border border-border/50 rounded-xl p-5 text-sm text-text-secondary leading-relaxed whitespace-pre-wrap font-sans">
                                        {report.observation || report.Observation || report.observations || report.notes}
                                    </div>
                                </section>
                            )}

                             {/* Recommendation Section (NEW) */}
                            {(report.recommendation || report.Recommendation || report.plan) && (
                                <section>
                                    <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2 pb-2 border-b border-slate-800">
                                        <span className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center text-blue-400 text-xl border border-blue-500/20">💡</span>
                                        Recommendations / Plan
                                    </h3>
                                    <div className="bg-card/30 border border-border/50 rounded-xl p-5 text-sm text-text-secondary leading-relaxed whitespace-pre-wrap font-sans">
                                        {report.recommendation || report.Recommendation || report.plan}
                                    </div>
                                </section>
                            )}

                            {/* Handoff Notes Section */}
                            <section>
                                <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2 pb-2 border-b border-slate-800">
                                    <span className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center text-primary text-xl border border-teal-500/20">🎙️</span>
                                    Raw Transcript
                                </h3>
                                <div className="bg-black/20 border border-border/50 rounded-xl p-5">
                                    <p className="text-sm text-text-secondary whitespace-pre-wrap leading-relaxed font-mono">
                                        {handoff.transcript}
                                    </p>
                                </div>
                            </section>

                            {/* Report Footer */}
                            <div className="mt-8 pt-6 border-t border-slate-800 text-center text-xs text-muted-foreground">
                                <p>Generated by Nurse System • {formatDate(handoff.timestamp)}</p>
                                <p className="mt-1 opacity-50">Confidential • Clinical Reference Only</p>
                            </div>
                        </div>
                    ) : (
                        /* Chat Tab */
                        <div className="h-full flex flex-col">
                            <div className="flex-1 bg-black/20 border border-border/50 p-4 rounded-xl overflow-y-auto min-h-64 custom-scrollbar">
                                {chatMessages.length === 0 ? (
                                    <div className="text-center text-muted-foreground py-12 flex flex-col items-center">
                                        <span className="text-5xl mb-4 opacity-50"></span>
                                        <p className="font-bold text-text-secondary">AI Clinical Assistant</p>
                                        <p className="text-sm mt-2 max-w-xs mx-auto">Ask questions about this handoff report, vitals, medications, or care plan.</p>
                                    </div>
                                ) : (
                                    chatMessages.map((msg, idx) => (
                                        <div key={idx} className={`mb-4 flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                                            <div className={`rounded-2xl px-5 py-3 text-sm max-w-[85%] leading-relaxed ${
                                                msg.type === 'user'
                                                    ? 'bg-primary text-white rounded-br-none'
                                                    : 'bg-card text-foreground border border-border rounded-bl-none shadow-md'
                                            }`}>
                                                {msg.text}
                                            </div>
                                        </div>
                                    ))
                                )}
                                {loading && (
                                    <div className="flex items-center gap-2 text-muted-foreground text-sm ml-2">
                                        <div className="w-2 h-2 bg-primary rounded-full animate-bounce"></div>
                                        <div className="w-2 h-2 bg-primary rounded-full animate-bounce delay-75"></div>
                                        <div className="w-2 h-2 bg-primary rounded-full animate-bounce delay-150"></div>
                                        <span>Thinking...</span>
                                    </div>
                                )}
                            </div>
                            <form onSubmit={handleAskQuestion} className="flex gap-2 mt-4">
                                <input
                                    type="text"
                                    value={question}
                                    onChange={(e) => setQuestion(e.target.value)}
                                    placeholder="Ask contextual questions..."
                                    className="flex-1 px-4 py-3 bg-card border border-border rounded-xl text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-all"
                                />
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="px-6 py-3 bg-primary hover:bg-primary text-white rounded-xl font-bold shadow-lg shadow-teal-900/20 disabled:opacity-50 transition-all active:scale-95"
                                >
                                    Send
                                </button>
                            </form>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// Info Card Component
const InfoCard = ({ label, value }) => (
    <div className="bg-card/50 border border-border/50 rounded-xl p-3 hover:border-border transition-colors">
        <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mb-1">{label}</p>
        <p className="text-sm font-semibold text-foreground truncate" title={value}>{value || 'N/A'}</p>
    </div>
);

// Vital Card Component
const VitalCard = ({ label, value, unit, icon, color }) => {
    const colorClasses = {
        red: 'border-red-500/20 bg-red-500/5 text-error hover:border-red-500/40',
        purple: 'border-purple-500/20 bg-purple-500/5 text-purple-400 hover:border-purple-500/40',
        orange: 'border-orange-500/20 bg-orange-500/5 text-orange-400 hover:border-orange-500/40',
        blue: 'border-blue-500/20 bg-blue-500/5 text-blue-400 hover:border-blue-500/40',
        teal: 'border-teal-500/20 bg-primary/5 text-primary hover:border-teal-500/40',
    };

    let displayValue = value || '--';
    let displayUnit = unit;

    if (typeof value === 'object' && value !== null) {
        displayValue = value.value || value.val || '--';
        if (value.unit) displayUnit = value.unit;
    }

    return (
        <div className={`rounded-xl p-4 text-center border backdrop-blur-sm transition-all hover:scale-105 ${colorClasses[color] || colorClasses.red}`}>
            <p className="text-2xl mb-2 opacity-90">{icon}</p>
            <p className="text-2xl font-bold mb-1 drop-shadow-sm">{displayValue}</p>
            <p className="text-[10px] uppercase tracking-wider opacity-70 font-bold">{label}</p>
            <p className="text-[10px] opacity-50">{displayUnit}</p>
        </div>
    );
};

export default ViewHandoffModal;
