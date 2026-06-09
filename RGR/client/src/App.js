// client/src/App.js
import React, { useState, useEffect, createContext, useContext, useCallback, useMemo, useRef } from "react";
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useNavigate, useLocation } from "react-router-dom";
import Doors from "./pages/Doors";
import AddDoor from "./pages/AddDoor";
import DoorDetail from "./pages/DoorDetail";
import Users from "./pages/Users";
import UserDetail from "./pages/UserDetail";
import AuditLog from "./pages/AuditLog";
import AuditUsersView from "./pages/AuditUsersView";
import Login from "./pages/Login";
import HistoryDetail from "./pages/HistoryDetail";
import AdminPanel from "./pages/AdminPanel";
import FloorMap from "./pages/FloorMap";
import { doorApi, sealApi, auditApi, userApi, auth } from "./api";
import "./index.css";

export const DataContext = createContext();
export const useData = () => useContext(DataContext);

const Navigation = ({ onLogout, currentUser, userRole }) => {
    const isAdmin = userRole === 'admin';
    const isOperator = userRole === 'operator' || isAdmin;
    const isAuditor = userRole === 'auditor' || isAdmin;
    const location = useLocation();

    const getActiveClass = (path) => {
        return location.pathname === path ? 'active' : '';
    };

    const roleBadgeClass = userRole === 'admin' ? 'role-badge-admin' : 
                          userRole === 'operator' ? 'role-badge-operator' : 'role-badge-auditor';
    const roleLabel = userRole === 'admin' ? 'Администратор' : 
                     userRole === 'operator' ? 'Оператор' : 'Аудитор';

    return (
        <nav className="navbar">
            <div className="navbar-links">
                <Link to="/" className={getActiveClass('/')}>Двери</Link>
                <Link to="/map" className={getActiveClass('/map')}>Карта</Link>
                {isAuditor && <Link to="/audit-users" className={getActiveClass('/audit-users')}>Пользователи</Link>}
                {(isAuditor || isAdmin) && <Link to="/audit-log" className={getActiveClass('/audit-log')}>Журнал</Link>}
                {isAdmin && <Link to="/users" className={getActiveClass('/users')}>Управление пользователями</Link>}
                {isAdmin && <Link to="/add-door" className={getActiveClass('/add-door')}>Добавить дверь</Link>}
            </div>
            <div className="navbar-user">
                <span>
                    {currentUser?.fullName || 'Гость'}
                    <span className={`role-badge ${roleBadgeClass}`} style={{ marginLeft: '8px' }}>
                        {roleLabel}
                    </span>
                </span>
                <button className="btn btn-secondary btn-sm" onClick={onLogout}>Выйти</button>
            </div>
        </nav>
    );
};

const AdminNavigation = ({ onLogout, currentUser, adminPath }) => {
    const location = useLocation();

    const getActiveClass = (path) => {
        return location.pathname === path ? 'active' : '';
    };

    return (
        <nav className="navbar">
            <div className="navbar-links">
                <Link to={`/${adminPath}/admin_panel`} className={getActiveClass(`/${adminPath}/admin_panel`)}>Панель</Link>
                <Link to={`/${adminPath}/audit-log`} className={getActiveClass(`/${adminPath}/audit-log`)}>Журнал</Link>
                <Link to={`/${adminPath}/users`} className={getActiveClass(`/${adminPath}/users`)}>Управление пользователями</Link>
                <Link to={`/${adminPath}/add-door`} className={getActiveClass(`/${adminPath}/add-door`)}>Добавить дверь</Link>
                <Link to={`/${adminPath}/doors`} className={getActiveClass(`/${adminPath}/doors`)}>Двери</Link>
                <Link to={`/${adminPath}/map`} className={getActiveClass(`/${adminPath}/map`)}>Карта</Link>
            </div>
            <div className="navbar-user">
                <span>
                    {currentUser?.fullName || 'Гость'}
                    <span className="role-badge role-badge-admin" style={{ marginLeft: '8px' }}>Администратор</span>
                </span>
                <button className="btn btn-secondary btn-sm" onClick={onLogout}>Выйти</button>
            </div>
        </nav>
    );
};

