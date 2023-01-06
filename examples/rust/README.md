# Rust runtime

## Requirements

Suggested code layout:

```
.
├── Cargo.toml
├── Cargo.lock
└── src/handler.rs
```

## Handler name

The `handler name` is the name of your handler function (example: `Handle`).

## Handler definition

Rust handler must be async to work.