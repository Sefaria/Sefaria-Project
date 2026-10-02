package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"

	"github.com/Sefaria/Sefaria-Project/auth-service/internal/registry"
)

var emit = func(ctx context.Context, ev registry.ChangeEvent) error {
	fmt.Fprintln(os.Stderr, "event:", redactedEvent(ev))
	return nil
}

// redactedEvent is the only form of a ChangeEvent this CLI prints: stderr of an in-cluster keyadmin
// pod lands in cluster logs, so the key is reduced to its prefix (RULE 6.6; security review, finding A).
func redactedEvent(ev registry.ChangeEvent) string {
	ev.Key.Key = safePrefix(ev.Key.Key)
	b, _ := json.Marshal(ev)
	return string(b)
}

func loadOne(ctx context.Context, db *sql.DB, key string) (registry.Key, error) {
	row := db.QueryRowContext(ctx, `SELECT k.id::text, k.key, k.project_id, k.label, p.tier, array_to_string(p.allowed_origins, ','), (k.revoked_at IS NOT NULL)
		FROM api_keys k JOIN projects p ON p.id=k.project_id WHERE k.key=$1`, key)
	var k registry.Key
	var origins string
	if err := row.Scan(&k.ID, &k.Key, &k.ProjectID, &k.Label, &k.Tier, &origins, &k.Revoked); err != nil {
		return k, err
	}
	k.AllowedOrigins = []string{}
	if origins != "" {
		k.AllowedOrigins = strings.Split(origins, ",")
	}
	return k, nil
}

func emitKey(ctx context.Context, db *sql.DB, key string) error {
	full, err := loadOne(ctx, db, key)
	if err != nil {
		return err
	}
	return emit(ctx, registry.ChangeEvent{Op: "upsert", Key: full, TS: time.Now()})
}

func emitProject(ctx context.Context, db *sql.DB, project string) error {
	rows, err := db.QueryContext(ctx, `SELECT key FROM api_keys WHERE project_id=$1`, project)
	if err != nil {
		return err
	}
	var keys []string
	for rows.Next() {
		var k string
		if err := rows.Scan(&k); err != nil {
			rows.Close()
			return err
		}
		keys = append(keys, k)
	}
	rows.Close()
	for _, k := range keys {
		if err := emitKey(ctx, db, k); err != nil {
			return err
		}
	}
	return nil
}

