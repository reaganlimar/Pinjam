/**
 * Database schema, applied as ordered migrations.
 * `PRAGMA user_version` records how many migrations have run, so each one runs once.
 */
export const migrations: string[] = [
  /* 1 — initial schema */ `
  CREATE TABLE users (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    email                 TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash         TEXT NOT NULL,
    full_name             TEXT NOT NULL CHECK (length(full_name) BETWEEN 2 AND 80),
    nim                   TEXT NOT NULL UNIQUE CHECK (length(nim) BETWEEN 5 AND 20),
    major                 TEXT,
    phone                 TEXT,
    avatar_key            TEXT,
    student_id_card_key   TEXT,
    -- Verification is not automated yet: these stay NULL until a verifier sets them.
    email_verified_at     TEXT,
    student_verified_at   TEXT,
    rules_accepted_at     TEXT,
    notify_reminders      INTEGER NOT NULL DEFAULT 1 CHECK (notify_reminders IN (0, 1)),
    theme                 TEXT NOT NULL DEFAULT 'light' CHECK (theme IN ('light', 'dark')),
    created_at            TEXT NOT NULL,
    updated_at            TEXT NOT NULL
  );

  CREATE TABLE sessions (
    id          TEXT PRIMARY KEY,               -- SHA-256 of the cookie token
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at  TEXT NOT NULL,
    created_at  TEXT NOT NULL
  );
  CREATE INDEX sessions_user ON sessions(user_id);

  CREATE TABLE categories (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    slug  TEXT NOT NULL UNIQUE,
    name  TEXT NOT NULL UNIQUE,
    sort  INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE items (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id    INTEGER NOT NULL REFERENCES categories(id),
    name           TEXT NOT NULL CHECK (length(name) BETWEEN 2 AND 80),
    description    TEXT NOT NULL DEFAULT '',
    condition      TEXT NOT NULL CHECK (condition IN ('new', 'good', 'fair')),
    price_per_day  INTEGER NOT NULL DEFAULT 0 CHECK (price_per_day >= 0),
    max_days       INTEGER NOT NULL CHECK (max_days BETWEEN 1 AND 30),
    pickup_point   TEXT NOT NULL CHECK (length(pickup_point) BETWEEN 2 AND 60),
    is_available   INTEGER NOT NULL DEFAULT 1 CHECK (is_available IN (0, 1)),
    deleted_at     TEXT,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
  );
  CREATE INDEX items_owner ON items(owner_id);
  CREATE INDEX items_category ON items(category_id);

  CREATE TABLE item_images (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id   INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    file_key  TEXT NOT NULL,
    position  INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX item_images_item ON item_images(item_id);

  -- A loan is a borrowing request and, once approved, the transaction itself.
  CREATE TABLE loans (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id           INTEGER NOT NULL REFERENCES items(id),
    borrower_id       INTEGER NOT NULL REFERENCES users(id),
    lender_id         INTEGER NOT NULL REFERENCES users(id),
    start_date        TEXT NOT NULL,            -- YYYY-MM-DD pickup date
    end_date          TEXT NOT NULL,            -- YYYY-MM-DD return-by date
    days              INTEGER NOT NULL CHECK (days >= 1),
    price_per_day     INTEGER NOT NULL CHECK (price_per_day >= 0),
    fee_total         INTEGER NOT NULL CHECK (fee_total >= 0),
    payment_method    TEXT NOT NULL CHECK (payment_method IN ('none', 'cash', 'transfer')),
    fee_received_at   TEXT,
    note              TEXT,
    status            TEXT NOT NULL CHECK (status IN (
                        'pending', 'approved', 'rejected', 'ready_for_pickup',
                        'borrowed', 'return_pending', 'completed', 'cancelled')),
    return_condition  TEXT,
    reminder_sent_at  TEXT,
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL,
    approved_at       TEXT,
    picked_up_at      TEXT,
    returned_at       TEXT,
    completed_at      TEXT,
    CHECK (end_date >= start_date),
    CHECK (borrower_id <> lender_id)
  );
  CREATE INDEX loans_item_status ON loans(item_id, status);
  CREATE INDEX loans_borrower ON loans(borrower_id, status);
  CREATE INDEX loans_lender ON loans(lender_id, status);

  -- Audit trail of every status change.
  CREATE TABLE loan_events (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    loan_id      INTEGER NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
    actor_id     INTEGER REFERENCES users(id),
    from_status  TEXT,
    to_status    TEXT NOT NULL,
    note         TEXT,
    created_at   TEXT NOT NULL
  );
  CREATE INDEX loan_events_loan ON loan_events(loan_id);

  CREATE TABLE conversations (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id          INTEGER NOT NULL REFERENCES items(id),
    borrower_id      INTEGER NOT NULL REFERENCES users(id),
    lender_id        INTEGER NOT NULL REFERENCES users(id),
    created_at       TEXT NOT NULL,
    last_message_at  TEXT,
    UNIQUE (item_id, borrower_id),
    CHECK (borrower_id <> lender_id)
  );

  CREATE TABLE messages (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id  INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id        INTEGER NOT NULL REFERENCES users(id),
    body             TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 1000),
    created_at       TEXT NOT NULL,
    read_at          TEXT
  );
  CREATE INDEX messages_conversation ON messages(conversation_id, id);

  CREATE TABLE reviews (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    loan_id      INTEGER NOT NULL REFERENCES loans(id),
    reviewer_id  INTEGER NOT NULL REFERENCES users(id),
    reviewee_id  INTEGER NOT NULL REFERENCES users(id),
    rating       INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment      TEXT,
    created_at   TEXT NOT NULL,
    UNIQUE (loan_id, reviewer_id),
    CHECK (reviewer_id <> reviewee_id)
  );
  CREATE INDEX reviews_reviewee ON reviews(reviewee_id);

  CREATE TABLE notifications (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type        TEXT NOT NULL,
    title       TEXT NOT NULL,
    body        TEXT NOT NULL DEFAULT '',
    link        TEXT,
    read_at     TEXT,
    created_at  TEXT NOT NULL
  );
  CREATE INDEX notifications_user ON notifications(user_id, id);

  CREATE TABLE reports (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    reporter_id  INTEGER NOT NULL REFERENCES users(id),
    item_id      INTEGER NOT NULL REFERENCES items(id),
    reason       TEXT NOT NULL CHECK (reason IN (
                   'misleading', 'prohibited', 'not_owner', 'unsafe', 'spam', 'other')),
    details      TEXT,
    status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'dismissed')),
    created_at   TEXT NOT NULL,
    UNIQUE (reporter_id, item_id)
  );

  -- Reference data (not sample data): the categories students can file items under.
  INSERT INTO categories (slug, name, sort) VALUES
    ('supplies', 'Supplies', 1),
    ('electronics', 'Electronics', 2),
    ('cables-chargers', 'Cables & Chargers', 3),
    ('books-notes', 'Books & Notes', 4),
    ('tools', 'Tools', 5),
    ('other', 'Other', 6);
  `,
];
