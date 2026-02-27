import React, { useState, useEffect } from 'react';
import { API_BASE, getAuthHeaders } from '../utils/api';

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const DoctorScheduleManager = ({ onClose }) => {
    const [schedules, setSchedules] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [slotDuration, setSlotDuration] = useState(30);

    useEffect(() => {
        loadSchedule();
    }, []);

    const loadSchedule = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/doctor/schedule`, {
                headers: getAuthHeaders()
            });
            const data = await res.json();
            
            if (data.success) {
                // Map existing schedules to full week
                const existingMap = {};
                // Group by day to handle multiple shifts
                data.schedules.forEach(s => {
                    if (!existingMap[s.day_of_week]) {
                        existingMap[s.day_of_week] = { shifts: [], raw: [] };
                    }
                    
                    // Identify shift type based on start time range (flexible — not exact match)
                    const hour = parseInt((s.start_time || '00:00').split(':')[0], 10);
                    let shiftType = '';
                    if (hour < 12) shiftType = 'morning';
                    else if (hour < 18) shiftType = 'evening';
                    else shiftType = 'night';
                    
                    if (!existingMap[s.day_of_week].shifts.includes(shiftType)) {
                        existingMap[s.day_of_week].shifts.push(shiftType);
                    }
                    existingMap[s.day_of_week].raw.push(s);
                });

                const fullWeek = DAYS_OF_WEEK.map(day => ({
                    day_of_week: day,
                    shifts: existingMap[day]?.shifts || [],
                    is_available: (existingMap[day]?.shifts || []).length > 0
                }));

                setSchedules(fullWeek);
                if (data.schedules.length > 0) {
                    setSlotDuration(data.schedules[0]?.slot_duration || 30);
                }
            }
        } catch (e) {
            setError('Failed to load schedule');
        }
        setLoading(false);
    };

    const handleShiftToggle = (dayIndex, shiftKey) => {
        const updated = [...schedules];
        const day = updated[dayIndex];
        
        // Toggle the shift
        if (day.shifts.includes(shiftKey)) {
            day.shifts = day.shifts.filter(s => s !== shiftKey);
        } else {
            day.shifts.push(shiftKey);
        }
        
        // Update availability based on having at least one shift
        day.is_available = day.shifts.length > 0;
        
        setSchedules(updated);
    };

    const handleApplyToAllDays = () => {
        const monday = schedules[0];
        const updated = schedules.map((day, idx) => {
            if (idx === 0) return day;
            return {
                ...day,
                shifts: [...monday.shifts],
                is_available: monday.is_available
            };
        });
        setSchedules(updated);
        setSuccess('Monday schedule applied to all days!');
        setTimeout(() => setSuccess(''), 2000);
    };

    const handleSave = async () => {
        setSaving(true);
        setError('');
        setSuccess('');

        try {
            // Flatten schedules for API (one entry per shift)
            const flattenedSchedules = [];
            
            const SHIFT_TIMES = {
                'morning': { start: '07:00', end: '14:00' },
                'evening': { start: '14:00', end: '22:00' },
                'night': { start: '22:00', end: '07:00' }
            };

            schedules.forEach(day => {
                day.shifts.forEach(shiftKey => {
                    flattenedSchedules.push({
                        day_of_week: day.day_of_week,
                        start_time: SHIFT_TIMES[shiftKey].start,
                        end_time: SHIFT_TIMES[shiftKey].end,
                        is_available: true
                    });
                });
            });

            const res = await fetch(`${API_BASE}/doctor/schedule`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    schedules: flattenedSchedules,
                    slot_duration: slotDuration
                })
            });

            const data = await res.json();

            if (data.success) {
                setSuccess('Schedule saved successfully!');
                setTimeout(() => setSuccess(''), 3000);
            } else {
                setError(data.error || 'Failed to save schedule');
            }
        } catch (e) {
            setError('Failed to save schedule');
        }
        setSaving(false);
    };

    const generateTimeOptions = () => {
        const options = [];
        for (let h = 6; h <= 22; h++) {
            for (let m = 0; m < 60; m += 30) {
                const hour = h.toString().padStart(2, '0');
                const min = m.toString().padStart(2, '0');
                options.push(`${hour}:${min}`);
            }
        }
        return options;
    };

    const timeOptions = generateTimeOptions();

    if (loading) {
        return (
            <div className="bg-surface rounded-lg shadow-xl p-8 max-w-3xl w-full">
                <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-surface rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-6 rounded-t-lg">
                <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-bold">📅 Recurring Yearly Schedule</h2>
                    {onClose && (
                        <button onClick={onClose} className="text-white hover:bg-surface/20 p-2 rounded transition">
                            ✕
                        </button>
                    )}
                </div>
                <p className="mt-2 text-indigo-100 italic">This schedule applies to every month of the year until updated.</p>
                <div className="mt-4 flex gap-2">
                    <span className="bg-surface/20 px-3 py-1 rounded-full text-xs font-semibold backdrop-blur-sm">✓ Recurring</span>
                    <span className="bg-surface/20 px-3 py-1 rounded-full text-xs font-semibold backdrop-blur-sm">✓ 2026-2027</span>
                </div>
            </div>

            <div className="p-6">
                {/* Messages */}
                {error && (
                    <div className="mb-4 p-3 bg-error-soft border border-red-300 text-red-700 rounded-lg">
                        {error}
                    </div>
                )}
                {success && (
                    <div className="mb-4 p-3 bg-success-soft border border-green-300 text-green-700 rounded-lg">
                        ✓ {success}
                    </div>
                )}

                {/* Slot Duration */}
                <div className="mb-6 p-4 bg-muted rounded-lg border border-border">
                    <label className="block text-sm font-medium text-text-secondary mb-2">
                        Appointment Duration (minutes)
                    </label>
                    <div className="flex justify-between items-center">
                        <select
                            value={slotDuration}
                            onChange={(e) => setSlotDuration(parseInt(e.target.value))}
                            className="px-4 py-2 bg-card text-foreground border border-border rounded-lg focus:ring-2 focus:ring-primary"
                        >
                            <option value={15}>15 minutes</option>
                            <option value={20}>20 minutes</option>
                            <option value={30}>30 minutes</option>
                            <option value={45}>45 minutes</option>
                            <option value={60}>60 minutes</option>
                        </select>
                        <button 
                            onClick={handleApplyToAllDays}
                            className="text-sm text-primary font-semibold hover:opacity-80 flex items-center gap-1 transition-colors"
                        >
                            📋 Apply Monday to All Days
                        </button>
                    </div>
                </div>

                {/* Weekly Schedule */}
                <div className="space-y-3">
                    {schedules.map((sched, idx) => (
                        <div
                            key={sched.day_of_week}
                            className={`flex flex-col md:flex-row md:items-center gap-4 p-4 rounded-lg border-2 transition-all ${
                                sched.is_available
                                    ? 'border-primary/40 bg-primary/10'
                                    : 'border-border bg-card'
                            }`}
                        >
                            {/* Day Name */}
                            <span className={`w-28 font-bold text-lg ${sched.is_available ? 'text-primary' : 'text-muted-foreground'}`}>
                                {sched.day_of_week}
                            </span>

                            {/* Shift Checkboxes */}
                            <div className="flex flex-wrap gap-4 flex-1">
                                <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition ${
                                    sched.shifts.includes('morning') 
                                    ? 'bg-blue-500/20 border-blue-400/60 text-blue-300' 
                                    : 'bg-card border-border text-muted-foreground hover:border-blue-400/50'
                                }`}>
                                    <input 
                                        type="checkbox" 
                                        className="w-4 h-4 accent-blue-500 rounded"
                                        checked={sched.shifts.includes('morning')}
                                        onChange={() => handleShiftToggle(idx, 'morning')}
                                    />
                                    <div className="flex flex-col">
                                        <span className="font-semibold">Morning</span>
                                        <span className="text-xs opacity-75">07:00 - 14:00</span>
                                    </div>
                                </label>

                                <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition ${
                                    sched.shifts.includes('evening') 
                                    ? 'bg-orange-500/20 border-orange-400/60 text-orange-300' 
                                    : 'bg-card border-border text-muted-foreground hover:border-orange-400/50'
                                }`}>
                                    <input 
                                        type="checkbox" 
                                        className="w-4 h-4 accent-orange-500 rounded"
                                        checked={sched.shifts.includes('evening')}
                                        onChange={() => handleShiftToggle(idx, 'evening')}
                                    />
                                    <div className="flex flex-col">
                                        <span className="font-semibold">Evening</span>
                                        <span className="text-xs opacity-75">14:00 - 22:00</span>
                                    </div>
                                </label>

                                <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition ${
                                    sched.shifts.includes('night') 
                                    ? 'bg-purple-500/20 border-purple-400/60 text-purple-300' 
                                    : 'bg-card border-border text-muted-foreground hover:border-purple-400/50'
                                }`}>
                                    <input 
                                        type="checkbox" 
                                        className="w-4 h-4 accent-purple-500 rounded"
                                        checked={sched.shifts.includes('night')}
                                        onChange={() => handleShiftToggle(idx, 'night')}
                                    />
                                    <div className="flex flex-col">
                                        <span className="font-semibold">Night</span>
                                        <span className="text-xs opacity-75">22:00 - 07:00</span>
                                    </div>
                                </label>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Actions */}
                <div className="flex justify-end mt-8 gap-3">
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="px-6 py-2 border border-border text-text-secondary rounded-lg hover:bg-background transition"
                        >
                            Cancel
                        </button>
                    )}
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-8 py-2 bg-primary hover:bg-primary-hover text-primary-foreground rounded-lg disabled:opacity-50 transition flex items-center gap-2"
                    >
                        {saving ? (
                            <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                Saving...
                            </>
                        ) : (
                            <>💾 Save Schedule</>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DoctorScheduleManager;
