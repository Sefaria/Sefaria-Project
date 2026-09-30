package registry

import (
	"context"
	"crypto/rand"
	"database/sql"
	"strings"
)

const KeyPrefix = "sfr_"

const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

func NewKey() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	for i := range b {
		b[i] = alphabet[int(b[i])%len(alphabet)]
	}
	return KeyPrefix + string(b)
}

const loadSQL = `
SELECT k.id::text, k.key, k.project_id, k.label, p.tier, array_to_string(p.allowed_origins, ','), (k.revoked_at IS NOT NULL)
FROM api_keys k JOIN projects p ON p.id = k.project_id`

func LoadAll(ctx context.Context, db *sql.DB) ([]Key, error) {
	rows, err := db.QueryContext(ctx, loadSQL)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Key
	for rows.Next() {
		var k Key
		var origins string
		if err := rows.Scan(&k.ID, &k.Key, &k.ProjectID, &k.Label, &k.Tier, &origins, &k.Revoked); err != nil {
			return nil, err
		}
		k.AllowedOrigins = []string{}
		if origins != "" {
			k.AllowedOrigins = strings.Split(origins, ",")
		}
		out = append(out, k)
	}
	return out, rows.Err()
}
