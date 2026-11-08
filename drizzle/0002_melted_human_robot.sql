CREATE TABLE `attachment_versions` (
	`file_id` text NOT NULL,
	`revision` integer NOT NULL,
	`data_key` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`size` integer NOT NULL,
	`created_by` text NOT NULL,
	`created` text NOT NULL,
	PRIMARY KEY(`file_id`, `revision`)
);
--> statement-breakpoint
ALTER TABLE `attachments` ADD `revision` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `attachments` ADD `data_key` text;--> statement-breakpoint
ALTER TABLE `attachments` ADD `updated` text;