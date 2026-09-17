package jwtverify

import (
	"context"
	"fmt"
	"time"

	"github.com/MicahParks/keyfunc/v3"
	"github.com/golang-jwt/jwt/v5"
)

type Verifier struct {
	kf       keyfunc.Keyfunc
	issuer   string
	audience string
}

type Claims struct{ Sub, Tier string }

func New(ctx context.Context, jwksURL, issuer, audience string) (*Verifier, error) {
	kf, err := keyfunc.NewDefaultOverrideCtx(ctx, []string{jwksURL}, keyfunc.Override{RateLimitWaitMax: 2 * time.Second})
	if err != nil {
		return nil, err
	}
	return &Verifier{kf: kf, issuer: issuer, audience: audience}, nil
}

func (v *Verifier) Verify(token string) (Claims, error) {
	parsed, err := jwt.Parse(token, v.kf.Keyfunc,
		jwt.WithValidMethods([]string{"ES256", "RS256"}),
		jwt.WithIssuer(v.issuer), jwt.WithAudience(v.audience), jwt.WithExpirationRequired())
	if err != nil {
		return Claims{}, err
	}
	mc, ok := parsed.Claims.(jwt.MapClaims)
	if !ok {
		return Claims{}, fmt.Errorf("jwt: unexpected claims type")
	}
	sub, _ := mc["sub"].(string)
	tier, _ := mc["tier"].(string)
	return Claims{Sub: sub, Tier: tier}, nil
}
