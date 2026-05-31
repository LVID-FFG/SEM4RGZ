import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../App';
import Spinner from '../components/Spinner';

const AuditUsers = () => {
    const { users, auditLog, isAdmin, isAuditor } = useData();
    const [loading, setLoading] = useState(true);
    const [userStats, setUserStats] = useState([]);

    // Только действия с пломбами для аудитора
    const relevantActions = [
        'install_seal', 'remove_seal', 'break_seal', 'disable_seal', 'enable_seal'
    ];

    useEffect(() => {
        if (users.length > 0 && auditLog.length > 0) {
            // Для аудитора фильтруем только действия с пломбами
            const filteredEvents = isAuditor && !isAdmin
                ? auditLog.filter(log => relevantActions.includes(log.action))
                : auditLog;
            
            // Группируем по пользователям
            const stats = {};
            users.forEach(user => {
                const userEvents = filteredEvents.filter(log => log.userId === user.id);
                stats[user.id] = {
                    user: user,
                    events: userEvents,
                    count: userEvents.length
                };
            });
            
            setUserStats(Object.values(stats));
            setLoading(false);
        } else if (users.length === 0) {
            setLoading(false);
        } else {
            setLoading(false);
        }
    }, [users, auditLog, isAuditor, isAdmin]);

    const actionLabels = {
        'install_seal': 'Установка пломбы',
        'remove_seal': 'Снятие пломбы',
        'break_seal': '⚠️ Взлом пломбы',
        'disable_seal': '🔒 Отключение пломбы',
        'enable_seal': '🔓 Включение пломбы'
    };

    if (loading) {
        return (
            <div style={{ textAlign: "center", padding: "50px" }}>
                <Spinner />
                <span>Загрузка пользователей...</span>
            </div>
        );
    }

    return (
        <div>
            <h1>Пользователи и их действия с пломбами</h1>
            {userStats.length === 0 ? (
                <p>Нет данных о пользователях или действиях с пломбами.</p>
            ) : (
                <table border="1" cellPadding="8" style={{ borderCollapse: "collapse", width: "100%" }}>
                    <thead>
                        <tr>
                            <th>Пользователь</th>
                            <th>Роль</th>
                            <th>Количество действий</th>
                            <th>Последнее действие</th>
                            <th>Действия</th>
                        </tr>
                    </thead>
                    <tbody>
                        {userStats.map(item => {
                            const lastEvent = item.events.length > 0 ? item.events[item.events.length - 1] : null;
                            return (
                                <tr key={item.user.id}>
                                    <td>{item.user.fullName || item.user.username}</td>
                                    <td>
                                        {item.user.role === 'admin' ? 'Администратор' : 
                                         item.user.role === 'operator' ? 'Оператор' : 'Аудитор'}
                                    </td>
                                    <td>{item.count}</td>
                                    <td>
                                        {lastEvent ? (
                                            <>
                                                {new Date(lastEvent.timestamp).toLocaleString('ru-RU')} — 
                                                {actionLabels[lastEvent.action] || lastEvent.action}
                                            </>
                                        ) : '—'}
                                    </td>
                                    <td>
                                        <Link to={`/history/user/${item.user.id}`}>
                                            <button>История</button>
                                        </Link>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            )}
        </div>
    );
};

export default AuditUsers;