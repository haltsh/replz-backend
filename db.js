import mysql from "mysql2/promise";
import dotenv from 'dotenv';

dotenv.config();

// 필수 환경변수 검증
const requiredEnvVars = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
const missingVars = requiredEnvVars.filter(varName => 
  !process.env[varName] && !process.env[varName.replace('DB_', 'MYSQL_')]
);

if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingVars);
  console.error('Please check your .env file (local) or Railway Variables (production)');
  process.exit(1);
}

// Railway MySQL 연결 설정
// Railway에서는 MYSQL_ 접두사, 로컬에서는 DB_ 접두사 사용
export const db = mysql.createPool({
  host: process.env.MYSQL_HOST || process.env.DB_HOST,
  port: parseInt(process.env.MYSQL_PORT || process.env.DB_PORT || '3306'),
  user: process.env.MYSQL_USER || process.env.DB_USER,
  password: process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD,
  database: process.env.MYSQL_DATABASE || process.env.DB_NAME,
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

// 연결 테스트
db.getConnection()
  .then(connection => {
    console.log('✅ MySQL Database connected successfully');
    console.log(`📍 Host: ${process.env.MYSQL_HOST || process.env.DB_HOST || 'localhost'}`);
    console.log(`🗄️  Database: ${process.env.MYSQL_DATABASE || process.env.DB_NAME || 'replz_db'}`);
    connection.release();
  })
  .catch(err => {
    console.error('❌ MySQL connection error:', err.message);
    console.error('Please check your database credentials in Railway Variables');
  });

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing database connections...');
  await db.end();
  process.exit(0);
});