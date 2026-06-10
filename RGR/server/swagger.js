const swaggerJsdoc = require('swagger-jsdoc');

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Веб-приложение для контроля целостности пломб и замков',
            version: '1.0.0',
            description: 'API для управления дверями, пломбами и пользователями',
        },
        servers: [
            {
                url: 'https://147.45.215.184:3001',
                description: 'Продакшен сервер',
            },
            {
                url: 'http://localhost:3000',
                description: 'Локальный сервер',
            }
        ],
        components: {
            securitySchemes: {
                cookieAuth: {
                    type: 'apiKey',
                    in: 'cookie',
                    name: 'accessToken'
                }
            }
        },
        security: [
            {
                cookieAuth: []
            }
        ]
    },
    apis: ['./server.js'],
};

const specs = swaggerJsdoc(options);

module.exports = specs;
