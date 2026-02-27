import React from 'react';

const TaskCard = ({ task, onComplete, onReject }) => {
    // Priority colors (Glow effects for dark mode)
    const priorityStyles = {
        high: 'border-l-red-500 bg-gradient-to-r from-red-500/10 to-transparent hover:from-red-500/20',
        medium: 'border-l-yellow-500 bg-gradient-to-r from-yellow-500/10 to-transparent hover:from-yellow-500/20',
        low: 'border-l-green-500 bg-gradient-to-r from-green-500/10 to-transparent hover:from-green-500/20',
        normal: 'border-l-blue-500 bg-gradient-to-r from-blue-500/10 to-transparent hover:from-blue-500/20'
    };

    const cardStyle = priorityStyles[task.priority] || priorityStyles.normal;

    return (
        <div className={`p-4 mb-3 rounded-xl border-l-[6px] shadow-lg backdrop-blur-sm border border-white/5 transition-all duration-300 hover:translate-x-1 ${cardStyle} group`}>
            <div className="flex justify-between items-center">
                {/* Left Content */}
                <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                        <span className="font-bold text-foreground text-lg group-hover:text-white transition-colors">
                            {task.description}
                        </span>
                        <div className="flex gap-2">
                            <span className="text-[10px] uppercase font-bold tracking-wider text-text-secondary bg-border/50 px-2 py-1 rounded border border-border">
                                {task.task_type}
                            </span>
                            {task.reassigned && (
                                <span className="text-[10px] uppercase font-bold tracking-wider text-orange-300 bg-orange-900/40 px-2 py-1 rounded border border-orange-700/50 animate-pulse">
                                    Reassigned
                                </span>
                            )}
                            {task.rejected && (
                                <span className="text-[10px] uppercase font-bold tracking-wider text-red-300 bg-red-900/40 px-2 py-1 rounded border border-red-700/50">
                                    Rejected
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-5 text-sm">
                        <div className="flex items-center gap-1.5 text-muted-foreground group-hover:text-text-secondary transition-colors">
                            <span className="text-lg">👤</span>
                            <span className="font-medium">{task.patient_name || task.patient_id}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-muted-foreground group-hover:text-text-secondary transition-colors">
                            <span className="text-lg">⏰</span>
                            <span className={`font-mono font-medium ${
                                new Date(task.scheduled_time) < new Date() ? 'text-error' : 'text-primary'
                            }`}>
                                {new Date(task.scheduled_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Right Actions */}
                <div className="flex items-center gap-2 ml-4">
                    {/* Reject Button */}
                    {onReject && task.status !== 'rejected' && task.status !== 'completed' && (
                        <button
                            onClick={() => onReject(task)}
                            className="w-10 h-10 flex items-center justify-center rounded-full bg-error-soft text-error border border-red-500/50 hover:bg-red-500 hover:text-white hover:scale-110 active:scale-95 transition-all duration-300"
                            title="Reject Task"
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    )}
                    {/* Complete Button */}
                    {task.status !== 'completed' && task.status !== 'rejected' && (
                        <button
                            onClick={() => onComplete(task.task_id || task._id)}
                            className="w-12 h-12 flex items-center justify-center rounded-full bg-primary/20 text-primary border border-primary/50 shadow-[0_0_15px_rgba(20,184,166,0.2)] hover:bg-primary hover:text-white hover:shadow-[0_0_25px_rgba(20,184,166,0.6)] hover:scale-110 active:scale-95 transition-all duration-300"
                            title="Mark Completed"
                        >
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TaskCard;
