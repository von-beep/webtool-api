const API_BASE_URL = 'http://localhost:5000/api'; // Adjust if your backend runs on a different port or host

export const deleteHolidayRequestApi = async (requestId) => {
  const response = await fetch(`${API_BASE_URL}/holiday-requests/${requestId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to delete holiday request');
  }
  return response.json();
};
// Placeholder for other API functions that might exist in this file
// export const auth = {};
// export const signInAnonymously = async () => {};
// export const signInWithCustomToken = async () => {};
// export const onAuthStateChanged = () => {};
// export const db = {};
// export const doc = () => {};
// export const setDoc = async () => {};
// export const onSnapshot = () => {};
// export const updateDoc = async () => {};
// export const arrayUnion = (item) => item; // Mock for arrayUnion
// export const arrayRemove = (item) => item; // Mock for arrayRemove
// export const appId = 'mock-app-id';
// export const loginUser = async (email, password) => {};
// export const addUser = async (user) => {};
// export const addPendingUser = async (user) => {};
// export const getAllData = async () => {};
// export const resetUserPassword = async (userId, newPassword) => {};
// export const updateUserStatus = async (userId, status) => {};
// export const updateUserLeaveCredits = async (userId, credits) => {};