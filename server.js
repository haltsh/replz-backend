import 'dotenv/config';
import express from "express";
import cors from "cors";

import inventoryRoutes from "./routes/inventory.js";
import itemRoutes from "./routes/items.js";
import receiptsRoutes from "./routes/receipts.js";
import recipeRoutes from "./routes/recipe.js";
import authRoutes from "./routes/auth.js";
import usersRouter from "./routes/users.js";
import healthRouter from './routes/health.js';
import intakeRouter from './routes/intake.js'; // 추가

const app = express();

// CORS 설정 - Railway 배포 시 프론트엔드 도메인 추가
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://replz.vercel.app',
  process.env.FRONTEND_URL // Railway 프론트엔드 URL
].filter(Boolean);

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// JSON 파싱
app.use(express.json());

// 정적 파일 제공
app.use("/uploads", express.static("uploads"));

// 루트 경로
app.get("/", (req, res) => {
  res.json({ 
    message: "✅ Replz Backend API is running!",
    version: "1.0.0",
    endpoints: {
      auth: "/api/auth",
      inventories: "/api/inventories",
      items: "/api/items",
      receipts: "/api/receipts",
      recipes: "/api",
      users: "/api/users",
      health: "/api/health",
      intake: "/api/intake" // 추가
    }
  });
});

// Health check endpoint for Railway
app.get("/health", (req, res) => {
  res.json({ 
    status: "OK", 
    timestamp: new Date(),
    uptime: process.uptime()
  });
});

// 라우터 등록
app.use("/api/auth", authRoutes);
app.use("/api/inventories", inventoryRoutes);
app.use("/api/items", itemRoutes);
app.use("/api/receipts", receiptsRoutes);
app.use("/api/users", usersRouter);
app.use('/api', healthRouter);
app.use('/api', intakeRouter);
app.use("/api", recipeRoutes);

// 404 핸들러
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// 전역 에러 핸들러
app.use((err, req, res, next) => {
  console.error('전역 에러:', err);
  res.status(500).json({ 
    error: '서버 에러가 발생했습니다',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Railway는 PORT 환경변수를 자동으로 제공
const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📧 인증 API: /api/auth`);
  console.log(`💪 건강 API: /api/health`);
  console.log(`🍽️ 섭취 API: /api/intake`); // 추가
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});