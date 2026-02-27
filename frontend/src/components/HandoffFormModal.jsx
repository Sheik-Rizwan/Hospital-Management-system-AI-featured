import React, { useState } from 'react';
import RecordingModal from './RecordingModal';

const HandoffFormModal = ({ isOpen, onClose, onSubmit, patients = [], user }) => {
    const [formData, setFormData] = useState({
        patient_id: '',
        nurse_name: user?.full_name || '',
        shift: '',
        transcript: ''
    });
    const [showRecorder, setShowRecorder] = useState(false);
    const [error, setError] = useState('');

    if (!isOpen) return null;

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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            {/* Modal Card */}
            <div className="bg-surface rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden animate-fade-in-up text-slate-800">
                
                {/* Header */}
                <div className="p-6 border-b border-border">
                    <h3 className="text-2xl font-bold text-foreground">Record Handoff</h3>
                </div>

                {/* Form Content */}
                <div className="p-8 space-y-6">
                    {error && (
                        <div className="p-3 bg-error-soft border border-red-200 text-red-700 rounded-lg text-sm">
                            {error}
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Patient Select */}
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-text-secondary">Patient *</label>
                            <select
                                name="patient_id"
                                value={formData.patient_id}
                                onChange={handleChange}
                                className="w-full px-4 py-3 bg-surface border border-border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-primary outline-none transition-all"
                            >
                                <option value="">Select patient...</option>
                                {patients.map(p => (
                                    <option key={p.patient_id} value={p.patient_id}>
                                        {p.patient_name} ({p.room_number || 'No Room'})
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Nurse Name (Read Only) */}
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-text-secondary">Nurse Name *</label>
                            <input
                                type="text"
                                name="nurse_name"
                                value={formData.nurse_name}
                                readOnly
                                className="w-full px-4 py-3 bg-muted border border-border rounded-lg text-text-secondary outline-none"
                            />
                        </div>

                        {/* Shift Select */}
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-text-secondary">Shift *</label>
                            <select
                                name="shift"
                                value={formData.shift}
                                onChange={handleChange}
                                className="w-full px-4 py-3 bg-surface border border-border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-primary outline-none transition-all"
                            >
                                <option value="">Select...</option>
                                <option value="Day">Day</option>
                                <option value="Evening">Evening</option>
                                <option value="Night">Night</option>
                            </select>
                        </div>
                    </div>

                    {/* Transcript Area */}
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-text-secondary">Handoff Transcript *</label>
                        <textarea
                            name="transcript"
                            value={formData.transcript}
                            onChange={handleChange}
                            placeholder="Enter or record the handoff report..."
                            className="w-full h-40 px-4 py-3 bg-surface border border-border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-primary outline-none transition-all resize-none font-mono text-sm leading-relaxed"
                        ></textarea>
                    </div>

                    {/* Record Button */}
                    <div>
                        <button
                            type="button"
                            onClick={() => setShowRecorder(true)}
                            className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-full font-bold shadow-md transition-all active:scale-95"
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                                <line x1="12" y1="19" x2="12" y2="23"/>
                                <line x1="8" y1="23" x2="16" y2="23"/>
                            </svg>
                            Record
                        </button>
                    </div>
                </div>

                {/* Footer Buttons */}
                <div className="p-6 border-t border-border flex justify-end gap-3 bg-background">
                    <button
                        onClick={onClose}
                        className="px-6 py-2.5 bg-surface border border-border text-text-secondary font-semibold rounded-lg hover:bg-background transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        className="px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg shadow-lg hover:shadow-xl transition-all active:scale-95"
                    >
                        Save Handoff
                    </button>
                </div>
            </div>

            {/* Recorder Overlay */}
            {showRecorder && (
                <RecordingModal
                    onClose={() => setShowRecorder(false)}
                    onTranscript={handleTranscript}
                />
            )}
        </div>
    );
};

export default HandoffFormModal;
