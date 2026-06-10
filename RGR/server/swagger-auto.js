const swaggerAutogen = require('swagger-autogen')();

const doc = {
    info: {
        title: 'Веб-приложение для контроля целостности пломб и замков',
        description: 'API для управления дверями, пломбами и пользователями',
        version: '1.0.0'
    },
    host: '147.45.215.184:3001',
    basePath: '/',
    schemes: ['https'],
    securityDefinitions: {
        cookieAuth: {
            type: 'apiKey',
            in: 'cookie',
            name: 'accessToken'
        }
    },
    security: [
        {
            cookieAuth: []
        }
    ],
    tags: [
        { name: 'Public', description: 'Открытые эндпоинты (доступны без авторизации)' },
        { name: 'Admin', description: 'Эндпоинты, доступные только администратору' },
        { name: 'Operator', description: 'Эндпоинты, доступные оператору (и администратору)' },
        { name: 'Auditor', description: 'Эндпоинты, доступные аудитору (и администратору)' }
    ],
    'x-tagGroups': [
        {
            name: 'Публичные эндпоинты',
            tags: ['Public']
        },
        {
            name: 'Администратор',
            tags: ['Admin']
        },
        {
            name: 'Оператор',
            tags: ['Operator']
        },
        {
            name: 'Аудитор',
            tags: ['Auditor']
        }
    ],
    definitions: {
        User: {
            type: 'object',
            properties: {
                id: { type: 'string' },
                username: { type: 'string' },
                role: { type: 'string' },
                fullName: { type: 'string' },
                approved: { type: 'boolean' }
            }
        },
        Door: {
            type: 'object',
            properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                floor: { type: 'string' },
                location: { type: 'string' },
                type: { type: 'string' },
                hasSeal: { type: 'boolean' }
            }
        },
        Seal: {
            type: 'object',
            properties: {
                id: { type: 'string' },
                doorId: { type: 'string' },
                status: { type: 'string' }
            }
        },
        AuditLog: {
            type: 'object',
            properties: {
                id: { type: 'string' },
                timestamp: { type: 'string' },
                userName: { type: 'string' },
                action: { type: 'string' },
                doorId: { type: 'string' },
                details: { type: 'string' }
            }
        }
    }
};

const outputFile = './swagger.json';
const endpointsFiles = ['./server.js'];

