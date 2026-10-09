# -----------------------------------------------------------------------------
# Variables
# -----------------------------------------------------------------------------
WASMPACK   := wasm-pack
CARGOWATCH := cargo-watch
CARGO      := cargo

WASM_DIR   := wasm
SERVER_DIR := server
SHARED_DIR := shared
STATIC_DIR := $(SERVER_DIR)/static/pkg

# -----------------------------------------------------------------------------
# Main Commands
# -----------------------------------------------------------------------------
.PHONY: all setup build-wasm run dev clean

# Default command: setups, builds everything, and runs
all: setup build-wasm

# Install required build tools if missing
setup:
	@command -v $(WASMPACK) >/dev/null 2>&1 || { echo "Installing wasm-pack..."; $(CARGO) install wasm-pack; }

# Build the WebAssembly library and output directly to the server's static directory
build-wasm:
	@echo "Building WebAssembly package..."
	@mkdir -p $(STATIC_DIR)
	$(WASMPACK) build $(WASM_DIR) --target web --out-dir ../$(STATIC_DIR)

# Run the native web server
run:
	@echo "Starting the web server..."
	cd $(SERVER_DIR) && $(CARGO) run

# Live Development Mode: Watches for code changes and auto-recompiles
# Requires `cargo install cargo-watch`
dev: setup
	@command -v $(CARGOWATCH) >/dev/null 2>&1 || { echo "Installing cargo-watch..."; $(CARGO) install cargo-watch; }
	@echo "Starting live reload environment..."
	$(CARGOWATCH) \
		--watch $(SHARED_DIR)/src \
		--watch $(WASM_DIR)/src \
		--watch $(SERVER_DIR)/src \
		--shell "make build-wasm && make run"

# Clean up all Rust target directories and generated Wasm files
clean:
	@echo "Cleaning workspace builds..."
	$(CARGO) clean
	rm -rf $(SERVER_DIR)/static