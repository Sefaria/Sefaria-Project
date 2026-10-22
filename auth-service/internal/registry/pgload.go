package registry

import (
	"context"
	"database/sql"
	"encoding/json"
	"log/slog"
)

// Keys of a soft-deleted project stay in the load, marked revoked: dropping them would leave the old
// keys valid whenever the load came back empty (the empty-reload guard rejects it).
const loadSQL = `
SELECT k.id::text, k.key, p.id::text, k.label, p.tier, k.allowed_origins::text, (k.revoked_at IS NOT NULL OR p.deleted_at IS NOT NULL)
FROM powered_by_apikey k JOIN powered_by_project p ON p.id = k.project_id`

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
		if err := json.Unmarshal([]byte(origins), &k.AllowedOrigins); err != nil {
			// One bad row must not fail the whole load. The key stays unknown, so it is denied (fails closed).
			slog.Warn("registry: skipping key with malformed allowed_origins", "key_id", k.ID, "err", err)
			continue
		}
		if k.AllowedOrigins == nil {
			k.AllowedOrigins = []string{}
		}
		out = append(out, k)
	}
	return out, rows.Err()
}
