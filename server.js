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

const app = express();

// CORS 설정 (제일 먼저)
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));

// JSON 파싱
app.use(express.json());

// 정적 파일 제공
app.use("/uploads", express.static("uploads"));

// 루트 경로
app.get("/", (req, res) => {
  res.send("✅ Backend server is running!");
});

// 라우터 등록
app.use("/api/auth", authRoutes);
app.use("/api/inventories", inventoryRoutes);
app.use("/api/items", itemRoutes);
app.use("/api/receipts", receiptsRoutes);
app.use("/api", recipeRoutes);
app.use("/api/users", usersRouter);
app.use('/api', healthRouter);  // 건강 관리 API

// 전역 에러 핸들러
app.use((err, req, res, next) => {
  console.error('전역 에러:', err);
  res.status(500).json({ 
    error: '서버 에러가 발생했습니다',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`📧 인증 API: http://localhost:${PORT}/api/auth`);
  console.log(`💪 건강 API: http://localhost:${PORT}/api/health`);
});