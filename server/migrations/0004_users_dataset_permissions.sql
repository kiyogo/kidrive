-- Add dataset_permissions to users table for granular dataset access
ALTER TABLE users ADD COLUMN dataset_permissions TEXT DEFAULT '{}';
