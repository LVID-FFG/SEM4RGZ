import React, { useRef, useState, useMemo } from 'react';
import { useNavigate, Link, Navigate } from 'react-router-dom';
import { useData } from '../App';
import Spinner from '../components/Spinner';
import '../index.css';

const Users = () => {
    const { users, addUser, approveUser, deleteUser, isAdmin, isAuditor, adminPath } = useData();
    const navigate = useNavigate();
    const usernameRef = useRef(null);
    const passwordRef = useRef(null);
    const fullNameRef = useRef(null);
    const roleRef = useRef(null);
    const [error, setError] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [approvingId, setApprovingId] = useState(null);
    const [deletingId, setDeletingId] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterRole, setFilterRole] = useState('all');
    const [filterStatus, setFilterStatus] = useState('all');
    const filteredUsers = useMemo(() => {
        return users.filter(user => {
            if (searchTerm) {
                const searchLower = searchTerm.toLowerCase();
                const matchName = user.username.toLowerCase().includes(searchLower);
                const matchFullName = user.fullName?.toLowerCase().includes(searchLower);
                if (!matchName && !matchFullName) return false;
            }
            if (filterRole !== 'all' && user.role !== filterRole) {
                return false;
            }
            if (filterStatus !== 'all') {
                if (filterStatus === 'approved' && !user.approved) return false;
                if (filterStatus === 'pending' && user.approved) return false;
            }
            return true;
        });
    }, [users, searchTerm, filterRole, filterStatus]);

    if (!isAdmin) {
        return <Navigate to="/" replace />;
    }

    const basePath = isAdmin && adminPath ? `/${adminPath}` : '';

    async function handleAddUser(e) {
        e.preventDefault();
        const username = usernameRef.current.value.trim();
        const password = passwordRef.current.value.trim();
        const fullName = fullNameRef.current.value.trim();
        const role = roleRef.current.value;
        if (!username || !password) {
            setError("Логин и пароль обязательны");
            return;
        }
        setError("");
        setIsSubmitting(true);

        try {
            await addUser({ username, password, fullName, role });
            usernameRef.current.value = "";
            passwordRef.current.value = "";
            fullNameRef.current.value = "";
        } catch (error) {
            setError(error.message || "Ошибка при добавлении пользователя");
        } finally {
            setIsSubmitting(false);
        }
    }

    async function handleApproveUser(id) {
        setApprovingId(id);
        try {
            await approveUser(id);
        } catch (error) {
            setError(error.message || "Ошибка при утверждении пользователя");
        } finally {
            setApprovingId(null);
        }
    }

    async function handleDeleteUser(id, fullName) {
        if (window.confirm(`Удалить пользователя ${fullName}?`)) {
            setDeletingId(id);
            try {
                await deleteUser(id);
            } catch (error) {
                setError(error.message || "Ошибка при удалении");
            } finally {
                setDeletingId(null);
            }
        }
    }

    const roleLabels = {
        'admin': 'Администратор',
        'operator': 'Оператор',
        'auditor': 'Аудитор'
    };

    const approvedUsers = filteredUsers.filter(u => u.approved);
    const pendingUsers = filteredUsers.filter(u => !u.approved);

    return (
        <div className="fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                <h1 style={{ marginBottom: 0 }}>Управление пользователями</h1>
            </div>
            {error && (
                <div className="alert alert-error">
                    <span>{error}</span>
                    <button onClick={() => setError('')}>×</button>
                </div>
            )}
            <div className="filters">
                <div className="filter-group">
                    <label>Поиск</label>
                    <input 
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Поиск по имени или логину..."
                    />
                </div>
                <div className="filter-group">
                    <label>Роль</label>
                    <select 
                        value={filterRole}
                        onChange={(e) => setFilterRole(e.target.value)}
                    >
                        <option value="all">Все роли</option>
                        <option value="admin">Администратор</option>
                        <option value="operator">Оператор</option>
                        <option value="auditor">Аудитор</option>
                    </select>
                </div>
                <div className="filter-group">
                    <label>Статус</label>
                    <select 
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                    >
                        <option value="all">Все</option>
                        <option value="approved">Утверждённые</option>
                        <option value="pending">Ожидающие</option>
                    </select>
                </div>
                <button 
                    onClick={() => {
                        setSearchTerm('');
                        setFilterRole('all');
                        setFilterStatus('all');
                    }}
                    className="btn btn-secondary"
                >
                    Сбросить
                </button>
            </div>
            <div className="card" style={{ marginBottom: '2rem' }}>
                <div className="card-header">
                    <div className="card-title"> Добавить нового пользователя</div>
                </div>
                <form onSubmit={handleAddUser}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                            <label>Логин</label>
                            <input type="text" ref={usernameRef} required disabled={isSubmitting} />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                            <label>Пароль</label>
                            <input type="password" ref={passwordRef} required disabled={isSubmitting} />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                            <label>Полное имя</label>
                            <input type="text" ref={fullNameRef} disabled={isSubmitting} />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                            <label>Роль</label>
                            <select ref={roleRef} defaultValue="operator" disabled={isSubmitting}>
                                <option value="operator">Оператор</option>
                                <option value="auditor">Аудитор</option>
                                <option value="admin">Администратор</option>
                            </select>
                        </div>
                    </div>
                    <div className="form-actions" style={{ marginTop: '1rem' }}>
                        <button type="submit" disabled={isSubmitting} className="btn btn-success">
                            {isSubmitting ? <><div className="spinner" style={{ width: '1rem', height: '1rem', borderWidth: '2px' }}></div> Добавление...</> : " Добавить"}
                        </button>
                    </div>
                </form>
            </div>
            {pendingUsers.length > 0 && (
                <>
                    <h3 style={{ color: 'var(--warning-color)', marginBottom: '1rem' }}>
                        Заявки на регистрацию ({pendingUsers.length})
                    </h3>
                    <div className="table-wrapper" style={{ marginBottom: '2rem' }}>
                        <table>
                            <thead>
                                <tr>
                                    <th>Логин</th>
                                    <th>Полное имя</th>
                                    <th>Роль</th>
                                    <th>Действия</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pendingUsers.map(user => (
                                    <tr key={user.id} style={{ backgroundColor: '#fffbeb' }}>
                                        <td>{user.username}</td>
                                        <td>{user.fullName || '—'}</td>
                                        <td>
                                            <span className={`role-badge ${
                                                user.role === 'admin' ? 'role-badge-admin' :
                                                user.role === 'operator' ? 'role-badge-operator' : 'role-badge-auditor'
                                            }`}>
                                                {roleLabels[user.role] || user.role}
                                            </span>
                                        </td>
                                        <td>
                                            <button 
                                                onClick={() => handleApproveUser(user.id)}
                                                disabled={approvingId === user.id}
                                                className="btn btn-success btn-sm"
                                                style={{ marginRight: '5px' }}
                                            >
                                                {approvingId === user.id ? "..." : "Утвердить"}
                                            </button>
                                            <button 
                                                onClick={() => handleDeleteUser(user.id, user.fullName || user.username)} 
                                                disabled={deletingId === user.id}
                                                className="btn btn-danger btn-sm"
                                            >
                                                {deletingId === user.id ? "..." : "Отклонить"}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
            <h3 style={{ color: 'var(--success-color)', marginBottom: '1rem' }}>
                Утверждённые пользователи ({approvedUsers.length})
            </h3>
            {approvedUsers.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-icon"></div>
                    <p>Нет утверждённых пользователей</p>
                </div>
            ) : (
                <div className="table-wrapper">
                    <table>
                        <thead>
                            <tr>
                                <th>Логин</th>
                                <th>Полное имя</th>
                                <th>Роль</th>
                                <th>Действия</th>
                            </tr>
                        </thead>
                        <tbody>
                            {approvedUsers.map(user => (
                                <tr key={user.id}>
                                    <td>{user.username}</td>
                                    <td>{user.fullName || '—'}</td>
                                    <td>
                                        <span className={`role-badge ${
                                            user.role === 'admin' ? 'role-badge-admin' :
                                            user.role === 'operator' ? 'role-badge-operator' : 'role-badge-auditor'
                                        }`}>
                                            {roleLabels[user.role] || user.role}
                                        </span>
                                    </td>
                                    <td>
                                        <button 
                                            onClick={() => navigate(`${basePath}/users/${user.id}`)}
                                            className="btn btn-primary btn-sm"
                                            style={{ marginRight: '5px' }}
                                        >
                                            Редактировать
                                        </button>
                                        <Link to={`${basePath}/history/user/${user.id}`} style={{ marginRight: '5px' }}>
                                            <button className="btn btn-secondary btn-sm">
                                                История
                                            </button>
                                        </Link>
                                        <button 
                                            onClick={() => handleDeleteUser(user.id, user.fullName || user.username)} 
                                            disabled={deletingId === user.id}
                                            className="btn btn-danger btn-sm"
                                        >
                                            {deletingId === user.id ? "..." : "Удалить"}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default Users;
