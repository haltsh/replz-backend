-- Railway용 최소 버전 (게시글/댓글 제외)
-- CREATE DATABASE와 USE는 제거 (Railway는 이미 DB가 있음)

-- 유저 데이터 (이메일 인증 제거 버전)
CREATE TABLE users (
  user_id INT AUTO_INCREMENT PRIMARY KEY,
  login_id VARCHAR(50) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  username VARCHAR(50) NOT NULL,
  height FLOAT,
  weight FLOAT,
  gender ENUM('M', 'F'),
  age INT,
  target_weight FLOAT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 식자재 분류 데이터
CREATE TABLE items (
  item_id INT AUTO_INCREMENT PRIMARY KEY,
  item_name VARCHAR(100) NOT NULL,
  category VARCHAR(50) DEFAULT '기타',
  basic_expiration_days INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 실제 유저 냉장고 식자재 데이터
CREATE TABLE inventories (
  inventory_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  item_id INT NOT NULL,
  quantity INT DEFAULT 1,
  expiration_date DATE,
  purchased_date DATE DEFAULT (CURRENT_DATE),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(item_id) ON DELETE CASCADE
);

-- 영수증 이미지 데이터
CREATE TABLE receipts (
  receipt_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  image_url VARCHAR(255) NOT NULL,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- 이미지 처리 후 추출 데이터
CREATE TABLE receipt_items (
  receipt_item_id INT AUTO_INCREMENT PRIMARY KEY,
  receipt_id INT NOT NULL,
  item_name VARCHAR(100),
  quantity INT DEFAULT 1,
  FOREIGN KEY (receipt_id) REFERENCES receipts(receipt_id) ON DELETE CASCADE
);

-- 레시피 정보 데이터
CREATE TABLE recipes (
  recipe_id INT AUTO_INCREMENT PRIMARY KEY,
  menu VARCHAR(100) NOT NULL,
  description TEXT,
  image_url VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP   
);

-- 레시피 재료 데이터
CREATE TABLE recipe_items (
  recipe_item_id INT AUTO_INCREMENT PRIMARY KEY,
  recipe_id INT NOT NULL,
  item_id INT,
  ingredient_name VARCHAR(100),
  quantity INT DEFAULT 1,
  FOREIGN KEY (recipe_id) REFERENCES recipes(recipe_id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(item_id) ON DELETE SET NULL
);

-- 카테고리 마스터 테이블
CREATE TABLE food_categories (
  category_id INT AUTO_INCREMENT PRIMARY KEY,
  category_name VARCHAR(50) NOT NULL UNIQUE,
  category_type VARCHAR(20),
  description TEXT,
  display_order INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 먹은 음식 기록 테이블
CREATE TABLE consumed_foods (
  consumed_food_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  dish_name VARCHAR(100) NOT NULL,
  category1_id INT,
  category2_id INT,
  category3_id INT,
  consumed_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (category1_id) REFERENCES food_categories(category_id) ON DELETE SET NULL,
  FOREIGN KEY (category2_id) REFERENCES food_categories(category_id) ON DELETE SET NULL,
  FOREIGN KEY (category3_id) REFERENCES food_categories(category_id) ON DELETE SET NULL
);

-- 먹은 음식의 재료 및 영양정보 테이블
CREATE TABLE consumed_food_ingredients (
  ingredient_id INT AUTO_INCREMENT PRIMARY KEY,
  consumed_food_id INT NOT NULL,
  ingredient_name VARCHAR(100) NOT NULL,
  calories FLOAT,
  protein FLOAT,
  fat FLOAT,
  carbohydrate FLOAT,
  sugar FLOAT,
  FOREIGN KEY (consumed_food_id) REFERENCES consumed_foods(consumed_food_id) ON DELETE CASCADE
);

-- 일일 몸무게 기록 테이블 (최근 2주간)
CREATE TABLE daily_weight (
  weight_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  weight FLOAT NOT NULL,
  record_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_user_date (user_id, record_date),
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_user_date (user_id, record_date)
);

-- 일일 섭취 기록 테이블
CREATE TABLE daily_intake (
  intake_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  meal_name VARCHAR(100) NOT NULL,
  calories FLOAT DEFAULT 0,
  carbs FLOAT DEFAULT 0,
  protein FLOAT DEFAULT 0,
  fat FLOAT DEFAULT 0,
  category INT DEFAULT 0,
  intake_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_user_date (user_id, intake_date)
);

-- 14일 이상 된 몸무게 기록 자동 삭제 이벤트
CREATE EVENT IF NOT EXISTS delete_old_weight_records
ON SCHEDULE EVERY 1 DAY
DO
  DELETE FROM daily_weight 
  WHERE record_date < DATE_SUB(CURDATE(), INTERVAL 14 DAY);

-- 이벤트 스케줄러 활성화
SET GLOBAL event_scheduler = ON;

/*
Railway 배포용 (게시글/댓글 제외)
MySQL 8.0.43
Smart Replzerator - 스마트 냉장고 관리 시스템
*/