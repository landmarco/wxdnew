-- Schema + least-privilege user for the website feedback feature.
-- Run once on the API server's MySQL as an admin user. The app connects with the
-- dedicated wxdu_feedback user, which is granted INSERT only on this one table.
-- Set the matching FEEDBACK_DB_* values in api/.env (see api/.env.example).

CREATE DATABASE IF NOT EXISTS feedback;

CREATE TABLE feedback.feedback (
  feedback_id INT PRIMARY KEY AUTO_INCREMENT,
  text        VARCHAR(2000) NOT NULL,
  -- Curated, non-sensitive browser/session diagnostics (user agent, viewport,
  -- timezone, current player state, etc.) to help reproduce the report. Nullable:
  -- a report is always stored even if diagnostics are absent. Never holds
  -- cookies/localStorage or other secrets.
  client_info JSON DEFAULT NULL,
  created_at  DATETIME NOT NULL
);

-- Replace <strong_password> with a real secret (and use the same value in api/.env).
CREATE USER 'wxdu_feedback'@'localhost' IDENTIFIED BY '<strong_password>';
GRANT INSERT ON feedback.feedback TO 'wxdu_feedback'@'localhost';  -- least privilege: INSERT only
FLUSH PRIVILEGES;
