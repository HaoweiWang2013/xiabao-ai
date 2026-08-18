-- 0011: 补 conversations.auto_renamed 列
-- 根因：0010 中该列的 ALTER 与 favorite 的 ALTER 之间漏了 statement-breakpoint 分隔符，
-- libsql batch 只执行了前一条，auto_renamed 被静默丢弃（所有存量库均缺失此列）。
-- 0010 已被记录为已应用，不可修改，只能新增 0011 补列。
-- 注意：本文件末尾不能有多余的 statement-breakpoint（会产生空语句导致 batch 报错）。
ALTER TABLE `conversations` ADD `auto_renamed` integer NOT NULL DEFAULT 0;
