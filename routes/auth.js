import express from 'express';
import bcrypt from 'bcrypt';
import { db as pool } from '../db.js';

const router = express.Router();

// ========================================
// 1. 회원가입 (이메일 인증 제거)
// ========================================
router.post('/register', async (req, res) => {
  const { login_id, password, username } = req.body;

  if (!login_id || !password || !username) {
    return res.status(400).json({ error: '모든 항목을 입력하세요' });
  }

  if (login_id.length < 4) {
    return res.status(400).json({ error: '아이디는 4자 이상이어야 합니다' });
  }

  if (password.length < 4) {
    return res.status(400).json({ error: '비밀번호는 4자 이상이어야 합니다' });
  }

  try {
    // 아이디 중복 확인
    const [existing] = await pool.query(
      'SELECT * FROM users WHERE login_id = ?',
      [login_id]
    );

    if (existing.length > 0) {
      return res.status(400).json({ error: '이미 사용 중인 아이디입니다' });
    }

    // 비밀번호 해싱
    const hashedPassword = await bcrypt.hash(password, 10);

    // 회원가입
    const [result] = await pool.query(
      'INSERT INTO users (login_id, password, username) VALUES (?, ?, ?)',
      [login_id, hashedPassword, username]
    );

    res.json({ 
      message: '회원가입이 완료되었습니다',
      user_id: result.insertId
    });
  } catch (error) {
    console.error('회원가입 오류:', error);
    res.status(500).json({ error: '서버 오류' });
  }
});

// ========================================
// 2. 로그인
// ========================================
router.post('/login', async (req, res) => {
  const { login_id, password } = req.body;

  if (!login_id || !password) {
    return res.status(400).json({ error: '아이디와 비밀번호를 입력하세요' });
  }

  try {
    // 유저 조회
    const [users] = await pool.query(
      'SELECT * FROM users WHERE login_id = ?',
      [login_id]
    );

    if (users.length === 0) {
      return res.status(400).json({ error: '아이디 또는 비밀번호가 잘못되었습니다' });
    }

    const user = users[0];

    // 비밀번호 확인
    const isValid = await bcrypt.compare(password, user.password);

    if (!isValid) {
      return res.status(400).json({ error: '아이디 또는 비밀번호가 잘못되었습니다' });
    }

    // 로그인 성공 - 유저 정보 반환
    res.json({
      user_id: user.user_id,
      login_id: user.login_id,
      username: user.username
    });
  } catch (error) {
    console.error('로그인 오류:', error);
    res.status(500).json({ error: '서버 오류' });
  }
});

// ========================================
// 3. 본인 확인 (아이디 + 닉네임)
// ========================================
router.post('/verify-user', async (req, res) => {
  const { login_id, username } = req.body;

  if (!login_id || !username) {
    return res.status(400).json({ error: '아이디와 닉네임을 입력하세요' });
  }

  try {
    // 사용자 확인
    const [users] = await pool.query(
      'SELECT user_id FROM users WHERE login_id = ? AND username = ?',
      [login_id, username]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: '일치하는 사용자 정보가 없습니다' });
    }

    res.json({
      success: true,
      message: '본인 확인 완료'
    });
  } catch (error) {
    console.error('본인 확인 오류:', error);
    res.status(500).json({ error: '서버 오류' });
  }
});

// ========================================
// 4. 비밀번호 재설정 (간단 버전)
// ========================================
router.post('/reset-password-simple', async (req, res) => {
  const { login_id, username, newPassword } = req.body;

  if (!login_id || !username || !newPassword) {
    return res.status(400).json({ error: '모든 항목을 입력하세요' });
  }

  if (newPassword.length < 4) {
    return res.status(400).json({ error: '비밀번호는 4자 이상이어야 합니다' });
  }

  try {
    // 사용자 확인
    const [users] = await pool.query(
      'SELECT user_id FROM users WHERE login_id = ? AND username = ?',
      [login_id, username]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: '일치하는 사용자 정보가 없습니다' });
    }

    // 비밀번호 해싱
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // 비밀번호 업데이트
    await pool.query(
      'UPDATE users SET password = ? WHERE login_id = ? AND username = ?',
      [hashedPassword, login_id, username]
    );

    res.json({
      success: true,
      message: '비밀번호가 변경되었습니다'
    });
  } catch (error) {
    console.error('비밀번호 재설정 오류:', error);
    res.status(500).json({ error: '서버 오류' });
  }
});

// ========================================
// 5. 로그아웃
// ========================================
router.post('/logout', async (req, res) => {
  try {
    // 클라이언트에서 localStorage 삭제로 처리
    res.json({ message: '로그아웃되었습니다' });
  } catch (error) {
    console.error('로그아웃 오류:', error);
    res.status(500).json({ error: '서버 오류' });
  }
});

export default router;