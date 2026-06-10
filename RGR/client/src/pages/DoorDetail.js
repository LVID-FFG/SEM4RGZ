import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doorApi, sealApi, auditApi } from '../api';
import { useData } from '../App';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import '../index.css';

const typeLabels = {
    'server': 'Серверная',
    'electrical': 'Электрощитовая',
    'storage': 'Склад',
    'office': 'Офис',
    'other': 'Другое'
};

const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#6b7280', '#3b82f6'];

const DoorDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [name, setName] = useState("");
    const [floor, setFloor] = useState("");
    const [location, setLocation] = useState("");
    const [type, setType] = useState("other");
    const [description, setDescription] = useState("");
    const [responsible, setResponsible] = useState("");
    const [hasSeal, setHasSeal] = useState(false);
    const [sealInfo, setSealInfo] = useState(null);
    const [sealHistory, setSealHistory] = useState([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [x, setX] = useState(100);
    const [y, setY] = useState(200);
    const [width, setWidth] = useState(80);
    const [height, setHeight] = useState(40);
    const {
        updateDoor,
        installSeal,
        removeSeal,
        breakSeal,
        disableSeal,
        enableSeal,
        isAdmin,
        isOperator,
        isAuditor,
        adminPath
    } = useData();

    const basePath = adminPath ? `/${adminPath}` : '';

    const formatDate = (dateString) => {
        if (!dateString) return '—';
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return '—';
        return date.toLocaleString();
    };

    const loadDoorData = useCallback(async () => {
        if (!id) return;
        setLoading(true);
        const doorResult = await doorApi.getOne(id);
        if (doorResult.error) {
            setError(doorResult.error);
            setLoading(false);
            return;
        }

        const door = doorResult.data;
        setName(door.name || '');
        setFloor(door.floor || '');
        setLocation(door.location || '');
        setType(door.type || 'other');
        setDescription(door.description || '');
        setResponsible(door.responsible || '');
        setHasSeal(door.hasSeal || false);
        setX(door.x || 100);
        setY(door.y || 200);
        setWidth(door.width || 80);
        setHeight(door.height || 40);

        const sealResult = await sealApi.getByDoor(id);
        if (!sealResult.error) {
            setSealInfo(sealResult.data);
        }

        const auditResult = await auditApi.getAll();
        if (!auditResult.error && auditResult.data) {
            const history = auditResult.data.filter(log =>
                log.doorId === id &&
                ['install_seal', 'remove_seal', 'break_seal', 'disable_seal', 'enable_seal'].includes(log.action)
            );
            setSealHistory(history);
        }
        setLoading(false);
    }, [id]);

    useEffect(() => {
        loadDoorData();
    }, [loadDoorData]);

    const getChartData = () => {
        const actionCounts = {
            'install_seal': 0,
            'remove_seal': 0,
            'break_seal': 0,
            'disable_seal': 0,
            'enable_seal': 0
        };

        sealHistory.forEach(log => {
            if (actionCounts[log.action] !== undefined) {
                actionCounts[log.action]++;
            }
        });

        return Object.entries(actionCounts)
            .filter(([_, count]) => count > 0)
            .map(([action, count]) => ({
                name: actionLabels[action] || action,
                value: count
            }));
    };

    const actionLabels = {
        'install_seal': 'Установка',
        'remove_seal': 'Снятие',
        'break_seal': 'Взлом',
        'disable_seal': 'Отключение',
        'enable_seal': 'Включение'
    };

    const chartData = getChartData();

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!name || !floor || !location) {
            setError("Название, этаж и расположение обязательны для заполнения");
            return;
        }
        setError("");
        setIsSubmitting(true);

        try {
            await updateDoor(id, { name, floor, location, type, description, responsible, x, y, width, height });
            navigate(`${basePath}/doors`);
        } catch (error) {
            setError(error.message || "Ошибка при обновлении");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleInstallSeal = async () => {
        if (!window.confirm("Установить пломбу на эту дверь?")) return;
        setIsSubmitting(true);
        try {
            await installSeal(id);
            await loadDoorData();
        } catch (error) {
            setError(error.message || "Ошибка установки пломбы");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleRemoveSeal = async () => {
        if (!window.confirm("Снять пломбу с этой двери?")) return;
        setIsSubmitting(true);
        try {
            await removeSeal(id);
            await loadDoorData();
        } catch (error) {
            setError(error.message || "Ошибка снятия пломбы");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleBreakSeal = async () => {
        if (!window.confirm("Вы действительно хотите взломать пломбу? Это действие будет зафиксировано в журнале!")) return;
        setIsSubmitting(true);
        try {
            await breakSeal(id);
            await loadDoorData();
        } catch (error) {
            setError(error.message || "Ошибка взлома пломбы");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDisableSeal = async () => {
        if (!window.confirm("Отключить пломбу на этой двери?")) return;
        setIsSubmitting(true);
        try {
            await disableSeal(id);
            await loadDoorData();
        } catch (error) {
            setError(error.message || "Ошибка отключения пломбы");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleEnableSeal = async () => {
        if (!window.confirm("Включить отключённую пломбу на этой двери?")) return;
        setIsSubmitting(true);
        try {
            await enableSeal(id);
            await loadDoorData();
        } catch (error) {
            setError(error.message || "Ошибка включения пломбы");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div style={{ textAlign: "center", padding: "50px" }}>
                <div className="spinner" style={{ width: '3rem', height: '3rem', borderWidth: '3px' }}></div>
                <span style={{ color: 'var(--gray-500)', fontSize: '1rem', marginLeft: '0.5rem' }}>Загрузка данных...</span>
            </div>
        );
    }

    if (error && !name) {
        return (
            <div>
                <div className="alert alert-error">
                    {error}
                </div>
                <button onClick={() => navigate(`${basePath}/doors`)} className="btn btn-secondary" style={{ marginTop: "20px" }}>
                    Вернуться к списку
                </button>
            </div>
        );
    }

    return (
        <div className="fade-in">
            <h1>Детали двери</h1>
            {error && (
                <div className="alert alert-error">
                    <span>{error}</span>
                    <button onClick={() => setError('')}>×</button>
                </div>
            )}

            <div className="card" style={{ marginBottom: '1.5rem' }}>
                <div className="card-header">
                    <div className="card-title">Информация о пломбе</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <p>
                        <strong>Статус:</strong>
                        <span style={{
                            color: hasSeal ? 'var(--success-color)' : 'var(--warning-color)',
                            fontWeight: 'bold',
                            marginLeft: '5px'
                        }}>
                            {hasSeal ? "Установлена" : "Отсутствует"}
                        </span>
                    </p>
                    {sealInfo && sealInfo.status === 'installed' && (
                        <>
                            <p><strong>ID пломбы:</strong> {sealInfo.id}</p>
                            <p><strong>Установлена:</strong> {formatDate(sealInfo.changedAt)}</p>
                            {sealInfo.installedByName && (
                                <p><strong>Установил:</strong> {sealInfo.installedByName}</p>
                            )}
                        </>
                    )}
                    {sealInfo && sealInfo.status === 'broken' && (
                        <p style={{ color: 'var(--danger-color)', fontWeight: 'bold' }}>
                            Пломба взломана! Время взлома: {formatDate(sealInfo.changedAt)}
                        </p>
                    )}
                    {sealInfo && sealInfo.status === 'disabled' && (
                        <p style={{ color: 'var(--warning-color)', fontWeight: 'bold' }}>
                            Пломба отключена! Время отключения: {formatDate(sealInfo.changedAt)}
                        </p>
                    )}
                    {sealInfo && sealInfo.status === 'removed' && (
                        <p style={{ color: 'var(--gray-500)', fontWeight: 'bold' }}>
                            Пломба снята! Время снятия: {formatDate(sealInfo.changedAt)}
                        </p>
                    )}
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                        {!hasSeal ? (
                            <button onClick={handleInstallSeal} disabled={isSubmitting} className="btn btn-success btn-sm">
                                {isSubmitting ? "..." : "Установить пломбу"}
                            </button>
                        ) : (
                            <>
                                <button onClick={handleRemoveSeal} disabled={isSubmitting} className="btn btn-danger btn-sm">
                                    {isSubmitting ? "..." : "Снять пломбу"}
                                </button>
                                <button onClick={handleBreakSeal} disabled={isSubmitting} className="btn btn-warning btn-sm">
                                    {isSubmitting ? "..." : "Взломать пломбу"}
                                </button>
                                <button onClick={handleDisableSeal} disabled={isSubmitting} className="btn btn-secondary btn-sm">
                                    {isSubmitting ? "..." : "Отключить пломбу"}
                                </button>
                            </>
                        )}
                        {sealInfo && sealInfo.status === 'disabled' && (
                            <button onClick={handleEnableSeal} disabled={isSubmitting} className="btn btn-success btn-sm">
                                {isSubmitting ? "..." : "Включить пломбу"}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <div className="card" style={{ marginBottom: '1.5rem' }}>
                <div className="card-header">
                    <div className="card-title">Детали двери</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.5rem' }}>
                    <p><strong>Название:</strong> {name}</p>
                    <p><strong>Этаж:</strong> {floor}</p>
                    <p><strong>Расположение:</strong> {location}</p>
                    <p><strong>Тип помещения:</strong> {typeLabels[type] || type}</p>
                    <p><strong>Описание:</strong> {description || '—'}</p>
                    <p><strong>Ответственный:</strong> {responsible || '—'}</p>
                </div>
            </div>

            {(isAdmin || isAuditor) && sealHistory.length > 0 && (
                <div className="card" style={{ marginBottom: '1.5rem' }}>
                    <div className="card-header">
                        <div className="card-title">Статистика пломб</div>
                    </div>
                    <div style={{ height: '300px', width: '100%' }}>
                        {chartData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={chartData}
                                        cx="50%"
                                        cy="50%"
                                        labelLine={false}
                                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                        outerRadius={80}
                                        fill="#8884d8"
                                        dataKey="value"
                                    >
                                        {chartData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                    <Legend />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <p style={{ textAlign: 'center', color: 'var(--gray-500)', paddingTop: '100px' }}>
                                Нет данных для отображения
                            </p>
                        )}
                    </div>
                </div>
            )}

            {isAdmin && (
                <div className="card">
                    <div className="card-header">
                        <div className="card-title">Редактирование</div>
                    </div>
                    <form onSubmit={handleSubmit}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
                            <div className="form-group">
                                <label>Название *</label>
                                <input type="text" value={name} onChange={(e) => setName(e.target.value)} required disabled={isSubmitting} />
                            </div>
                            <div className="form-group">
                                <label>Этаж *</label>
                                <input type="text" value={floor} onChange={(e) => setFloor(e.target.value)} required disabled={isSubmitting} />
                            </div>
                            <div className="form-group">
                                <label>Расположение *</label>
                                <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} required disabled={isSubmitting} />
                            </div>
                            <div className="form-group">
                                <label>Тип помещения</label>
                                <select value={type} onChange={(e) => setType(e.target.value)} disabled={isSubmitting}>
                                    <option value="server">Серверная</option>
                                    <option value="electrical">Электрощитовая</option>
                                    <option value="storage">Склад</option>
                                    <option value="office">Офис</option>
                                    <option value="other">Другое</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Описание</label>
                                <textarea value={description} onChange={(e) => setDescription(e.target.value)} disabled={isSubmitting} style={{ height: '40px' }} />
                            </div>
                            <div className="form-group">
                                <label>Ответственный</label>
                                <input type="text" value={responsible} onChange={(e) => setResponsible(e.target.value)} disabled={isSubmitting} />
                            </div>
                        </div>

                        <div style={{ marginTop: '1rem' }}>
                            <h3 style={{ marginBottom: '0.5rem', fontSize: '1rem', color: 'var(--gray-700)' }}>Координаты на карте</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
                                <div className="form-group">
                                    <label>X</label>
                                    <input type="number" value={x} onChange={(e) => setX(parseInt(e.target.value) || 100)} disabled={isSubmitting} />
                                </div>
                                <div className="form-group">
                                    <label>Y</label>
                                    <input type="number" value={y} onChange={(e) => setY(parseInt(e.target.value) || 200)} disabled={isSubmitting} />
                                </div>
                                <div className="form-group">
                                    <label>Ширина</label>
                                    <input type="number" value={width} onChange={(e) => setWidth(parseInt(e.target.value) || 80)} disabled={isSubmitting} />
                                </div>
                                <div className="form-group">
                                    <label>Высота</label>
                                    <input type="number" value={height} onChange={(e) => setHeight(parseInt(e.target.value) || 40)} disabled={isSubmitting} />
                                </div>
                            </div>
                        </div>

                        <div className="form-actions">
                            <button type="submit" disabled={isSubmitting} className="btn btn-primary">
                                {isSubmitting ? <><div className="spinner" style={{ width: '1rem', height: '1rem', borderWidth: '2px' }}></div> Сохранение...</> : "Сохранить изменения"}
                            </button>
                            <button type="button" onClick={() => navigate(`${basePath}/doors`)} className="btn btn-secondary" disabled={isSubmitting}>
                                Отмена
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
};

export default DoorDetail;