func main() {
	dsn := flag.String("dsn", os.Getenv("PG_DSN"), "postgres DSN")
	schemaPath := flag.String("schema", "internal/registry/schema.sql", "path to schema.sql (in the image: /schema.sql)")
	push := flag.String("push", os.Getenv("PUSH"), "comma list of push channels: redis,http (Task 4)")
	flag.Parse()
	args := flag.Args()
	if len(args) == 0 {
		fmt.Fprintln(os.Stderr, "usage: keyadmin [--dsn] [--schema] [--push redis,http] init-schema|create|revoke|rotate|set-tier|set-origins|seed ...")
		os.Exit(2)
	}
	ctx := context.Background()
	db, err := sql.Open("pgx", *dsn)
	if err != nil {
		panic(err)
	}
	defer db.Close()
	configurePush(*push)

	sub := flag.NewFlagSet(args[0], flag.ExitOnError)
	project := sub.String("project", "", "project id")
	tier := sub.String("tier", "developer", "tier")
	label := sub.String("label", "Default key", "key label")
	origins := sub.String("origins", "", "comma list of allowed origins")
	key := sub.String("key", "", "explicit key value (tests) or target key")
	count := sub.Int("count", 0, "number of keys for seed")
	_ = sub.Parse(args[1:])

	fail := func(err error) {
		if err != nil {
			fmt.Fprintln(os.Stderr, "error:", err)
			os.Exit(1)
		}
	}
	splitOrigins := func() []string {
		if *origins == "" {
			return []string{}
		}
		return strings.Split(*origins, ",")
	}
	switch args[0] {
	case "init-schema":
		schema, err := os.ReadFile(*schemaPath)
		fail(err)
		_, err = db.ExecContext(ctx, string(schema))
		fail(err)
		fmt.Println("schema ok")
	case "create":
		k := *key
		if k == "" {
			k = registry.NewKey()
		}
		_, err := db.ExecContext(ctx, `INSERT INTO projects(id,name,tier,allowed_origins) VALUES ($1,$1,$2,$3)
			ON CONFLICT (id) DO UPDATE SET tier=EXCLUDED.tier, allowed_origins=EXCLUDED.allowed_origins`, *project, *tier, splitOrigins())
		fail(err)
		_, err = db.ExecContext(ctx, `INSERT INTO api_keys(key,project_id,label) VALUES ($1,$2,$3)`, k, *project, *label)
		fail(err)
		full, err := loadOne(ctx, db, k)
		fail(err)
		fail(emit(ctx, registry.ChangeEvent{Op: "upsert", Key: full, TS: time.Now()}))
		fmt.Println(full.ID, k)
	case "revoke":
		_, err := db.ExecContext(ctx, `UPDATE api_keys SET revoked_at=now() WHERE key=$1 AND revoked_at IS NULL`, *key)
		fail(err)
		fail(emitKey(ctx, db, *key))
		fmt.Println("revoked")
	case "rotate":
		old, err := loadOne(ctx, db, *key)
		fail(err)
		nk := registry.NewKey()
		tx, err := db.BeginTx(ctx, nil)
		fail(err)
		_, err = tx.ExecContext(ctx, `UPDATE api_keys SET revoked_at=now() WHERE key=$1`, *key)
		fail(err)
		_, err = tx.ExecContext(ctx, `INSERT INTO api_keys(key,project_id,label) VALUES ($1,$2,$3)`, nk, old.ProjectID, old.Label)
		fail(err)
		fail(tx.Commit())
		fail(emitKey(ctx, db, *key))
		fail(emitKey(ctx, db, nk))
		fmt.Println(nk)
	case "set-tier":
		_, err := db.ExecContext(ctx, `UPDATE projects SET tier=$2 WHERE id=$1`, *project, *tier)
		fail(err)
		fail(emitProject(ctx, db, *project))
		fmt.Println("tier set")
	case "set-origins":
		_, err := db.ExecContext(ctx, `UPDATE projects SET allowed_origins=$2 WHERE id=$1`, *project, splitOrigins())
		fail(err)
		fail(emitProject(ctx, db, *project))
		fmt.Println("origins set")
	case "seed":
		_, err := db.ExecContext(ctx, `INSERT INTO projects(id,name,tier) VALUES ($1,$1,$2) ON CONFLICT DO NOTHING`, *project, *tier)
		fail(err)
		tx, err := db.BeginTx(ctx, nil)
		fail(err)
		for i := 0; i < *count; i++ {
			_, err = tx.ExecContext(ctx, `INSERT INTO api_keys(key,project_id) VALUES ($1,$2)`, registry.NewKey(), *project)
			fail(err)
		}
		fail(tx.Commit())
		fmt.Printf("seeded %d keys on %s (no push; wait for the full reload)\n", *count, *project)
	default:
		fail(fmt.Errorf("unknown subcommand %q", args[0]))
	}
}

func configurePush(spec string) {
	if spec == "" {
		return
	}
	var pubs []registry.Publisher
	for _, ch := range strings.Split(spec, ",") {
		switch ch {
		case "redis":
			pubs = append(pubs, registry.NewRedisPublisher(envOr("REDIS_ADDR", "localhost:6379"), os.Getenv("REDIS_PASSWORD"), envOr("PUSH_CHANNEL", "sefaria.apikeys")))
		case "http":
			pubs = append(pubs, registry.NewHTTPPublisher(strings.Split(envOr("HTTP_PUSH_URLS", "http://localhost:8080/internal/keys/apply"), ",")))
		}
	}
	pub := registry.NewMultiPublisher(pubs...)
	emit = func(ctx context.Context, ev registry.ChangeEvent) error {
		t0 := time.Now()
		err := pub.Publish(ctx, ev)
		fmt.Fprintf(os.Stderr, "push op=%s key=%s project=%s took=%s err=%v\n", ev.Op, safePrefix(ev.Key.Key), ev.Key.ProjectID, time.Since(t0), err)
		return err
	}
}

func envOr(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}

func safePrefix(key string) string {
	if len(key) <= 12 {
		return key
	}
	return key[:12]
}
