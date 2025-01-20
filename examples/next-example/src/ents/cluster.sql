CREATE TABLE users(
  id bigserial PRIMARY KEY,
  email varchar(256) NOT NULL UNIQUE,
  is_admin boolean NOT NULL DEFAULT FALSE
);

CREATE TABLE topics(
  id bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  slug varchar(64) NOT NULL UNIQUE,
  creator_id bigint NOT NULL,
  subject text DEFAULT NULL
);

CREATE TABLE comments(
  id bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL,
  topic_id bigint REFERENCES topics,
  creator_id bigint NOT NULL,
  message text NOT NULL
);

CREATE TABLE organizations(
  id bigserial PRIMARY KEY,
  name text NOT NULL UNIQUE
);

CREATE TABLE organization_users(
  id bigserial PRIMARY KEY,
  organization_id bigint REFERENCES organizations,
  user_id bigint REFERENCES users,
  UNIQUE (organization_id, user_id)
);

