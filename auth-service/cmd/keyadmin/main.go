// keyadmin is a development tool that writes the key registry the way Django does: rows in powered_by_project and
// powered_by_apikey. The registry's triggers NOTIFY on commit, so there is no push step. Production keys and
// projects are created in Django; this tool is for cauldrons, drills and load tests.
package main

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"math/big"
	"os"
	"strconv"
	"strings"

	_ "github.com/jackc/pgx/v5/stdlib"
)

const (
	keyPrefix   = "sfr_"
	keyAlphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	keyLength   = 32
)

// newKey mirrors powered_by.models.new_key_value.
func newKey() string {
	b := make([]byte, keyLength)
	for i := range b {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(keyAlphabet))))
		if err != nil {
			panic(err)
		}
		b[i] = keyAlphabet[n.Int64()]
	}
	return keyPrefix + string(b)
}

// safePrefix is the only form of a key this CLI prints back: stderr of an in-cluster pod lands in cluster logs.
func safePrefix(key string) string {
	if len(key) <= 12 {
		return key
	}
	return key[:12]
}

func originsJSON(csv string) string {
	list := []string{}
	if csv != "" {
		list = strings.Split(csv, ",")
	}
	b, _ := json.Marshal(list)
	return string(b)
}

// projectID resolves --project, a numeric powered_by_project id or an exact project_name.
func projectID(ctx context.Context, db *sql.DB, ref string) (int, error) {
	var id int
	if n, err := strconv.Atoi(ref); err == nil {
		err = db.QueryRowContext(ctx, `SELECT id FROM powered_by_project WHERE id = $1`, n).Scan(&id)
		return id, err
	}
	err := db.QueryRowContext(ctx, `SELECT id FROM powered_by_project WHERE project_name = $1 ORDER BY id LIMIT 1`, ref).Scan(&id)
	return id, err
}

func main() {
	dsn := flag.String("dsn", os.Getenv("PG_DSN"), "postgres DSN of a role that can write the registry tables")
	flag.Parse()
	args := flag.Args()
	if len(args) == 0 {
		fmt.Fprintln(os.Stderr, "usage: keyadmin [--dsn] create|revoke|set-tier|set-origins|seed ...")
		os.Exit(2)
	}
	ctx := context.Background()
	db, err := sql.Open("pgx", *dsn)
	if err != nil {
		panic(err)
	}
	defer db.Close()

	sub := flag.NewFlagSet(args[0], flag.ExitOnError)
	project := sub.String("project", "", "project id, or project name (create makes a project of that name when none matches)")
	tier := sub.String("tier", "developer", "tier")
	label := sub.String("label", "Default key", "key label")
	origins := sub.String("origins", "", "comma list of allowed origins of the key (empty allows any)")
	key := sub.String("key", "", "explicit key value (create) or the target key (revoke, set-origins)")
	count := sub.Int("count", 0, "number of keys for seed")
	_ = sub.Parse(args[1:])

	fail := func(err error) {
		if err != nil {
			fmt.Fprintln(os.Stderr, "error:", err)
			os.Exit(1)
		}
	}
	switch args[0] {
	case "create":
		k := *key
		if k == "" {
			k = newKey()
		}
		id, err := projectID(ctx, db, *project)
		if errors.Is(err, sql.ErrNoRows) {
			// Django owns project rows: the real table has required columns only Django fills.
			err = fmt.Errorf("project %q not found; create it in Django (admin or the developer settings page) first", *project)
		}
		fail(err)
		_, err = db.ExecContext(ctx, `INSERT INTO powered_by_apikey(id, key, project_id, label, allowed_origins, created_at) VALUES (gen_random_uuid(), $1, $2, $3, $4::jsonb, now())`,
			k, id, *label, originsJSON(*origins))
		fail(err)
		fmt.Fprintln(os.Stderr, "created key", safePrefix(k), "on project", id)
		fmt.Println(id, k)
	case "revoke":
		res, err := db.ExecContext(ctx, `UPDATE powered_by_apikey SET revoked_at = now() WHERE key = $1 AND revoked_at IS NULL`, *key)
		fail(err)
		n, _ := res.RowsAffected()
		fmt.Println("revoked", n)
	case "set-tier":
		id, err := projectID(ctx, db, *project)
		fail(err)
		_, err = db.ExecContext(ctx, `UPDATE powered_by_project SET tier = $2 WHERE id = $1`, id, *tier)
		fail(err)
		fmt.Println("tier set")
	case "set-origins":
		_, err := db.ExecContext(ctx, `UPDATE powered_by_apikey SET allowed_origins = $2::jsonb WHERE key = $1`, *key, originsJSON(*origins))
		fail(err)
		fmt.Println("origins set")
	case "seed":
		id, err := projectID(ctx, db, *project)
		if errors.Is(err, sql.ErrNoRows) {
			// Django owns project rows: the real table has required columns only Django fills.
			err = fmt.Errorf("project %q not found; create it in Django (admin or the developer settings page) first", *project)
		}
		fail(err)
		tx, err := db.BeginTx(ctx, nil)
		fail(err)
		for i := 0; i < *count; i++ {
			_, err = tx.ExecContext(ctx, `INSERT INTO powered_by_apikey(id, key, project_id, label, created_at) VALUES (gen_random_uuid(), $1, $2, $3, now())`, newKey(), id, *label)
			fail(err)
		}
		fail(tx.Commit())
		fmt.Printf("seeded %d keys on project %d (wait for the NOTIFY reload)\n", *count, id)
	default:
		fail(fmt.Errorf("unknown subcommand %q", args[0]))
	}
}
