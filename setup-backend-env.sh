#!/bin/bash

# Backend Environment Variables Setup Script
# Generated from Vly for Git Sync
# Run this script to set up your Convex backend environment variables

echo 'Setting up Convex backend environment variables...'

# Check if Convex CLI is installed
if ! command -v npx &> /dev/null; then
    echo 'Error: npx is not installed. Please install Node.js and npm first.'
    exit 1
fi

echo "Setting JWKS..."
bunx convex env set "JWKS" -- "{\"keys\":[{\"kty\":\"RSA\",\"n\":\"kMurqvGyZnl9IxGTgvV8YN0V3HxQFHrTixxX4c2kDbZQ6KsqAbXz4tSxuMuxW2OQYwMIOegWvH204tQAO5dNFpW-kbSbu2ld4VboBJ0xH2vLd3l-zn_YZIVB3eUJzXKvCE0cN3i4f8mNb2Sv8ldqfm4vYNHdWH7mgxmUa5WdFthzUPfJjHbeDPL9MuGz0cb3jXh6xd07dJE-8CGz25mfSSEmU3y1BKtVtPemLmq1_XCWH6hKo3SbwnGP1gG5IbJjQK_ifm-iSt38seStQ0f26bPkqG8OGMBxuk3-llb5-f8WziL449Hu1wPJMbXKMeFC-wMdZD2zpColS9_Cd804dw\",\"e\":\"AQAB\",\"use\":\"sig\"}]}"

echo "Setting JWT_PRIVATE_KEY..."
bunx convex env set "JWT_PRIVATE_KEY" -- "-----BEGIN PRIVATE KEY----- MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCQy6uq8bJmeX0j EZOC9Xxg3RXcfFAUetOLHFfhzaQNtlDoqyoBtfPi1LG4y7FbY5BjAwg56Ba8fbTi 1AA7l00Wlb6RtJu7aV3hVugEnTEfa8t3eX7Of9hkhUHd5QnNcq8ITRw3eLh/yY1v ZK/yV2p+bi9g0d1YfuaDGZRrlZ0W2HNQ98mMdt4M8v0y4bPRxveNeHrF3Tt0kT7w IbPbmZ9JISZTfLUEq1W096YuarX9cJYfqEqjdJvCcY/WAbkhsmNAr+J+b6JK3fyx 5K1DR/bps+Sobw4YwHG6Tf6WVvn5/xbOIvjj0e7XA8kxtcox4UL7Ax1kPbOkKiVL 38J3zTh3AgMBAAECggEABvLPLSfmIMbJu4oXYxx2uItDhk4s5Z6zUiStDvf4XHQY U+IK5QQfTQ5Z7P1RaIpRnn7BwU2i8a6ypIP58uIi3+eVupZJNugqiirKfZYxikl4 /SXGcRBviPtgGs7n9oT/Y02YAg14BSHd+K+DRgTt5l1RRrsrfRix5S6wEa2fWT49 ZbHmpsLBcdZQ+YY8LFmTDhyTuwnVo00Vx/4ptPsmeu2vv9hYOUe2/D0hncRBZsJB X9KlRYADD0ZYpYSWfptUS8An11SHHRlDI5LTaJDr6yKJqq9gSDCNUw1fUvPTqwWu +cO8pelDnl468X8dXtip+8QdXQSTbFdSjLF62T75qQKBgQDGiFVqAlCUNzmUCv/a Eun3/UfbTAcGXLzH+IIK0Y4Mu7EQ3BgNHsUyQmrztuMjDJGqL+4sR3GSfxm+v131 kCoRuVSnUnMeIRX/C3QAyjLIrxKuPvuG+SQZt6j6CY9Sz2AgilQyzbMaLFbmikIj GjtI83KBUOP99rWijZhel6UtZQKBgQC6tVGECLEjcpmEhNKnT9sDAe8w4sum4L7O TVdnA0z60XlO5A2ieY/VeJBKXae2gtjjI5Ob8kBdkbKAbttwm2Vn/QXLnZbk5UtE pLvOd0PdO3zsukbsgCna2c6VAbzwcBtr2Zr4a28MDEj7v0wFrmWFwbdtLc9gdaLV 7ovNePTuqwKBgGM4JX/ackzwoJ0FNkLVawreEThe8a/TTyGdZ9hiTFy+vMpRRM/h zenFWdA9WZzdnjrww1Zryi3NyZ8T4rBkATJkbhNFWHT5UhXpsmrmoqS7Ilnk7i3R e6JCsHdtqaxYKZF5sITHWrg86p1DAbSrWm+mA1bvh1IYJ0R7AWhc31clAoGABpnU ePOJt7Qcg1fizrF/D7soxrSt+Idnl4madnTiatevDz/2z3C2yhhKGab3//beTiF6 3X+SEPzOr8W7kl6cFjIW210F8a+9mn6seR80UgUBZKktSr05PZiHujLmiCWegpCd 7vx1X5qrleLsgCLrSfBQWNbOxx1BlYiqfqgxGKMCgYEAsbqe8I0GbWgeDj5V5qjH Fn6QyCJXozONdETb/YDCTNnRpGi5hZbcIbP/0VCk37SC0XwQY8HSLnKfLnT6fXvp OZAzzIzjBNMYrocSdsaoyabjTXI0SLK6wDy6L67KbDMMNexURlBYf3N3zj/a2Umm 39MWTIYgsu4mgiLHunQIQNs= -----END PRIVATE KEY-----"

echo "Setting SITE_URL..."
bunx convex env set "SITE_URL" -- "https://acrobatic-marmot-176.convex.site"

echo "Setting VLY_APP_NAME..."
bunx convex env set "VLY_APP_NAME" -- "Notebook PDF Studio"

echo "Setting VLY_CONVEX_AUTH_ISSUER..."
bunx convex env set "VLY_CONVEX_AUTH_ISSUER" -- "https://freebuff.com"

echo "Setting VLY_INTEGRATION_BASE_URL..."
bunx convex env set "VLY_INTEGRATION_BASE_URL" -- "https://integrations.vly.ai/"

echo "Setting VLY_INTEGRATION_KEY..."
bunx convex env set "VLY_INTEGRATION_KEY" -- "sk_9300f494f6422de0cd61ea3dfcd788891f687208d67fb891ea96161c6889d179"

echo "✅ All backend environment variables have been set!"
echo "You can now run: pnpm dev:backend"
