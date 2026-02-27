import React, { useState, useEffect } from 'react';
import { API_BASE, getAuthHeaders } from '../utils/api';

const PatientEditModal = ({ isOpen, onClose, patient, onUpdate }) => {
    const [formData, setFormData] = useState({
        patient_name: '',
        phone: '',
        age: '',
        room_number: '',
        diagnosis: '',
        notes: ''
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (patient) {
            setFormData({
                patient_name: patient.patient_name || '',
                phone: patient.phone || '',
                age: patient.age || '',
                room_number: patient.room_number || '',
                diagnosis: patient.diagnosis || '',
                notes: patient.notes || ''
            });
        }
    }, [patient]);

    if (!isOpen) return null;

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            // Determine endpoint based on user role (Doctor or Nurse) - handled by parent or context?
            // Actually, we can try doctor endpoint first, if 403 then nurse? 
            // Or better, pass the role or endpoint as prop?
            // For now, let's assume the Dashboard passes the correct role-specific update function or we try both/standard one.
            // Since we added endpoints for both roles at similar paths:
            // Doctor: /doctor/patients/:id
            // Nurse: /nurse/patients/:id
            
            // Let's use a prop `role` or deduce from local storage, OR simply try the path given via prop.
            // But to keep it simple, let's assume the parent fetches and updates, or we just use the right prefix.
            // Let's check sessionStorage user role to build the URL.
            
            const user = JSON.parse(sessionStorage.getItem('user') || '{}');
            const role = user.role || 'doctor'; 
            const endpoint = `${API_BASE}/${role}/patients/${patient.patient_id}`;

            const res = await fetch(endpoint, {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify(formData)
            });

            const data = await res.json();

            if (data.success) {
                onUpdate(); // Trigger refresh in parent
                onClose();
            } else {
                setError(data.error || 'Failed to update patient');
            }
        } catch (err) {
            setError('An error occurred. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[110] p-4">
            <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg animate-fade-in-up">
                <div className="p-6 border-b border-border flex justify-between items-center">
                    <h2 className="text-xl font-bold text-foreground">Edit Patient Details</h2>
                    <button onClick={onClose} className="text-muted-foreground hover:text-white transition">✕</button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 text-error p-3 rounded text-sm">
                            {error}
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-muted-foreground uppercase mb-1">Name</label>
                            <input
                                type="text"
                                name="patient_name"
                                value={formData.patient_name}
                                onChange={handleChange}
                                className="w-full bg-card border border-border rounded p-2 text-foreground focus:border-primary outline-none transition"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-muted-foreground uppercase mb-1">Phone</label>
                            <input
                                type="text"
                                name="phone"
                                value={formData.phone}
                                onChange={handleChange}
                                className="w-full bg-card border border-border rounded p-2 text-foreground focus:border-primary outline-none transition"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-muted-foreground uppercase mb-1">Age</label>
                            <input
                                type="text"
                                name="age"
                                value={formData.age}
                                onChange={handleChange}
                                className="w-full bg-card border border-border rounded p-2 text-foreground focus:border-primary outline-none transition"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-muted-foreground uppercase mb-1">Room Number</label>
                            <input
                                type="text"
                                name="room_number"
                                value={formData.room_number}
                                onChange={handleChange}
                                className="w-full bg-card border border-border rounded p-2 text-foreground focus:border-primary outline-none transition"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-muted-foreground uppercase mb-1">Diagnosis</label>
                        <input
                            type="text"
                            name="diagnosis"
                            value={formData.diagnosis}
                            onChange={handleChange}
                            className="w-full bg-card border border-border rounded p-2 text-foreground focus:border-primary outline-none transition"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-muted-foreground uppercase mb-1">Notes / Special Instructions</label>
                        <textarea
                            name="notes"
                            value={formData.notes}
                            onChange={handleChange}
                            rows="3"
                            className="w-full bg-card border border-border rounded p-2 text-foreground focus:border-primary outline-none transition"
                        ></textarea>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-border">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded text-foreground hover:bg-[#565869] transition"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="px-4 py-2 bg-primary text-white rounded hover:bg-primary-hover transition disabled:opacity-50"
                        >
                            {loading ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default PatientEditModal;
