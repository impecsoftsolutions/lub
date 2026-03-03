import React from 'react';
import { Navigate } from 'react-router-dom';

const AdminLogin: React.FC = () => {
  return <Navigate to="/signin" replace />;
};

export default AdminLogin;
