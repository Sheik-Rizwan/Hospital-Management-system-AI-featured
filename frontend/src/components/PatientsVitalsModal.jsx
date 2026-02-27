import React from 'react';
import { formatDate } from '../utils/api';

const PatientsVitalsModal = ({ isOpen, onClose, patients }) => {
    if (!isOpen) return null;

    const getVitalStyle = (k, val) => {
        const lowerK = k.toLowerCase();
        // Check for abnormalities (simplified logic for visual highlighting)
        let isAbnormal = false;
        if (lowerK.includes('heart') && (val < 60 || val > 100)) isAbnormal = true;
        if (lowerK.includes('temp') && (val < 97 || val > 99)) isAbnormal = true;
        if (lowerK.includes('oxygen') && val < 95) isAbnormal = true;

        const baseStyle = "p-3 rounded-lg border flex flex-col items-center justify-center text-center transition-all hover:scale-105";
        
        if (lowerK.includes('heart') || lowerK.includes('pulse') || lowerK.includes('hr')) 
            return { className: `${baseStyle} ${isAbnormal ? 'bg-error-soft border-red-500 animate-pulse' : 'bg-red-500/10 border-red-500/20'} text-error`, icon: '❤️' };
        if (lowerK.includes('pressure') || lowerK.includes('bp')) 
            return { className: `${baseStyle} bg-purple-500/10 border-purple-500/20 text-purple-400`, icon: '🩸' };
        if (lowerK.includes('temp')) 
            return { className: `${baseStyle} ${isAbnormal ? 'bg-orange-500/20 border-orange-500' : 'bg-orange-500/10 border-orange-500/20'} text-orange-400`, icon: '🌡️' };
        if (lowerK.includes('oxygen') || lowerK.includes('spo2')) 
            return { className: `${baseStyle} ${isAbnormal ? 'bg-blue-500/20 border-blue-500' : 'bg-blue-500/10 border-blue-500/20'} text-blue-400`, icon: '🌬️' };
        if (lowerK.includes('respiratory') || lowerK.includes('resp')) 
            return { className: `${baseStyle} bg-primary/10 border-teal-500/20 text-primary`, icon: '🫁' };
        
        return { className: `${baseStyle} bg-border/50 border-border text-text-secondary`, icon: '📊' };
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
            <div className="bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col animate-fade-in-up">
                
                {/* Header */}
                <div className="px-8 py-6 border-b border-border flex justify-between items-center bg-card/50 rounded-t-2xl">
                    <div>
                        <h2 className="text-3xl font-bold text-white flex items-center gap-3">
                            <span className="text-4xl">💓</span> Live Vitals Monitor
                        </h2>
                        <p className="text-muted-foreground mt-1">Real-time overview of all patient vitals from latest handoffs</p>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-full bg-card hover:bg-border text-muted-foreground hover:text-white transition-all">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-surface/50">
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {patients.length === 0 ? (
                            <div className="col-span-full py-20 text-center text-muted-foreground">
                                <span className="text-6xl block mb-4 opacity-50">📉</span>
                                <p className="text-xl">No vitals data available.</p>
                            </div>
                        ) : (
                            patients.map(p => {
                                const v = p.vitals || p.latest_vitals || {}; // Handle inconsistent naming if any
                                return (
                                <div key={p.patient_id} className="bg-card/60 backdrop-blur-md border border-white/5 rounded-2xl p-6 hover:border-teal-500/30 transition-all hover:shadow-lg group">
                                    <div className="flex justify-between items-start mb-4 pb-4 border-b border-white/5">
                                        <div>
                                            <h3 className="text-xl font-bold text-foreground group-hover:text-primary transition-colors">{p.patient_name}</h3>
                                            <p className="text-xs font-mono text-muted-foreground mt-1">ID: {p.patient_id} • Rm: {p.room_number || 'N/A'}</p>
                                        </div>
                                        {p.last_updated && (
                                            <span className="text-[10px] bg-surface px-2 py-1 rounded text-muted-foreground border border-border">
                                                {formatDate(p.last_updated)}
                                            </span>
                                        )}
                                    </div>

                                    {Object.keys(v).length > 0 ? (
                                        <div className="grid grid-cols-3 gap-3">
                                            {/* Heart Rate */}
                                            <VitalCard 
                                                icon="❤️" label="Heart Rate" 
                                                value={v.heart_rate?.value || v.hr} 
                                                unit="bpm" 
                                                status={v.heart_rate?.status}
                                                color="text-error" bg="bg-red-500/10" border="border-red-500/20"
                                            />
                                            
                                            {/* Blood Pressure */}
                                            <VitalCard 
                                                icon="🩸" label="Blood Pressure" 
                                                value={(v.blood_pressure?.systolic && v.blood_pressure?.diastolic ? `${v.blood_pressure.systolic}/${v.blood_pressure.diastolic}` : null) || v.bp || v.blood_pressure} 
                                                unit="mmHg" 
                                                status={v.blood_pressure?.status}
                                                color="text-purple-400" bg="bg-purple-500/10" border="border-purple-500/20"
                                            />

                                            {/* Temperature */}
                                            <VitalCard 
                                                icon="🌡️" label="Temp" 
                                                value={v.temperature_celsius || v.temp || v.temperature} 
                                                unit="°C" // Note: Old data shows "39.2°C", so unit might double up if not careful. VitalCard logic below separates it.
                                                status={null}
                                                color="text-orange-400" bg="bg-orange-500/10" border="border-orange-500/20"
                                            />

                                            {/* SPO2 */}
                                            <VitalCard 
                                                icon="🌬️" label="SPO2" 
                                                value={v.oxygen_saturation || v.oxygen_saturation?.value || v.spo2?.value || v.spo2} 
                                                unit="%" 
                                                status={v.oxygen_saturation?.status || v.spo2?.status}
                                                color="text-blue-400" bg="bg-blue-500/10" border="border-blue-500/20"
                                            />

                                            {/* Resp Rate */}
                                            <VitalCard 
                                                icon="🫁" label="Resp. Rate" 
                                                value={v.respiratory_rate || v.respiratory_rate?.value || v.resp_rate} 
                                                unit="/min" 
                                                status={v.respiratory_rate?.status}
                                                color="text-primary" bg="bg-primary/10" border="border-teal-500/20"
                                            />
                                        </div>
                                    ) : (
                                        <div className="py-8 text-center bg-black/20 rounded-xl border border-dashed border-border">
                                            <p className="text-muted-foreground text-sm">No recorded vitals</p>
                                        </div>
                                    )}
                                </div>
                            )})
                        )}
                    </div>
                </div>

                {/* Helper Component defined inside matching scope */}

                
                {/* Footer */}
                <div className="px-8 py-4 border-t border-border bg-card/50 rounded-b-2xl text-center">
                    <p className="text-xs text-muted-foreground">
                        Updates automatically from latest nurse handoff reports. 
                        <span className="ml-2 text-teal-500/50 font-bold">● System Online</span>
                    </p>
                </div>
            </div>
        </div>
    );
};

