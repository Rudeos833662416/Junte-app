CREATE TABLE `checkins` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`venueId` int NOT NULL,
	`status` enum('active','ended') NOT NULL DEFAULT 'active',
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp,
	CONSTRAINT `checkins_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `friendships` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`friendId` int NOT NULL,
	`status` enum('pending','accepted','blocked') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `friendships_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`mediaUrl` text NOT NULL,
	`mediaType` enum('image','video') NOT NULL DEFAULT 'image',
	`audioUrl` text,
	`audioName` varchar(255),
	`caption` varchar(500),
	`visibility` enum('friends','public') NOT NULL DEFAULT 'friends',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp NOT NULL,
	CONSTRAINT `stories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `venues` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`address` text,
	`city` varchar(128),
	`latitude` varchar(32),
	`longitude` varchar(32),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `venues_id` PRIMARY KEY(`id`)
);
