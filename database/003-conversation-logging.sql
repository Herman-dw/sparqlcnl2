-- ============================================================
-- Conversatie logging toevoegen aan competentnl_rag
-- ============================================================
-- Dit script kan worden gedraaid op een bestaande database om
-- chatberichten per sessie op te slaan.
-- Gebruik: mysql -u root -p < database/003-conversation-logging.sql
-- ============================================================

USE competentnl_rag;

CREATE TABLE IF NOT EXISTS conversation_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,

  session_id VARCHAR(100) NOT NULL,
  message_id VARCHAR(100) NOT NULL,
  role ENUM('user', 'assistant', 'system') NOT NULL,
  text_content TEXT NOT NULL,
  sparql TEXT,
  results_json JSON,
  status ENUM('pending', 'success', 'error') DEFAULT 'success',
  feedback ENUM('like', 'dislike', 'none') DEFAULT 'none',
  metadata_json JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY idx_session_message (session_id, message_id),
  INDEX idx_session_created (session_id, created_at)
) ENGINE=InnoDB;
