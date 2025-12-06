import mysql from "mysql2/promise";
import dotenv from 'dotenv';

dotenv.config();

// 환경변수 디버깅
console.log('🔍 Environment variables check:');
console.log('DB_HOST:', process.env.DB_HOST ? '✅ Set' : '❌ Missing');
console.log('DB_USER:', process.env.DB_USER ? '✅ Set' : '❌ Missing');
console.log('DB_PASSWORD:', process.env.DB_PASSWORD ? '✅ Set' : '❌ Missing');
console.log('DB_NAME:', process.env.DB_NAME ? '✅ Set' : '❌ Missing');
console.log('MYSQL_HOST:', process.env.MYSQL_HOST ? '✅ Set' : '❌ Missing');

// 필수 환경변수 검증 (Railway 배포 시 일시적으로 비활성화)
// const requiredEnvVars = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
// const missingVars = requiredEnvVars.filter(varName => 
//   !process.env[varName] && !process.env[varName.replace('DB_', 'MYSQL_')]
// );

// if (missingVars.length > 0) {
//   console.error('❌ Missing required environment variables:', missingVars);
//   console.error('Please check your .env file (local) or Railway Variables (production)');
//   console.error('Available env keys:', Object.keys(process.env).filter(k => k.includes('DB') || k.includes('MYSQL')));
//   process.exit(1);
// }

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
  keepAliveInitialDelay: 0,
  connectTimeout: 10000, // 10초 타임아웃
  acquireTimeout: 10000  // 10초 타임아웃
});

// 연결 테스트 (비동기로 변경)
db.getConnection()
  .then(connection => {
    console.log('✅ MySQL Database connected successfully');
    console.log(`📍 Host: ${process.env.MYSQL_HOST || process.env.DB_HOST || 'localhost'}`);
    console.log(`🗄️  Database: ${process.env.MYSQL_DATABASE || process.env.DB_NAME || 'replz_db'}`);
    connection.release();
  })
  .catch(err => {
    console.error('❌ MySQL connection error:', err.message);
    console.error('⚠️  Server will continue, but database operations will fail');
    console.error('Please check your database credentials in Railway Variables');
  });

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing database connections...');
  await db.end();
  process.exit(0);
});