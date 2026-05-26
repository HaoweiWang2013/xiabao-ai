-- FTS5 全文搜索：基于 messages.body_plain 建立虚拟表
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  body_plain,
  content='messages',
  content_rowid='rowid'
);

-- INSERT 触发器：新消息自动加入索引
CREATE TRIGGER IF NOT EXISTS messages_fts_insert AFTER INSERT ON messages
BEGIN
  INSERT INTO messages_fts(rowid, body_plain)
  VALUES (NEW.rowid, NEW.body_plain);
END;

-- UPDATE 触发器：body_plain 变更时更新索引
CREATE TRIGGER IF NOT EXISTS messages_fts_update AFTER UPDATE ON messages
BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, body_plain)
  VALUES ('delete', OLD.rowid, OLD.body_plain);
  INSERT INTO messages_fts(rowid, body_plain)
  VALUES (NEW.rowid, NEW.body_plain);
END;

-- DELETE 触发器：删除消息时移除索引
CREATE TRIGGER IF NOT EXISTS messages_fts_delete AFTER DELETE ON messages
BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, body_plain)
  VALUES ('delete', OLD.rowid, OLD.body_plain);
END;

-- 初始化：将已有消息写入 FTS 索引
INSERT OR IGNORE INTO messages_fts(rowid, body_plain)
SELECT rowid, body_plain FROM messages
WHERE body_plain IS NOT NULL AND body_plain != '';
