import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { auth, userApi } from '../api';
import '../index.css';
import axios from 'axios';

const API_URL = 'http://localhost:5000';

const Login = () => {
    const [mode, setMode] = useState('login');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [email, setEmail] = useState(''); // Добавили email
    const [fullName, setFullName] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [role, setRole] = useState('operator');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();

    const [captchaId, setCaptchaId] = useState('');
    const [captchaImage, setCaptchaImage] = useState('');
    const [captchaText, setCaptchaText] = useState('');

    const [requires2FA, setRequires2FA] = useState(false);
    const [twoFactorCode, setTwoFactorCode] = useState('');

    useEffect(() => {
        if (location.state?.error) {
            setError(location.state.error);
            window.history.replaceState({}, document.title);
        }
    }, [location]);

    useEffect(() => {
        const loadCaptcha = async () => {
            try {
                const response = await axios.get(`${API_URL}/api/captcha`);
                setCaptchaId(response.data.captchaId);
                setCaptchaImage(response.data.image);
            } catch (error) {
                console.error('Ошибка загрузки капчи:', error);
            }
        };
        loadCaptcha();
    }, []);

    const handleLogin = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');
        setSuccess('');
        const result = await auth.login(username, password, captchaId, captchaText);
        if (result.success) {
            if (result.requires2FA) {
                setRequires2FA(true);
                setSuccess('Код подтверждения отправлен на почту');
            } else {
                const from = location.state?.from || '/';
                navigate(from, { replace: true });
            }
        } else {
            setError(result.error);
            try {
                const response = await axios.get(`${API_URL}/api/captcha`);
                setCaptchaId(response.data.captchaId);
                setCaptchaImage(response.data.image);
                setCaptchaText('');
            } catch (error) {
                console.error('Ошибка загрузки капчи:', error);
            }
        }
        setIsLoading(false);
    };

    const handle2FAVerify = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');
        const result = await auth.verify2FA(null, twoFactorCode);
        if (result.success) {
            const from = location.state?.from || '/';
            navigate(from, { replace: true });
        } else {
            setError(result.error);
        }
        setIsLoading(false);
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        if (password !== confirmPassword) {
            setError('Пароли не совпадают');
            return;
        }
        if (password.length < 6) {
            setError('Пароль должен быть не менее 6 символов');
            return;
        }
        setIsLoading(true);
        setError('');
        setSuccess('');
        try {
            await userApi.register({
                username,
                email, // Добавили email
                password,
                fullName: fullName || username,
                role: role,
                captchaId,
                captchaText
            });
            setSuccess('Регистрация успешна! Ожидайте утверждения администратором.');
            setUsername('');
            setEmail(''); // Очистить email
            setPassword('');
            setConfirmPassword('');
            setFullName('');
            setRole('operator');
            setMode('login');
            setCaptchaText('');
            try {
                const response = await axios.get(`${API_URL}/api/captcha`);
                setCaptchaId(response.data.captchaId);
                setCaptchaImage(response.data.image);
            } catch (error) {
                console.error('Ошибка загрузки капчи:', error);
            }
        } catch (error) {
            setError(error.message || 'Ошибка регистрации');
        } finally {
            setIsLoading(false);
        }
    };

    const handleForgotPassword = async () => {
        if (!username) {
            setError('Введите логин для восстановления пароля');
            return;
        }
        setIsLoading(true);
        setError('');
        const result = await auth.forgotPassword(username);
        if (result.success) {
            setSuccess('Код сброса отправлен на email. Проверьте почту.');
        } else {
            setError(result.error || 'Ошибка при запросе сброса пароля');
        }
        setIsLoading(false);
    };

    if (requires2FA) {
        return (
            <div style={{ 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center', 
                minHeight: '100vh',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                padding: '20px'
            }}>
                <div style={{ 
                    width: '100%', 
                    maxWidth: '440px', 
                    padding: '2.5rem',
                    background: 'white',
                    borderRadius: '16px',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
                }}>
                    <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                        <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🔑</div>
                        <h1 style={{ fontSize: '1.75rem', marginBottom: '0.25rem' }}>Двухфакторная аутентификация</h1>
                        <p style={{ color: 'var(--gray-500)', fontSize: '0.875rem' }}>
                            Введите код, отправленный на вашу почту
                        </p>
                    </div>
                    {error && (
                        <div className="alert alert-error">
                            <span>{error}</span>
                            <button onClick={() => setError('')}>×</button>
                        </div>
                    )}
                    {success && (
                        <div className="alert alert-success">
                            <span>{success}</span>
                            <button onClick={() => setSuccess('')}>×</button>
                        </div>
                    )}
                    <form onSubmit={handle2FAVerify}>
                        <div className="form-group">
                            <label>Код подтверждения</label>
                            <input
                                type="text"
                                value={twoFactorCode}
                                onChange={(e) => setTwoFactorCode(e.target.value)}
                                required
                                placeholder="Введите 6-значный код"
                                disabled={isLoading}
                            />
                        </div>
                        <button type="submit" disabled={isLoading} className="btn btn-primary btn-lg" style={{ width: '100%' }}>
                            {isLoading ? (
                                <>
                                    <div className="spinner" style={{ width: '1rem', height: '1rem', borderWidth: '2px' }}></div>
                                    Проверка...
                                </>
                            ) : 'Подтвердить'}
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            padding: '20px'
        }}>
            <div style={{ 
                width: '100%', 
                maxWidth: '440px', 
                padding: '2.5rem',
                background: 'white',
                borderRadius: '16px',
                boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
            }}>
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🔐</div>
                    <h1 style={{ fontSize: '1.75rem', marginBottom: '0.25rem' }}>
                        {mode === 'login' ? 'Вход в систему' : 'Регистрация'}
                    </h1>
                    <p style={{ color: 'var(--gray-500)', fontSize: '0.875rem' }}>
                        {mode === 'login' 
                            ? 'Войдите в систему для доступа к управлению' 
                            : 'Создайте учётную запись для работы с системой'}
                    </p>
                </div>
                {error && (
                    <div className="alert alert-error">
                        <span>{error}</span>
                        <button onClick={() => setError('')}>×</button>
                    </div>
                )}
                {success && (
                    <div className="alert alert-success">
                        <span>{success}</span>
                        <button onClick={() => setSuccess('')}>×</button>
                    </div>
                )}
                <form onSubmit={mode === 'login' ? handleLogin : handleRegister}>
                    <div className="form-group">
                        <label>Логин</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                            placeholder="Введите логин"
                            disabled={isLoading}
                        />
                    </div>
                    <div className="form-group">
                        <label>Пароль</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            placeholder="Введите пароль"
                            disabled={isLoading}
                        />
                    </div>
                    <div className="form-group">
                        <label>Капча</label>
                        <div dangerouslySetInnerHTML={{ __html: captchaImage }} style={{ marginBottom: '10px' }} />
                        <input
                            type="text"
                            value={captchaText}
                            onChange={(e) => setCaptchaText(e.target.value)}
                            placeholder="Введите код с картинки"
                            required
                            disabled={isLoading}
                        />
                    </div>
                    {mode === 'register' && (
                        <>
                            <div className="form-group">
                                <label>Email (для 2FA)</label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="example@mail.com"
                                    disabled={isLoading}
                                />
                            </div>
                            <div className="form-group">
                                <label>Подтверждение пароля</label>
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    required
                                    placeholder="Подтвердите пароль"
                                    disabled={isLoading}
                                />
                            </div>
                            <div className="form-group">
                                <label>Полное имя (ФИО)</label>
                                <input
                                    type="text"
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    placeholder="Иванов Иван Иванович"
                                    disabled={isLoading}
                                />
                            </div>
                            <div className="form-group">
                                <label>Желаемая роль</label>
                                <select
                                    value={role}
                                    onChange={(e) => setRole(e.target.value)}
                                    disabled={isLoading}
                                >
                                    <option value="operator">Оператор</option>
                                    <option value="auditor">Аудитор</option>
                                    <option value="admin">Администратор</option>
                                </select>
                            </div>
                        </>
                    )}
                    <button 
                        type="submit" 
                        disabled={isLoading}
                        className="btn btn-primary btn-lg"
                        style={{ width: '100%' }}
                    >
                        {isLoading ? (
                            <>
                                <div className="spinner" style={{ width: '1rem', height: '1rem', borderWidth: '2px' }}></div>
                                {mode === 'login' ? 'Вход...' : 'Регистрация...'}
                            </>
                        ) : (
                            mode === 'login' ? 'Войти' : 'Зарегистрироваться'
                        )}
                    </button>
                </form>
                <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
                    <button 
                        onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
                        className="btn btn-secondary"
                        style={{ width: '100%' }}
                        disabled={isLoading}
                    >
                        {mode === 'login' 
                            ? 'Нет аккаунта? Зарегистрироваться' 
                            : 'Уже есть аккаунт? Войти'}
                    </button>
                </div>
                {mode === 'login' && (
                    <div style={{ marginTop: '0.75rem', textAlign: 'center' }}>
                        <button 
                            onClick={handleForgotPassword}
                            className="btn btn-secondary"
                            style={{ width: '100%', backgroundColor: 'transparent', color: 'var(--primary-color)', border: 'none' }}
                            disabled={isLoading}
                        >
                            Забыли пароль?
                        </button>
                    </div>
                )}
                {mode === 'register' && (
                    <p style={{ marginTop: '1rem', fontSize: '0.875rem', color: 'var(--gray-500)', textAlign: 'center' }}>
                        После регистрации ваша учётная запись будет ожидать утверждения администратором.
                    </p>
                )}
            </div>
        </div>
    );
};

export default Login;