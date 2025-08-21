import { selectConnected } from '@/state/valkey-features/connection/valkeyConnectionSelectors.ts';
import { useSelector } from 'react-redux';
import { Navigate, Outlet } from 'react-router';

const RequireConnection = () => {
    const isConnected = useSelector(selectConnected);
    console.log('Connected:', isConnected);

    return isConnected ? <Outlet /> : <Navigate to="/connect" replace />;
};

export default RequireConnection;