CREATE TABLE `shared_grades` (
	`code` text(5) PRIMARY KEY NOT NULL,
	`fingerprint` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shared_grades_fingerprint_unique` ON `shared_grades` (`fingerprint`);