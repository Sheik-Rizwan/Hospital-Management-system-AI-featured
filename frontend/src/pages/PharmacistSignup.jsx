import React from 'react';
import GenericSignup from './GenericSignup';
import MedicationIcon from '@mui/icons-material/Medication';

const PharmacistSignup = () => (
    <GenericSignup roleConfig={{
        key: 'pharmacist',
        title: 'Pharmacist',
        subtitle: 'Manage prescriptions and medication inventory.',
        color: '#14B8A6',
        gradient: 'linear-gradient(135deg, #0f766e 0%, #14B8A6 100%)',
        icon: <MedicationIcon fontSize="large" />,
        endpoint: '/auth/pharmacist/signup',
        fields: [
            { name: 'employee_id', label: 'Employee ID', required: true },
            { name: 'license_number', label: 'License Number', required: true },
        ],
    }} />
);

export default PharmacistSignup;
