package registry

import (
	"context"
	"database/sql"
	"encoding/json"
	"log/slog"
)

// Keys of a soft-deleted API project stay in the load, marked revoked: dropping them would leave the old
// keys valid whenever the load came back empty (the empty-reload guard rejects it). The legacy
// powered_by_project.tier column is not read: the tier of a key is the tier of its API project.
const loadKeysSQL = `
SELECT k.id::text, k.key, p.id::text, k.label, t.id, t.per_minute_per_project, k.allowed_origins::text,
       (k.revoked_at IS NOT NULL OR p.deleted_at IS NOT NULL)
FROM powered_by_apikey k
JOIN api_project p ON p.id = k.project_id
JOIN api_tier t ON t.id = p.tier_id`

const loadTierLimitsSQL = `
SELECT tier_id, meter, monthly_per_project FROM api_tier_meter_limit`

// LoadAll reads the keys and their tier limits in one read-only, repeatable-read transaction, so both come from
// the same snapshot.
func LoadAll(ctx context.Context, db *sql.DB) ([]Key, error) {
	tx, err := db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true, Isolation: sql.LevelRepeatableRead})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	keys, err := loadKeys(ctx, tx)
	if err != nil {
		return nil, err
	}
	limits, err := loadTierLimits(ctx, tx)
	if err != nil {
		return nil, err
	}
	for i := range keys {
		keys[i].MonthlyLimits = limits[keys[i].Tier]
	}
	return keys, tx.Commit()
}

func loadKeys(ctx context.Context, tx *sql.Tx) ([]Key, error) {
	rows, err := tx.QueryContext(ctx, loadKeysSQL)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Key
	for rows.Next() {
		var k Key
		var origins string
		if err := rows.Scan(&k.ID, &k.Key, &k.ProjectID, &k.Label, &k.Tier, &k.PerMinute, &origins, &k.Revoked); err != nil {
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

// loadTierLimits returns tier id -> meter -> monthly limit. A tier with no rows has no entry.
func loadTierLimits(ctx context.Context, tx *sql.Tx) (map[string]map[string]int64, error) {
	rows, err := tx.QueryContext(ctx, loadTierLimitsSQL)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]map[string]int64{}
	for rows.Next() {
		var tier, meter string
		var monthly int64
		if err := rows.Scan(&tier, &meter, &monthly); err != nil {
			return nil, err
		}
		if out[tier] == nil {
			out[tier] = map[string]int64{}
		}
		out[tier][meter] = monthly
	}
	return out, rows.Err()
}
