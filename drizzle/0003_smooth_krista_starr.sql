CREATE TABLE IF NOT EXISTS `member_permissions` (
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`json` text NOT NULL,
	PRIMARY KEY(`workspace_id`, `user_id`)
);
