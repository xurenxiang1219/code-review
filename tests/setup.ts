import '@testing-library/jest-dom';

// 设置测试环境变量
(process.env as any).NODE_ENV = 'test';
(process.env as any).REDIS_HOST = 'localhost';
(process.env as any).REDIS_PORT = '6379';
(process.env as any).REDIS_DB = '1'; // 使用测试数据库