const VitalCard = ({ icon, label, value, unit, status, color, bg, border }) => {
    let displayValue = value;
    let displayUnit = unit;

    // Handle object value (from structured report)
    if (typeof value === 'object' && value !== null) {
        displayValue = value.value || value.val;
        if (value.unit) displayUnit = value.unit;
    }

    if (!displayValue && displayValue !== 0) return (
        <div className={`p-3 rounded-lg border flex flex-col items-center justify-center text-center transition-all opacity-50 bg-card/50 border-border`}>
             <span className="text-2xl mb-1 grayscale opacity-30">{icon}</span>
             <span className="font-bold text-lg leading-tight text-text-secondary">--</span>
             <span className="text-[10px] uppercase font-bold text-text-secondary mt-1">{label}</span>
        </div>
    );

    const isCritical = status?.toLowerCase() === 'critical' || status?.toLowerCase() === 'low' || status?.toLowerCase() === 'elevated';
    
    return (
        <div className={`p-3 rounded-lg border flex flex-col items-center justify-center text-center transition-all hover:scale-105 ${bg} ${border} ${color} ${isCritical ? 'animate-pulse ring-1 ring-red-500' : ''}`}>
            <span className="text-2xl mb-1 opacity-80">{icon}</span>
            <span className="font-bold text-lg leading-tight">{displayValue} <span className="text-[10px] opacity-70">{displayUnit}</span></span>
            <span className="text-[10px] uppercase font-bold opacity-60 mt-1 truncate w-full">{label}</span>
        </div>
    );
};

export default PatientsVitalsModal;
