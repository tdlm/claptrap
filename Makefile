# Claptrap — common tasks. Run `make` to list them.

APP_NAME  := Claptrap
BUNDLE_ID := com.scottweaver.claptrap
IDENTITY  := Claptrap Dev
DIST_DIR  := dist/$(if $(filter arm64,$(shell uname -m)),mac-arm64,mac)
BUILT_APP := $(DIST_DIR)/$(APP_NAME).app
INSTALLED := /Applications/$(APP_NAME).app

# Sign with the stable "Claptrap Dev" certificate when it exists, otherwise ad-hoc.
HAS_CERT := $(shell security find-identity -v -p codesigning 2>/dev/null | grep -c '"$(IDENTITY)"')

.DEFAULT_GOAL := help
.PHONY: help setup dev typecheck build icons dist sign install open quit app cert reset-permissions status clean

help: ## List the available commands
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z_-]+:.*## / {printf "  \033[33mmake %-18s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# ---- development --------------------------------------------------------------

setup: ## Install npm packages and the Electron binary
	npm install
	@test -d node_modules/electron/dist || node node_modules/electron/install.js

dev: ## Run with hot reload (permissions go to your terminal, not Claptrap)
	npm run dev

typecheck: ## Type-check main, preload and renderer
	npm run typecheck

build: ## Bundle the app code into out/
	npm run build

icons: ## Regenerate the tray icons and app icon
	npm run icons

# ---- packaging -------------------------------------------------------------------

dist: ## Package Claptrap.app into dist/ and sign it
	npm run dist
	@$(MAKE) --no-print-directory sign

sign: ## Re-sign the built app (stable certificate if present, else ad-hoc)
ifeq ($(HAS_CERT),0)
	@echo "⚠ No \"$(IDENTITY)\" certificate: using an ad-hoc signature."
	@echo "  macOS will forget Claptrap's permissions after each rebuild. Run 'make cert' to fix that."
else
	codesign --force --deep --sign "$(IDENTITY)" "$(BUILT_APP)"
	@echo "✓ Signed with \"$(IDENTITY)\"."
endif

quit: ## Quit the running app gracefully (sends any queued screenshots first)
	@if pgrep -xq "$(APP_NAME)"; then \
		osascript -e 'quit app "$(APP_NAME)"' >/dev/null 2>&1 || true; \
		for i in $$(seq 1 30); do pgrep -xq "$(APP_NAME)" || break; sleep 0.5; done; \
		pgrep -xq "$(APP_NAME)" && { echo "Force-quitting $(APP_NAME)…"; pkill -x "$(APP_NAME)"; } || true; \
		echo "✓ Quit $(APP_NAME)."; \
	fi

install: quit ## Move the built app into /Applications (replacing the old copy)
	@test -d "$(BUILT_APP)" || { echo "✗ $(BUILT_APP) not found. Run 'make dist' first."; exit 1; }
	rm -rf "$(INSTALLED)"
	mv "$(BUILT_APP)" "$(INSTALLED)"
	@echo "✓ Installed $(INSTALLED)."
ifeq ($(HAS_CERT),0)
	@echo "⚠ Ad-hoc signed: run 'make reset-permissions', then grant access again."
endif

open: ## Launch the installed app
	open "$(INSTALLED)"

app: dist install open ## Build, sign, install to /Applications, and launch

# ---- permissions ------------------------------------------------------------------

cert: ## One-time: create a self-signed "Claptrap Dev" code signing certificate
	@bash scripts/make-cert.sh "$(IDENTITY)"
	@echo "Next: 'make app', then 'make reset-permissions' once and grant access again."

reset-permissions: quit ## Clear Claptrap's Screen Recording + Accessibility grants
	tccutil reset ScreenCapture $(BUNDLE_ID)
	tccutil reset Accessibility $(BUNDLE_ID)
	@echo "✓ Reset. Open Claptrap ('make open') and grant access in its permissions window."

status: ## Show the signature of the installed app and whether it's running
	@test -d "$(INSTALLED)" && codesign -dv "$(INSTALLED)" 2>&1 | grep -E "^(Identifier|Signature|Authority)" || echo "Not installed."
	@pgrep -xq "$(APP_NAME)" && echo "Running." || echo "Not running."

clean: ## Remove build output (out/ and dist/)
	rm -rf out dist
