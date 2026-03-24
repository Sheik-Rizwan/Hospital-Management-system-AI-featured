import React from 'react';

// MUI Components
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';

// Icons
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import PersonIcon from '@mui/icons-material/Person';
import AccessTimeIcon from '@mui/icons-material/AccessTime';

const TaskCard = ({ task, onComplete, onReject }) => {
    // Priority colors
    const getPriorityColor = (priority) => {
        switch (priority?.toLowerCase()) {
            case 'high': return 'error.main';
            case 'medium': return 'warning.main';
            case 'low': return 'success.main';
            default: return 'primary.main';
        }
    };

    const priorityColor = getPriorityColor(task.priority);
    const isOverdue = new Date(task.scheduled_time) < new Date();

    return (
        <Card sx={{ 
            mb: 2, 
            borderRadius: 3, 
            borderLeft: 6, 
            borderColor: priorityColor,
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            '&:hover': { transform: 'translateX(8px)', boxShadow: 6 },
            bgcolor: 'background.paper',
            position: 'relative',
            overflow: 'visible'
        }}>
            <CardContent sx={{ p: '16px !important' }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                    {/* Left Content */}
                    <Box sx={{ flex: 1 }}>
                        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
                            <Typography variant="h6" fontWeight={800} sx={{ lineHeight: 1.2 }}>
                                {task.description}
                            </Typography>
                            <Stack direction="row" spacing={1}>
                                <Chip 
                                    label={task.task_type} 
                                    size="small" 
                                    sx={{ 
                                        height: 20, 
                                        fontSize: '10px', 
                                        fontWeight: 800, 
                                        textTransform: 'uppercase',
                                        bgcolor: 'action.hover',
                                        color: 'text.secondary'
                                    }} 
                                />
                                {task.reassigned && (
                                    <Chip 
                                        label="Reassigned" 
                                        size="small" 
                                        color="warning"
                                        sx={{ 
                                            height: 20, 
                                            fontSize: '10px', 
                                            fontWeight: 800, 
                                            textTransform: 'uppercase',
                                            animation: 'pulse 2s infinite'
                                        }} 
                                    />
                                )}
                                {task.rejected && (
                                    <Chip 
                                        label="Rejected" 
                                        size="small" 
                                        color="error"
                                        sx={{ 
                                            height: 20, 
                                            fontSize: '10px', 
                                            fontWeight: 800, 
                                            textTransform: 'uppercase'
                                        }} 
                                    />
                                )}
                            </Stack>
                        </Stack>

                        <Stack direction="row" spacing={3} alignItems="center">
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.secondary' }}>
                                <PersonIcon sx={{ fontSize: 16 }} />
                                <Typography variant="caption" fontWeight={600}>
                                    {task.patient_name || task.patient_id}
                                </Typography>
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <AccessTimeIcon sx={{ fontSize: 16, color: isOverdue ? 'error.main' : 'primary.main' }} />
                                <Typography 
                                    variant="caption" 
                                    fontWeight={800} 
                                    sx={{ 
                                        fontFamily: 'monospace',
                                        color: isOverdue ? 'error.main' : 'primary.main'
                                    }}
                                >
                                    {new Date(task.scheduled_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </Typography>
                            </Box>
                        </Stack>
                    </Box>

                    {/* Right Actions */}
                    <Stack direction="row" spacing={1} sx={{ ml: 2 }}>
                        {onReject && task.status !== 'rejected' && task.status !== 'completed' && (
                            <Tooltip title="Reject Task">
                                <IconButton 
                                    onClick={() => onReject(task)}
                                    sx={{ 
                                        color: 'error.main',
                                        bgcolor: 'error.lighter',
                                        '&:hover': { bgcolor: 'error.main', color: 'white' }
                                    }}
                                >
                                    <CancelIcon />
                                </IconButton>
                            </Tooltip>
                        )}
                        {task.status !== 'completed' && task.status !== 'rejected' && (
                            <Tooltip title="Mark Completed">
                                <IconButton 
                                    onClick={() => onComplete(task.task_id || task._id)}
                                    sx={{ 
                                        color: 'primary.main',
                                        bgcolor: 'primary.lighter',
                                        '&:hover': { bgcolor: 'primary.main', color: 'white' },
                                        width: 48,
                                        height: 48
                                    }}
                                >
                                    <CheckCircleIcon sx={{ fontSize: 32 }} />
                                </IconButton>
                            </Tooltip>
                        )}
                    </Stack>
                </Stack>
            </CardContent>
        </Card>
    );
};

export default TaskCard;
