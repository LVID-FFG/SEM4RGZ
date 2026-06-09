import React, { useRef, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useData } from '../App';
import Spinner from '../components/Spinner';
import '../index.css';

const AddDoor = () => {
    const nameRef = useRef(null);
    const floorRef = useRef(null);
    const locationRef = useRef(null);
    const typeRef = useRef(null);
    const descriptionRef = useRef(null);
    const responsibleRef = useRef(null);
    const xRef = useRef(null);
    const yRef = useRef(null);
    const widthRef = useRef(null);
    const heightRef = useRef(null);
    const navigate = useNavigate();
    const [error, setError] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { addDoor, isAdmin, adminPath } = useData();

    if (!isAdmin) {
        return <Navigate to="/" replace />;
    }

    const basePath = adminPath ? `/${adminPath}` : '';

    const handleSubmit = async (e) => {
        e.preventDefault();
        const name = nameRef.current.value.trim();
        const floor = floorRef.current.value.trim();
        const location = locationRef.current.value.trim();
        const type = typeRef.current.value;
        const description = descriptionRef.current.value.trim();
        const responsible = responsibleRef.current.value.trim();
        const x = parseInt(xRef.current.value) || 100;
        const y = parseInt(yRef.current.value) || 200;
        const width = parseInt(widthRef.current.value) || 80;
        const height = parseInt(heightRef.current.value) || 40;

        if (!name || !floor || !location) {
            setError("Название, этаж и расположение обязательны для заполнения");
            return;
        }
        setError("");
        setIsSubmitting(true);

        try {
            await addDoor({ name, floor, location, type, description, responsible, x, y, width, height });
            navigate(basePath || '/');
        } catch (error) {
            setError(error.message || "Ошибка при добавлении");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fade-in">
            <h1> Добавление двери</h1>
            {error && (
                <div className="alert alert-error">
                    <span>{error}</span>
                    <button onClick={() => setError('')}>×</button>
                </div>
            )}
            <div className="card">
                <form onSubmit={handleSubmit}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
                        <div className="form-group">
                            <label>Название *</label>
                            <input type="text" ref={nameRef} required disabled={isSubmitting} placeholder="Введите название двери" />
                        </div>
                        <div className="form-group">
                            <label>Этаж *</label>
                            <input type="text" ref={floorRef} required disabled={isSubmitting} placeholder="Номер этажа" />
                        </div>
                        <div className="form-group">
                            <label>Расположение *</label>
                            <input type="text" ref={locationRef} required disabled={isSubmitting} placeholder="Кабинет, коридор..." />
                        </div>
                        <div className="form-group">
                            <label>Тип помещения</label>
                            <select ref={typeRef} defaultValue="other" disabled={isSubmitting}>
                                <option value="server">Серверная</option>
                                <option value="electrical">Электрощитовая</option>
                                <option value="storage">Склад</option>
                                <option value="office">Офис</option>
                                <option value="other">Другое</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Описание</label>
                            <textarea ref={descriptionRef} disabled={isSubmitting} placeholder="Описание двери..." style={{ height: '40px' }} />
                        </div>
                        <div className="form-group">
                            <label>Ответственный</label>
                            <input type="text" ref={responsibleRef} disabled={isSubmitting} placeholder="ФИО ответственного" />
                        </div>
                    </div>

                    <div style={{ marginTop: '1rem' }}>
                        <h3 style={{ marginBottom: '0.5rem', fontSize: '1rem', color: 'var(--gray-700)' }}>Координаты на карте</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
                            <div className="form-group">
                                <label>X</label>
                                <input type="number" ref={xRef} defaultValue="100" disabled={isSubmitting} />
                            </div>
                            <div className="form-group">
                                <label>Y</label>
                                <input type="number" ref={yRef} defaultValue="200" disabled={isSubmitting} />
                            </div>
                            <div className="form-group">
                                <label>Ширина</label>
                                <input type="number" ref={widthRef} defaultValue="80" disabled={isSubmitting} />
                            </div>
                            <div className="form-group">
                                <label>Высота</label>
                                <input type="number" ref={heightRef} defaultValue="40" disabled={isSubmitting} />
                            </div>
                        </div>
                        <p style={{ fontSize: '0.875rem', color: 'var(--gray-500)', marginTop: '0.5rem' }}>
                            Координаты можно будет отредактировать позже на странице двери.
                        </p>
                    </div>

                    <div className="form-actions">
                        <button type="submit" disabled={isSubmitting} className="btn btn-primary">
                            {isSubmitting ? <><div className="spinner" style={{ width: '1rem', height: '1rem', borderWidth: '2px' }}></div> Добавление...</> : " Добавить дверь"}
                        </button>
                        <button type="button" onClick={() => navigate(basePath || '/')} className="btn btn-secondary" disabled={isSubmitting}>
                            Отмена
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AddDoor;
