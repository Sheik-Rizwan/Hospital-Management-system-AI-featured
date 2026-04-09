import { API_BASE, getAuthHeaders } from '../utils/api';

export const taskService = {
  // Get assigned tasks for current nurse
  getNurseTasks: async () => {
    const res = await fetch(`${API_BASE}/nurse/tasks`, {
      headers: getAuthHeaders()
    });
    return res.json();
  },

  // Update task status (e.g. to completed)
  updateTaskStatus: async (taskId, status) => {
    const res = await fetch(`${API_BASE}/nurse/tasks/${taskId}`, {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status })
    });
    return res.json();
  },

  // Update nurse status (online/offline)
  updateNurseStatus: async (status) => {
    const res = await fetch(`${API_BASE}/nurse/status`, {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status })
    });
    return res.json();
  },

  // Create care plan (Doctor)
  createCarePlan: async (planData) => {
    const res = await fetch(`${API_BASE}/doctor/care-plans`, {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(planData)
    });
    return res.json();
  }
};