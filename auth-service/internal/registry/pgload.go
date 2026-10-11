package registry

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
)

const loadSQL = `
SELECT k.id::text, k.key, p.id::text, k.label, p.tier, k.allowed_origins::text, (k.revoked_at IS NOT NULL)
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
			return nil, fmt.Errorf("key %s: allowed_origins is not an array of strings: %w", k.ID, err)
		}
		if k.AllowedOrigins == nil {
			k.AllowedOrigins = []string{}
		}
		out = append(out, k)
	}
	return out, rows.Err()
}
