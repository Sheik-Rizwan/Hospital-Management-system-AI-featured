import React, { useState, useEffect } from 'react';
import { API_BASE, getAuthHeaders } from '../utils/api';

const BookAppointment = ({ patientId = null, patientData = null, onClose, onSuccess, isNurseBooking = false, userRole = 'patient' }) => {
    const [step, setStep] = useState(1);
    const [doctors, setDoctors] = useState([]);
    const [selectedDoctor, setSelectedDoctor] = useState(null);
    const [selectedDate, setSelectedDate] = useState('');
    const [slots, setSlots] = useState([]);
    const [selectedSlot, setSelectedSlot] = useState(null);
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [filterSpecialization, setFilterSpecialization] = useState('');

    // Get API base path based on user role
    const apiPath = (isNurseBooking || userRole === 'nurse') ? `${API_BASE}/nurse` : `${API_BASE}/patient`;

    useEffect(() => {
        loadDoctors();
    }, []);

    const loadDoctors = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${apiPath}/doctors`, {
                headers: getAuthHeaders()
            });
            const data = await res.json();
            if (data.success) {
                setDoctors(data.doctors);
            } else {
                setError(data.error || 'Failed to load doctors');
            }
        } catch (e) {
            setError('Failed to load doctors');
        }
        setLoading(false);
    };

    const loadAvailability = async (doctorId, date) => {
        setLoading(true);
        setSlots([]);
        try {
            const url = `${apiPath}/doctors/${doctorId}/availability?date=${date}`;
            const res = await fetch(url, {
                headers: getAuthHeaders()
            });
            const data = await res.json();
            if (data.success) {
                if (data.available) {
                    setSlots(data.slots.filter(s => s.available));
                } else {
                    setError(data.message || 'No availability');
                    setSlots([]);
                }
            } else {
                setError(data.error || 'Failed to load availability');
            }
        } catch (e) {
            setError('Failed to load availability');
        }
        setLoading(false);
    };

    const handleDateChange = (e) => {
        const date = e.target.value;
        setSelectedDate(date);
        setSelectedSlot(null);
        if (selectedDoctor && date) {
            loadAvailability(selectedDoctor.user_id, date);
        }
    };

    const handleBookAppointment = async () => {
        if (!selectedDoctor || !selectedDate || !selectedSlot) {
            setError('Please select doctor, date and time slot');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const payload = {
                doctor_id: selectedDoctor.user_id,
                date: selectedDate,
                start_time: selectedSlot.start,
                end_time: selectedSlot.end,
                notes: notes
            };

            // If nurse is booking for patient, add patient_id
            if (isNurseBooking && patientId) {
                payload.patient_id = patientId;
            }

            const res = await fetch(`${apiPath}/appointments`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(payload)
            });

            const data = await res.json();

            if (data.success) {
                setSuccess('Appointment booked successfully!');
                if (onSuccess) onSuccess(data.appointment);
                setTimeout(() => {
                    if (onClose) onClose();
                }, 2000);
            } else {
                setError(data.error || 'Failed to book appointment');
            }
        } catch (e) {
            setError('Failed to book appointment');
        }
        setLoading(false);
    };

    const getMinDate = () => {
        const today = new Date();
        return today.toISOString().split('T')[0];
    };

    const getMaxDate = () => {
        const max = new Date();
        max.setMonth(max.getMonth() + 12);
        return max.toISOString().split('T')[0];
    };

    const uniqueSpecializations = [...new Set(doctors.map(d => d.specialization).filter(Boolean))];

    const filteredDoctors = filterSpecialization
        ? doctors.filter(d => d.specialization === filterSpecialization)
        : doctors;

    return (
        <div className="bg-surface rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6 rounded-t-lg">
                <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-bold">
                        📅 {isNurseBooking ? 'Book Appointment for Patient' : 'Book an Appointment'}
                    </h2>
                    {onClose && (
                        <button onClick={onClose} className="text-white hover:bg-surface/20 p-2 rounded transition">
                            ✕
                        </button>
                    )}
                </div>
                {/* Progress Steps */}
                <div className="flex mt-4 gap-2">
                    {[1, 2, 3].map(s => (
                        <div key={s} className={`flex-1 h-2 rounded ${step >= s ? 'bg-surface' : 'bg-surface/30'}`}></div>
                    ))}
                </div>
                <div className="flex mt-2 text-sm">
                    <span className={`flex-1 ${step === 1 ? 'font-bold' : 'opacity-70'}`}>Select Doctor</span>
                    <span className={`flex-1 text-center ${step === 2 ? 'font-bold' : 'opacity-70'}`}>Choose Time</span>
                    <span className={`flex-1 text-right ${step === 3 ? 'font-bold' : 'opacity-70'}`}>Confirm</span>
                </div>
            </div>

            <div className="p-6">
                {/* Error/Success Messages */}
                {error && (
                    <div className="mb-4 p-3 bg-error-soft border border-red-500/30 text-error rounded-lg flex justify-between">
                        <span>{error}</span>
                        <button onClick={() => setError('')}>✕</button>
                    </div>
                )}
                {success && (
                    <div className="mb-4 p-3 bg-success-soft border border-green-500/30 text-success rounded-lg">
                        ✓ {success}
                    </div>
                )}

                {/* Step 1: Select Doctor */}
                {step === 1 && (
                    <div>
                        <h3 className="text-lg font-semibold mb-4 text-foreground">Select a Doctor</h3>
                        
                        {/* Filter */}
                        <div className="mb-4">
                            <select
                                value={filterSpecialization}
                                onChange={(e) => setFilterSpecialization(e.target.value)}
                                className="w-full md:w-auto px-4 py-2 border border-border bg-input rounded-lg focus:ring-2 focus:ring-blue-500 text-foreground"
                            >
                                <option value="">All Specializations</option>
                                {uniqueSpecializations.map(spec => (
                                    <option key={spec} value={spec}>{spec}</option>
                                ))}
                            </select>
                        </div>

                        {/* Doctor Cards */}
                        {loading ? (
                            <div className="text-center py-8">
                                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto"></div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {filteredDoctors.map(doctor => (
                                    <div
                                        key={doctor.user_id}
                                        onClick={() => setSelectedDoctor(doctor)}
                                        className={`p-4 border-2 rounded-lg cursor-pointer transition-all hover:shadow-lg ${
                                            selectedDoctor?.user_id === doctor.user_id
                                                ? 'border-blue-500 bg-blue-500/10'
                                                : 'border-border hover:border-blue-400'
                                        }`}
                                    >
                                        <div className="flex items-start gap-3">
                                            <div className="w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center text-blue-500 text-xl font-bold">
                                                {doctor.full_name?.charAt(0) || 'D'}
                                            </div>
                                            <div className="flex-1">
                                                <h4 className="font-semibold text-foreground">{doctor.full_name}</h4>
                                                <p className="text-sm text-blue-600">{doctor.specialization || 'General'}</p>
                                                <p className="text-xs text-muted-foreground">{doctor.department}</p>
                                                {doctor.has_schedule ? (
                                                    <span className="inline-block mt-2 text-xs bg-success-soft text-success px-2 py-1 rounded">
                                                        ✓ Available
                                                    </span>
                                                ) : (
                                                    <span className="inline-block mt-2 text-xs bg-muted text-muted-foreground px-2 py-1 rounded">
                                                        No schedule set
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {filteredDoctors.length === 0 && !loading && (
                            <p className="text-center text-muted-foreground py-8">No doctors available</p>
                        )}

                        <div className="flex justify-end mt-6">
                            <button
                                onClick={() => setStep(2)}
                                disabled={!selectedDoctor}
                                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed transition"
                            >
                                Next →
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 2: Select Date & Time */}
                {step === 2 && (
                    <div>
                        <h3 className="text-lg font-semibold mb-4 text-foreground">
                            Select Date & Time with Dr. {selectedDoctor?.full_name}
                        </h3>

                        {/* Date Picker */}
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-text-secondary mb-2">Select Date</label>
                            <input
                                type="date"
                                value={selectedDate}
                                onChange={handleDateChange}
                                min={getMinDate()}
                                max={getMaxDate()}
                                className="w-full px-4 py-3 border border-border bg-input rounded-lg focus:ring-2 focus:ring-blue-500 text-foreground"
                            />
                        </div>

                        {/* Shift-Grouped Time Slots */}
                        {selectedDate && (
                            <div>
                                <label className="block text-sm font-medium text-text-secondary mb-2">Available Time Slots</label>
                                {loading ? (
                                    <div className="text-center py-4">
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                                    </div>
                                ) : slots.length > 0 ? (
                                    <div className="space-y-4">
                                        {/* Group slots by shift */}
                                        {(() => {
                                            const shiftGroups = {};
                                            const shiftOrder = ['Morning', 'Afternoon', 'Evening'];
                                            const shiftColors = {
                                                'Morning': { bg: 'bg-amber-500/10', border: 'border-amber-500/30', badge: 'bg-amber-500/20 text-amber-500', icon: '🌅' },
                                                'Afternoon': { bg: 'bg-blue-500/10', border: 'border-blue-500/30', badge: 'bg-blue-500/20 text-blue-500', icon: '☀️' },
                                                'Evening': { bg: 'bg-indigo-500/10', border: 'border-indigo-500/30', badge: 'bg-indigo-500/20 text-indigo-400', icon: '🌙' }
                                            };
                                            slots.forEach(slot => {
                                                const shift = slot.shift || 'Other';
                                                if (!shiftGroups[shift]) shiftGroups[shift] = [];
                                                shiftGroups[shift].push(slot);
                                            });
                                            const orderedShifts = shiftOrder.filter(s => shiftGroups[s]);
                                            Object.keys(shiftGroups).forEach(s => {
                                                if (!orderedShifts.includes(s)) orderedShifts.push(s);
                                            });
                                            return orderedShifts.map(shift => {
                                                const colors = shiftColors[shift] || { bg: 'bg-muted', border: 'border-border', badge: 'bg-muted text-muted-foreground', icon: '⏰' };
                                                return (
                                                    <div key={shift} className={`${colors.bg} ${colors.border} border rounded-lg p-4`}>
                                                        <div className="flex items-center gap-2 mb-3">
                                                            <span className="text-lg">{colors.icon}</span>
                                                            <h4 className="font-semibold text-foreground">{shift} Shift</h4>
                                                            <span className={`text-xs px-2 py-0.5 rounded-full ${colors.badge}`}>
                                                                {shiftGroups[shift].length} slots
                                                            </span>
                                                        </div>
                                                        <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                                                            {shiftGroups[shift].map((slot, idx) => (
                                                                <button
                                                                    key={idx}
                                                                    onClick={() => setSelectedSlot(slot)}
                                                                    className={`py-2 px-3 text-sm border rounded-lg transition font-medium ${
                                                                        selectedSlot?.start === slot.start
                                                                            ? 'bg-blue-600 text-white border-blue-600'
                                                                            : 'bg-card text-foreground border-border hover:border-blue-400 hover:bg-blue-500/10'
                                                                    }`}
                                                                >
                                                                    {slot.start}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                );
                                            });
                                        })()}
                                    </div>
                                ) : (
                                    <p className="text-muted-foreground text-center py-4">No available slots for this date</p>
                                )}
                            </div>
                        )}

                        <div className="flex justify-between mt-6">
                            <button
                                onClick={() => setStep(1)}
                                className="px-6 py-2 border border-border text-foreground rounded-lg hover:bg-muted transition"
                            >
                                ← Back
                            </button>
                            <button
                                onClick={() => setStep(3)}
                                disabled={!selectedSlot}
                                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed transition"
                            >
                                Next →
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 3: Confirm */}
                {step === 3 && (
                    <div>
                        <h3 className="text-lg font-semibold mb-4 text-foreground">Confirm Appointment</h3>

                        <div className="bg-muted rounded-lg p-6 mb-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-sm text-muted-foreground">Doctor</p>
                                    <p className="font-semibold text-foreground">{selectedDoctor?.full_name}</p>
                                    <p className="text-sm text-blue-600">{selectedDoctor?.specialization}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Date & Time</p>
                                    <p className="font-semibold text-foreground">{selectedDate}</p>
                                    <p className="text-sm text-text-secondary">{selectedSlot?.start} - {selectedSlot?.end}</p>
                                    {selectedSlot?.shift && (
                                        <p className="text-xs text-blue-500 mt-1">🕐 {selectedSlot.shift} Shift</p>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="mb-6">
                            <label className="block text-sm font-medium text-text-secondary mb-2">
                                Notes / Reason for Visit (Optional)
                            </label>
                            <textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="Describe your symptoms or reason for the appointment..."
                                rows={3}
                                className="w-full px-4 py-3 border border-border bg-input rounded-lg focus:ring-2 focus:ring-blue-500 text-foreground placeholder:text-muted-foreground"
                            />
                        </div>

                        <div className="flex justify-between">
                            <button
                                onClick={() => setStep(2)}
                                className="px-6 py-2 border border-border text-foreground rounded-lg hover:bg-muted transition"
                            >
                                ← Back
                            </button>
                            <button
                                onClick={handleBookAppointment}
                                disabled={loading}
                                className="px-8 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-muted disabled:text-muted-foreground transition flex items-center gap-2"
                            >
                                {loading ? (
                                    <>
                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                        Booking...
                                    </>
                                ) : (
                                    <>✓ Confirm Booking</>
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default BookAppointment;
