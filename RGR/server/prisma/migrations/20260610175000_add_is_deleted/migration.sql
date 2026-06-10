-- Add isDeleted column to User table
ALTER TABLE "User" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;

-- Add isDeleted column to Door table
ALTER TABLE "Door" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;
