import React from 'react';
import GenericSignup from './GenericSignup';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';

const FrontDeskSignup = () => (
    <GenericSignup roleConfig={{
        key: 'front_desk',
        title: 'Front Desk Officer',
        subtitle: 'Patient registration, appointments, and billing.',
        color: '#EC4899',
        gradient: 'linear-gradient(135deg, #9d174d 0%, #EC4899 100%)',
        icon: <SupportAgentIcon fontSize="large" />,
        endpoint: '/auth/frontdesk/signup',
        fields: [
            { name: 'employee_id', label: 'Employee ID', required: true },
            { name: 'desk_location', label: 'Desk Location', required: false },
        ],
    }} />
);

export default FrontDeskSignup;
