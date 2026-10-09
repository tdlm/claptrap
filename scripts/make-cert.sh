#!/usr/bin/env bash
# Creates a self-signed code signing certificate ("Claptrap Dev") in your login keychain.
# Signing every build with the same certificate lets macOS keep Claptrap's Screen
# Recording / Accessibility grants across rebuilds. Safe to re-run: exits if it exists.
set -euo pipefail

NAME="${1:-Claptrap Dev}"
KEYCHAIN="$HOME/Library/Keychains/login.keychain-db"

if security find-identity -v -p codesigning | grep -q "\"$NAME\""; then
  echo "✓ Code signing identity \"$NAME\" already exists."
  exit 0
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

cat >"$work/cert.cnf" <<EOF
[req]
distinguished_name = dn
x509_extensions = ext
prompt = no
[dn]
CN = $NAME
[ext]
basicConstraints = critical, CA:false
keyUsage = critical, digitalSignature
extendedKeyUsage = critical, codeSigning
EOF

openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
  -config "$work/cert.cnf" -keyout "$work/key.pem" -out "$work/cert.pem" 2>/dev/null
# The .p12 password only protects this temp file, which is deleted on exit.
# OpenSSL 3 defaults to AES/PBKDF2 with a SHA-256 MAC, which `security import` can't
# read ("MAC verification failed"), so force the legacy 3DES/SHA-1 format.
openssl pkcs12 -export -inkey "$work/key.pem" -in "$work/cert.pem" \
  -name "$NAME" -out "$work/cert.p12" -passout pass:claptrap \
  -keypbe PBE-SHA1-3DES -certpbe PBE-SHA1-3DES -macalg sha1

security import "$work/cert.p12" -k "$KEYCHAIN" -P claptrap -T /usr/bin/codesign
echo "macOS will ask for your login password to trust the certificate for code signing…"
security add-trusted-cert -r trustRoot -p codeSign -k "$KEYCHAIN" "$work/cert.pem"

if security find-identity -v -p codesigning | grep -q "\"$NAME\""; then
  echo "✓ Created code signing identity \"$NAME\"."
else
  echo "✗ The certificate was imported but isn't valid for code signing. Check Keychain Access." >&2
  exit 1
fi
