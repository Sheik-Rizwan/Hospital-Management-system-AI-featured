import React from 'react';
import GenericSignup from './GenericSignup';
import BusinessIcon from '@mui/icons-material/Business';

const ManagerSignup = () => (
    <GenericSignup roleConfig={{
        key: 'hospital_manager',
        title: 'Hospital Manager',
        subtitle: 'Access analytics, staff performance, and financial dashboards.',
        color: '#F97316',
        gradient: 'linear-gradient(135deg, #9a3412 0%, #F97316 100%)',
        icon: <BusinessIcon fontSize="large" />,
        endpoint: '/auth/manager/signup',
        fields: [
            { name: 'department', label: 'Department', required: false },
        ],
    }} />
);

export default ManagerSignup;