// Генерация Swagger-спецификации
swaggerAutogen(outputFile, endpointsFiles, doc).then(() => {
    console.log('Swagger-спецификация сгенерирована!');
    
    const fs = require('fs');
    const swagger = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
    
    // Добавляем недостающие публичные эндпоинты вручную
    const publicEndpoints = {
        '/api/login': {
            post: {
                tags: ['Public'],
                summary: 'Вход в систему',
                description: 'Аутентификация пользователя по логину и паролю с проверкой капчи',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    username: { type: 'string' },
                                    password: { type: 'string' },
                                    captchaId: { type: 'string' },
                                    captchaText: { type: 'string' }
                                }
                            }
                        }
                    }
                },
                responses: {
                    '200': { description: 'Успешный вход' },
                    '400': { description: 'Неверные данные' },
                    '401': { description: 'Неверный логин или пароль' },
                    '403': { description: 'Учётная запись не утверждена' },
                    '429': { description: 'Слишком много попыток входа' },
                    '500': { description: 'Ошибка сервера' }
                }
            }
        },
        '/api/register': {
            post: {
                tags: ['Public'],
                summary: 'Регистрация нового пользователя',
                description: 'Создание новой учётной записи',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    username: { type: 'string' },
                                    email: { type: 'string' },
                                    password: { type: 'string' },
                                    fullName: { type: 'string' },
                                    role: { type: 'string' },
                                    captchaId: { type: 'string' },
                                    captchaText: { type: 'string' }
                                }
                            }
                        }
                    }
                },
                responses: {
                    '201': { description: 'Пользователь создан' },
                    '400': { description: 'Неверные данные' },
                    '409': { description: 'Пользователь с таким логином уже существует' },
                    '500': { description: 'Ошибка сервера' }
                }
            }
        },
        '/api/captcha': {
            get: {
                tags: ['Public'],
                summary: 'Получить капчу',
                description: 'Генерирует новую капчу и возвращает её ID и изображение',
                responses: {
                    '200': { description: 'Капча сгенерирована' }
                }
            }
        },
        '/api/refresh': {
            post: {
                tags: ['Public'],
                summary: 'Обновление токена',
                description: 'Обновление access-токена по refresh-токену',
                responses: {
                    '200': { description: 'Токен обновлён' },
                    '403': { description: 'Недействительный refresh-токен' },
                    '500': { description: 'Ошибка сервера' }
                }
            }
        },
        '/api/forgot-password': {
            post: {
                tags: ['Public'],
                summary: 'Запрос сброса пароля',
                description: 'Отправка кода для сброса пароля на email',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    username: { type: 'string' }
                                }
                            }
                        }
                    }
                },
                responses: {
                    '200': { description: 'Код отправлен на email' },
                    '400': { description: 'Неверные данные' },
                    '500': { description: 'Ошибка сервера' }
                }
            }
        },
        '/api/reset-password': {
            post: {
                tags: ['Public'],
                summary: 'Сброс пароля',
                description: 'Установка нового пароля по коду',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    username: { type: 'string' },
                                    code: { type: 'string' },
                                    newPassword: { type: 'string' }
                                }
                            }
                        }
                    }
                },
                responses: {
                    '200': { description: 'Пароль успешно изменён' },
                    '400': { description: 'Неверные данные' },
                    '404': { description: 'Пользователь не найден' },
                    '500': { description: 'Ошибка сервера' }
                }
            }
        },
        '/api/2fa/verify-code': {
            post: {
                tags: ['Public'],
                summary: 'Подтверждение 2FA',
                description: 'Подтверждение двухфакторной аутентификации',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    userId: { type: 'string' },
                                    code: { type: 'string' }
                                }
                            }
                        }
                    }
                },
                responses: {
                    '200': { description: 'Успешное подтверждение' },
                    '400': { description: 'Неверные данные' },
                    '404': { description: 'Пользователь не найден' },
                    '500': { description: 'Ошибка сервера' }
                }
            }
        }
    };
    
    // Добавляем публичные эндпоинты в спецификацию
    for (const [path, methods] of Object.entries(publicEndpoints)) {
        swagger.paths[path] = methods;
    }
    
    // Карта тегов для остальных эндпоинтов
    const tagMap = {
        '/api/logout': ['Operator'],
        '/api/doors': {
            get: ['Operator'],
            post: ['Admin']
        },
        '/api/doors/{id}': {
            get: ['Operator'],
            put: ['Admin'],
            delete: ['Admin']
        },
        '/api/seals': {
            get: ['Operator']
        },
        '/api/seals/{doorId}': {
            get: ['Operator']
        },
        '/api/seals/install': {
            post: ['Operator']
        },
        '/api/seals/remove': {
            post: ['Operator']
        },
        '/api/seals/break': {
            post: ['Operator']
        },
        '/api/seals/disable': {
            post: ['Operator']
        },
        '/api/seals/enable': {
            post: ['Operator']
        },
        '/api/audit-log': {
            get: ['Auditor']
        },
        '/api/audit-log/verify': {
            get: ['Admin']
        },
        '/api/users': {
            get: ['Auditor'],
            post: ['Admin']
        },
        '/api/users/{id}': {
            get: ['Auditor'],
            put: ['Admin'],
            delete: ['Admin']
        },
        '/api/users/{id}/approve': {
            post: ['Admin']
        },
        '/api/users/{id}/2fa/enable': {
            post: ['Admin']
        },
        '/api/users/{id}/2fa/disable': {
            post: ['Admin']
        },
        '/api/users/{id}/2fa/status': {
            get: ['Admin']
        },
        '/api/alert': {
            post: ['Operator']
        }
    };
    
    // Добавляем теги в каждый эндпоинт
    for (const [path, value] of Object.entries(tagMap)) {
        if (swagger.paths[path]) {
            if (typeof value === 'string') {
                for (const method of Object.keys(swagger.paths[path])) {
                    swagger.paths[path][method].tags = [value];
                }
            } else if (typeof value === 'object') {
                for (const [method, tags] of Object.entries(value)) {
                    if (swagger.paths[path][method]) {
                        swagger.paths[path][method].tags = Array.isArray(tags) ? tags : [tags];
                    }
                }
            }
        }
    }
    
    // Сохраняем обновлённую спецификацию
    fs.writeFileSync(outputFile, JSON.stringify(swagger, null, 2));
    console.log('Swagger-спецификация обновлена!');
});
