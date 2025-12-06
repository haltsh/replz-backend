import mysql from "mysql2/promise";
import dotenv from 'dotenv';

dotenv.config();

// Railway MySQL 연결 설정 - Railway 기본 환경변수 사용
export const db = mysql.createPool({
  host: process.env.MYSQLHOST || process.env.DB_HOST || "localhost",
  port: parseInt(process.env.MYSQLPORT || process.env.DB_PORT || '3306'),
  user: process.env.MYSQLUSER || process.env.DB_USER || "root",
  password: process.env.MYSQLPASSWORD || process.env.DB_PASSWORD,
  database: process.env.MYSQLDATABASE || process.env.DB_NAME || "replz_db",
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  connectTimeout: 10000
});

// 연결 테스트
db.getConnection()
  .then(connection => {
    console.log('✅ MySQL Database connected successfully');
    console.log(`📍 Host: ${process.env.MYSQLHOST || process.env.DB_HOST || 'localhost'}`);
    console.log(`🗄️  Database: ${process.env.MYSQLDATABASE || process.env.DB_NAME || 'replz_db'}`);
    connection.release();
  })
  .catch(err => {
    console.error('❌ MySQL connection error:', err.message);
    console.error('⚠️  Server will continue, but database operations will fail');
  });

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing database connections...');
  await db.end();
  process.exit(0);
});