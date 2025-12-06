import { db } from './db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function initDatabase() {
  try {
    console.log('🔄 Initializing database...');
    
    // SQL 파일 읽기 (create_db_minimal.sql 사용)
    const sqlFile = path.join(__dirname, 'create_db_minimal.sql');
    
    if (!fs.existsSync(sqlFile)) {
      console.error('❌ create_db_minimal.sql file not found!');
      console.log('Please create this file first.');
      process.exit(1);
    }
    
    let sql = fs.readFileSync(sqlFile, 'utf8');
    
    // CREATE DATABASE와 USE 문 제거 (Railway는 이미 DB가 있음)
    sql = sql.replace(/CREATE DATABASE.*?;/gi, '');
    sql = sql.replace(/USE.*?;/gi, '');
    
    // 주석 제거
    sql = sql.replace(/--.*$/gm, '');
    sql = sql.replace(/\/\*[\s\S]*?\*\//g, '');
    
    // 세미콜론으로 쿼리 분리
    const queries = sql
      .split(';')
      .map(q => q.trim())
      .filter(q => q.length > 0);
    
    console.log(`📝 Found ${queries.length} queries to execute`);
    
    // 각 쿼리 실행
    let successCount = 0;
    let skipCount = 0;
    
    for (let i = 0; i < queries.length; i++) {
      const query = queries[i];
      try {
        await db.query(query);
        successCount++;
        
        // 테이블 생성 쿼리인 경우 이름 출력
        const tableMatch = query.match(/CREATE TABLE\s+(\w+)/i);
        if (tableMatch) {
          console.log(`✅ Created table: ${tableMatch[1]}`);
        } else {
          console.log(`✅ Query ${i + 1} executed`);
        }
      } catch (err) {
        // 테이블이 이미 존재하는 경우는 무시
        if (err.message.includes('already exists')) {
          skipCount++;
          const tableMatch = query.match(/CREATE TABLE\s+(\w+)/i);
          if (tableMatch) {
            console.log(`⏭️  Table already exists: ${tableMatch[1]}`);
          }
        } else {
          console.error(`❌ Query ${i + 1} error:`, err.message);
          console.error('Query:', query.substring(0, 100) + '...');
        }
      }
    }
    
    console.log('\n📊 Summary:');
    console.log(`   ✅ Success: ${successCount}`);
    console.log(`   ⏭️  Skipped: ${skipCount}`);
    console.log(`   Total: ${queries.length}`);
    console.log('\n✅ Database initialization completed!');
    
    await db.end();
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  }
}

initDatabase();