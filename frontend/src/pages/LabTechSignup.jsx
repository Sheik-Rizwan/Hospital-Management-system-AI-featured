import React from 'react';
import GenericSignup from './GenericSignup';
import ScienceIcon from '@mui/icons-material/Science';

const LabTechSignup = () => (
    <GenericSignup roleConfig={{
        key: 'lab_technician',
        title: 'Lab Technician',
        subtitle: 'Process lab requests and upload test results.',
        color: '#06B6D4',
        gradient: 'linear-gradient(135deg, #0e7490 0%, #06B6D4 100%)',
        icon: <ScienceIcon fontSize="large" />,
        endpoint: '/auth/lab/signup',
        fields: [
            { name: 'employee_id', label: 'Employee ID', required: true },
            { name: 'department', label: 'Department', required: false },
            { name: 'certification', label: 'Certification', required: false },
        ],
    }} />
);

export default LabTechSignup;