const ProtectedRoute = ({ children, requiredRole }) => {
    const location = useLocation();
    const isAuthenticated = auth.isAuthenticated();
    
    if (!isAuthenticated) {
        return <Navigate to="/login" replace state={{ 
            from: location.pathname, 
            error: `Требуется авторизация для доступа к ${location.pathname}` 
        }} />;
    }
    
    if (requiredRole) {
        const userRole = auth.getUserRole();
        if (!requiredRole.includes(userRole)) {
            return <Navigate to="/" replace state={{ 
                error: `Доступ запрещён: требуется роль ${requiredRole.join(' или ')}` 
            }} />;
        }
    }
    
    return children;
};

const AppContent = () => {
    const [doors, setDoors] = useState([]);
    const [seals, setSeals] = useState([]);
    const [auditLog, setAuditLog] = useState([]);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [globalError, setGlobalError] = useState("");
    const navigate = useNavigate();
    const location = useLocation();
    const [adminPath, setAdminPath] = useState(null);
    
    const isAuthenticated = auth.isAuthenticated();
    const userRole = auth.getUserRole();
    const currentUser = auth.getCurrentUser();
    const isAdmin = userRole === 'admin';
    const isOperator = userRole === 'operator' || isAdmin;
    const isAuditor = userRole === 'auditor' || isAdmin;

    // Генерация пути для админа - только один раз
    useEffect(() => {
        if (isAuthenticated && isAdmin) {
            let path = sessionStorage.getItem('admin_path');
            if (!path) {
                path = 'admin_' + Math.random().toString(36).substring(2, 15);
                sessionStorage.setItem('admin_path', path);
            }
            setAdminPath(path);
        } else {
            sessionStorage.removeItem('admin_path');
            setAdminPath(null);
        }
    }, [isAuthenticated, isAdmin]);

    // Загрузка данных - только один раз
    useEffect(() => {
        let isMounted = true;
        async function loadData() {
            if (!isAuthenticated) {
                if (isMounted) setLoading(false);
                return;
            }
            try {
                const [doorsRes, sealsRes] = await Promise.all([
                    doorApi.getAll(),
                    sealApi.getAll()
                ]);
                if (isMounted) {
                    if (!doorsRes.error) setDoors(doorsRes.data);
                    if (!sealsRes.error) setSeals(sealsRes.data);
                    if (isAdmin || isAuditor) {
                        const [auditRes, usersRes] = await Promise.all([
                            auditApi.getAll(),
                            userApi.getAll()
                        ]);
                        if (isMounted) {
                            if (!auditRes.error) setAuditLog(auditRes.data);
                            if (!usersRes.error) setUsers(usersRes.data);
                        }
                    }
                    setLoading(false);
                }
            } catch (error) {
                if (isMounted) {
                    setGlobalError('Ошибка загрузки данных');
                    setLoading(false);
                }
            }
        }
        loadData();
        return () => { isMounted = false; };
    }, [isAuthenticated, isAdmin, isAuditor]);

    // Редирект админа - только если он на главной странице
    useEffect(() => {
        if (isAdmin && adminPath && location.pathname === '/') {
            navigate(`/${adminPath}/admin_panel`, { replace: true });
        }
    }, [isAdmin, adminPath, location.pathname, navigate]);

    const addDoor = useCallback(async (newDoor) => {
        const result = await doorApi.create(newDoor);
        if (result.error) {
            setGlobalError(result.error);
            throw new Error(result.error);
        }
        setDoors(prev => [...prev, result.data]);
        return result.data;
    }, []);

    const updateDoor = useCallback(async (id, updatedData) => {
        const result = await doorApi.update(id, updatedData);
        if (result.error) {
            setGlobalError(result.error);
            throw new Error(result.error);
        }
        setDoors(prev => prev.map(d => d.id === id ? result.data : d));
        return result.data;
    }, []);

    const deleteDoor = useCallback(async (id) => {
        const result = await doorApi.delete(id);
        if (result.error) {
            setGlobalError(result.error);
            throw new Error(result.error);
        }
        setDoors(prev => prev.filter(d => d.id !== id));
    }, []);

    const installSeal = useCallback(async (doorId, sealId) => {
        const result = await sealApi.install(doorId, sealId);
        if (result.error) {
            setGlobalError(result.error);
            throw new Error(result.error);
        }
        setSeals(prev => [...prev, result.data]);
        setDoors(prev => prev.map(d => d.id === doorId ? { ...d, hasSeal: true } : d));
        return result.data;
    }, []);

    const removeSeal = useCallback(async (doorId) => {
        const result = await sealApi.remove(doorId);
        if (result.error) {
            setGlobalError(result.error);
            throw new Error(result.error);
        }
        setSeals(prev => prev.map(s => s.doorId === doorId ? result.data : s));
        setDoors(prev => prev.map(d => d.id === doorId ? { ...d, hasSeal: false } : d));
        return result.data;
    }, []);

    const breakSeal = useCallback(async (doorId) => {
        const result = await sealApi.break(doorId);
        if (result.error) {
            setGlobalError(result.error);
            throw new Error(result.error);
        }
        setSeals(prev => prev.map(s => s.doorId === doorId ? result.data : s));
        setDoors(prev => prev.map(d => d.id === doorId ? { ...d, hasSeal: false } : d));
        return result.data;
    }, []);

    const disableSeal = useCallback(async (doorId) => {
        const result = await sealApi.disable(doorId);
        if (result.error) {
            setGlobalError(result.error);
            throw new Error(result.error);
        }
        setSeals(prev => prev.map(s => s.doorId === doorId ? result.data : s));
        setDoors(prev => prev.map(d => d.id === doorId ? { ...d, hasSeal: false } : d));
        return result.data;
    }, []);

    const enableSeal = useCallback(async (doorId) => {
        const result = await sealApi.enable(doorId);
        if (result.error) {
            setGlobalError(result.error);
            throw new Error(result.error);
        }
        setSeals(prev => prev.map(s => s.doorId === doorId ? result.data : s));
        setDoors(prev => prev.map(d => d.id === doorId ? { ...d, hasSeal: true } : d));
        return result.data;
    }, []);

    const addUser = useCallback(async (newUser) => {
        const result = await userApi.create(newUser);
        if (result.error) {
            setGlobalError(result.error);
            throw new Error(result.error);
        }
        setUsers(prev => [...prev, result.data]);
        return result.data;
    }, []);

    const approveUser = useCallback(async (id) => {
        const result = await userApi.approve(id);
        if (result.error) {
            setGlobalError(result.error);
            throw new Error(result.error);
        }
        setUsers(prev => prev.map(u => u.id === id ? { ...u, approved: true } : u));
        return result.data;
    }, []);

    const updateUser = useCallback(async (id, updatedData) => {
        const result = await userApi.update(id, updatedData);
        if (result.error) {
            setGlobalError(result.error);
            throw new Error(result.error);
        }
        setUsers(prev => prev.map(u => u.id === id ? result.data : u));
        return result.data;
    }, []);

    const deleteUser = useCallback(async (id) => {
        const result = await userApi.delete(id);
        if (result.error) {
            setGlobalError(result.error);
            throw new Error(result.error);
        }
        setUsers(prev => prev.filter(u => u.id !== id));
    }, []);

    const handleLogout = useCallback(() => {
        auth.logout();
        sessionStorage.removeItem('admin_path');
        navigate('/login');
    }, [navigate]);

    const contextValue = useMemo(() => ({
        doors,
        seals,
        auditLog,
        users,
        loading,
        globalError,
        setGlobalError,
        addDoor,
        updateDoor,
        deleteDoor,
        installSeal,
        removeSeal,
        breakSeal,
        disableSeal,
        enableSeal,
        addUser,
        approveUser,
        updateUser,
        deleteUser,
        isAdmin,
        isOperator,
        isAuditor,
        userRole,
        currentUser,
        adminPath
    }), [
        doors, seals, auditLog, users, loading, globalError,
        addDoor, updateDoor, deleteDoor,
        installSeal, removeSeal, breakSeal, disableSeal, enableSeal,
        addUser, approveUser, updateUser, deleteUser,
        isAdmin, isOperator, isAuditor, userRole, currentUser, adminPath
    ]);

    if (loading) {
        return (
            <div style={{ 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center', 
                height: '100vh', 
                flexDirection: 'column', 
                gap: '1rem' 
            }}>
                <div className="spinner" style={{ width: '3rem', height: '3rem', borderWidth: '3px' }}></div>
                <span style={{ color: 'var(--gray-500)', fontSize: '1rem' }}>Загрузка данных...</span>
            </div>
        );
    }

    return (
        <DataContext.Provider value={contextValue}>
            <div className="container">
                {isAdmin && adminPath ? (
                    <>
                        <AdminNavigation onLogout={handleLogout} currentUser={currentUser} adminPath={adminPath} />
                        {globalError && (
                            <div className="alert alert-error">
                                <span>{globalError}</span>
                                <button onClick={() => setGlobalError("")}>×</button>
                            </div>
                        )}
                        <Routes>
                            <Route path={`/${adminPath}/admin_panel`} element={<ProtectedRoute requiredRole={['admin']}><AdminPanel /></ProtectedRoute>} />
                            <Route path={`/${adminPath}/audit-log`} element={<ProtectedRoute requiredRole={['admin']}><AuditLog /></ProtectedRoute>} />
                            <Route path={`/${adminPath}/users`} element={<ProtectedRoute requiredRole={['admin']}><Users /></ProtectedRoute>} />
                            <Route path={`/${adminPath}/users/:id`} element={<ProtectedRoute requiredRole={['admin']}><UserDetail /></ProtectedRoute>} />
                            <Route path={`/${adminPath}/add-door`} element={<ProtectedRoute requiredRole={['admin']}><AddDoor /></ProtectedRoute>} />
                            <Route path={`/${adminPath}/doors`} element={<ProtectedRoute requiredRole={['admin']}><Doors /></ProtectedRoute>} />
                            <Route path={`/${adminPath}/doors/:id`} element={<ProtectedRoute requiredRole={['admin']}><DoorDetail /></ProtectedRoute>} />
                            <Route path={`/${adminPath}/history/:type/:id`} element={<ProtectedRoute requiredRole={['admin']}><HistoryDetail /></ProtectedRoute>} />
                            <Route path={`/${adminPath}/map`} element={<ProtectedRoute requiredRole={['admin']}><FloorMap /></ProtectedRoute>} />
                        </Routes>
                    </>
                ) : (
                    <>
                        <Navigation onLogout={handleLogout} currentUser={currentUser} userRole={userRole} />
                        {globalError && (
                            <div className="alert alert-error">
                                <span>{globalError}</span>
                                <button onClick={() => setGlobalError("")}>×</button>
                            </div>
                        )}
                        <Routes>
                            <Route path="/" element={<ProtectedRoute><Doors /></ProtectedRoute>} />
                            <Route path="/map" element={<ProtectedRoute><FloorMap /></ProtectedRoute>} />
                            <Route path="/add-door" element={<ProtectedRoute requiredRole={['admin']}><AddDoor /></ProtectedRoute>} />
                            <Route path="/doors/:id" element={<ProtectedRoute requiredRole={['admin', 'operator']}><DoorDetail /></ProtectedRoute>} />
                            <Route path="/audit-log" element={<ProtectedRoute requiredRole={['admin', 'auditor']}><AuditLog /></ProtectedRoute>} />
                            <Route path="/audit-users" element={<ProtectedRoute requiredRole={['auditor']}><AuditUsersView /></ProtectedRoute>} />
                            <Route path="/users" element={<ProtectedRoute requiredRole={['admin']}><Users /></ProtectedRoute>} />
                            <Route path="/users/:id" element={<ProtectedRoute requiredRole={['admin']}><UserDetail /></ProtectedRoute>} />
                            <Route path="/history/:type/:id" element={<ProtectedRoute requiredRole={['admin', 'auditor']}><HistoryDetail /></ProtectedRoute>} />
                        </Routes>
                    </>
                )}
            </div>
        </DataContext.Provider>
    );
};

const App = () => {
    return (
        <Router>
            <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/*" element={<AppContent />} />
            </Routes>
        </Router>
    );
};

export default App;
