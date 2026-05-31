import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { userApi, auditApi } from '../api';
import { useData } from '../App';
import Spinner from '../components/Spinner';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend 
} from 'recharts';
import '../index.css';
import api from '../api';

const COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#6b7280'];

const UserDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [username, setUsername] = useState("");
    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [role, setRole] = useState("operator");
    const [approved, setApproved] = useState(false);
    const [password, setPassword] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { updateUser, isAdmin, adminPath } = useData();

    const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
    const [isToggling2FA, setIsToggling2FA] = useState(false);

    // Статистика пользователя
    const [userStats, setUserStats] = useState({
        actions: {},
        doors: 0,
        seals: 0,
        totalEvents: 0
    });

    const basePath = adminPath ? `/${adminPath}` : '';

    useEffect(() => {
        if (!isAdmin) return;
        loadUser();
        load2FAStatus();
        loadUserStats();
    }, [id, isAdmin]);

    async function loadUser() {
        setLoading(true);
        const result = await userApi.getOne(id);
        if (result.error) {
            setError(result.error);
        } else {
            const user = result.data;
            setUsername(user.username || '');
            setFullName(user.fullName || '');
            setEmail(user.email || '');
            setRole(user.role || 'operator');
            setApproved(user.approved || false);
        }
        setLoading(false);
    }

    async function load2FAStatus() {
        try {
            const response = await api.get(`/api/users/${id}/2fa/status`);
            setTwoFactorEnabled(response.data.twoFactorEnabled);
        } catch (error) {
            console.error('Ошибка загрузки статуса 2FA:', error);
        }
    }

    async function loadUserStats() {
        try {
            const auditResult = await auditApi.getAll();
            if (!auditResult.error && auditResult.data) {
                const userLogs = auditResult.data.filter(log => log.userId === id);
                const actions = {};
                let seals = 0;
                userLogs.forEach(log => {
                    if (actions[log.action]) actions[log.action]++;
                    else actions[log.action] = 1;
                    if (log.doorId) seals++;
                });
                setUserStats({
                    actions,
                    doors: userLogs.filter(log => log.doorId).length,
                    seals,
                    totalEvents: userLogs.length
                });
            }
        } catch (error) {
            console.error('Ошибка загрузки статистики пользователя:', error);
        }
    }

    async function handleToggle2FA() {
        if (!window.confirm(`Вы уверены, что хотите ${twoFactorEnabled ? 'отключить' : 'включить'} 2FA для этого пользователя?`)) {
            return;
        }
        setIsToggling2FA(true);
        try {
            const endpoint = twoFactorEnabled ? 'disable' : 'enable';
            await api.post(`/api/users/${id}/2fa/${endpoint}`);
            setTwoFactorEnabled(!twoFactorEnabled);
            await loadUser();
        } catch (error) {
            setError(error.response?.data?.error || 'Ошибка при изменении 2FA');
        } finally {
            setIsToggling2FA(false);
        }
    }

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!username) {
            setError("Логин обязателен для заполнения");
            return;
        }
        setError("");
        setIsSubmitting(true);
        const updatedUser = { username, fullName, role, email };
        if (password.trim()) {
            updatedUser.password = password;
        }
        try {
            await updateUser(id, updatedUser);
            navigate(`${basePath}/users`);
        } catch (error) {
            setError(error.message || "Ошибка при обновлении пользователя");
        } finally {
            setIsSubmitting(false);
        }
    };

    // Подготовка данных для графика
    const actionLabels = {
        'install_seal': 'Установка пломбы',
        'remove_seal': 'Снятие пломбы',
        'break_seal': 'Взлом пломбы',
        'disable_seal': 'Отключение пломбы',
        'enable_seal': 'Включение пломбы',
        'door_created': 'Создание двери',
        'door_updated': 'Обновление двери',
        'door_deleted': 'Удаление двери',
        'user_created': 'Создание пользователя',
        'user_approved': 'Утверждение пользователя',
        'user_updated': 'Обновление пользователя',
        'user_deleted': 'Удаление пользователя'
    };

    const chartData = Object.entries(userStats.actions)
        .filter(([_, count]) => count > 0)
        .map(([action, count]) => ({
            name: actionLabels[action] || action,
            count
        }));

    if (!isAdmin) {
        return <Navigate to="/" replace />;
    }

    if (loading) {
        return (
            <div style={{ textAlign: "center", padding: "50px" }}>
                <div className="spinner" style={{ width: '3rem', height: '3rem', borderWidth: '3px' }}></div>
                <span style={{ color: 'var(--gray-500)', fontSize: '1rem', marginLeft: '0.5rem' }}>Загрузка данных пользователя...</span>
            </div>
        );
    }

    if (error && !username) {
        return (
            <div>
                <div className="alert alert-error">
                    {error}
                </div>
                <button onClick={() => navigate(`${basePath}/users`)} className="btn btn-secondary" style={{ marginTop: "20px" }}>
                    Вернуться к списку
                </button>
            </div>
        );
    }

    return (
        <div className="fade-in">
            <h1>Редактирование пользователя</h1>
            {error && (
                <div className="alert alert-error">
                    <span>{error}</span>
                    <button onClick={() => setError('')}>×</button>
                </div>
            )}
            
            <div style={{ marginBottom: '1.5rem', padding: '10px 15px', backgroundColor: approved ? '#d4edda' : '#fff3cd', border: `1px solid ${approved ? '#c3e6cb' : '#ffc107'}`, borderRadius: '4px' }}>
                <strong>Статус:</strong> {approved ? "Утверждён" : "Ожидает утверждения"}
            </div>

            {/* Статистика пользователя */}
            {userStats.totalEvents > 0 && (
                <div className="card" style={{ marginBottom: '1.5rem' }}>
                    <div className="card-header">
                        <div className="card-title">Статистика действий</div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                        <div style={{ textAlign: 'center', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
                            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#4f46e5' }}>{userStats.totalEvents}</div>
                            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Всего действий</div>
                        </div>
                        <div style={{ textAlign: 'center', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
                            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#10b981' }}>{userStats.seals}</div>
                            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Операций с пломбами</div>
                        </div>
                        <div style={{ textAlign: 'center', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
                            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#f59e0b' }}>{userStats.doors}</div>
                            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Дверей</div>
                        </div>
                    </div>
                    {chartData.length > 0 && (
                        <div style={{ height: '300px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="name" />
                                    <YAxis />
                                    <Tooltip />
                                    <Bar dataKey="count" fill="#4f46e5" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>
            )}

            <div className="card" style={{ marginBottom: '1.5rem' }}>
                <div className="card-header">
                    <div className="card-title">Двухфакторная аутентификация</div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <p style={{ marginBottom: '0.25rem' }}>
                            <strong>Статус:</strong> 
                            <span style={{ 
                                color: twoFactorEnabled ? 'var(--success-color)' : 'var(--gray-500)',
                                fontWeight: 'bold',
                                marginLeft: '5px'
                            }}>
                                {twoFactorEnabled ? 'Включена' : 'Отключена'}
                            </span>
                        </p>
                        <p style={{ fontSize: '0.875rem', color: 'var(--gray-500)', marginBottom: 0 }}>
                            {twoFactorEnabled 
                                ? 'При входе пользователь будет получать код подтверждения на почту.' 
                                : 'Двухфакторная аутентификация не используется.'}
                        </p>
                    </div>
                    <button 
                        onClick={handleToggle2FA} 
                        disabled={isToggling2FA}
                        className={`btn ${twoFactorEnabled ? 'btn-danger' : 'btn-success'} btn-sm`}
                    >
                        {isToggling2FA ? '...' : (twoFactorEnabled ? 'Отключить 2FA' : 'Включить 2FA')}
                    </button>
                </div>
            </div>

            <div className="card">
                <div className="card-header">
                    <div className="card-title">Редактирование профиля</div>
                </div>
                <form onSubmit={handleSubmit}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
                        <div className="form-group">
                            <label>Логин *</label>
                            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} required disabled={isSubmitting} />
                        </div>
                        <div className="form-group">
                            <label>Полное имя</label>
                            <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} disabled={isSubmitting} />
                        </div>
                        <div className="form-group">
                            <label>Email</label>
                            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={isSubmitting} />
                        </div>
                        <div className="form-group">
                            <label>Роль</label>
                            <select value={role} onChange={(e) => setRole(e.target.value)} disabled={isSubmitting}>
                                <option value="operator">Оператор</option>
                                <option value="auditor">Аудитор</option>
                                <option value="admin">Администратор</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Новый пароль (оставьте пустым, если не нужно менять)</label>
                            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={isSubmitting} />
                        </div>
                    </div>
                    <div className="form-actions">
                        <button type="submit" disabled={isSubmitting} className="btn btn-primary">
                            {isSubmitting ? <><div className="spinner" style={{ width: '1rem', height: '1rem', borderWidth: '2px' }}></div> Сохранение...</> : "💾 Сохранить изменения"}
                        </button>
                        <button type="button" onClick={() => navigate(`${basePath}/users`)} className="btn btn-secondary" disabled={isSubmitting}>
                            Отмена
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default UserDetail;