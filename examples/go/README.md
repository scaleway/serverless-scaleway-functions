# Go Runtime (>= 1.17)

## Requirements

- your code must be a valid Go module: a `go.mod` file is expected in the root directory
- your handler function should be in a file at the root of your module
- your handler must be exported, example: `Handle` is correct, `handle` is not because it is not exported
- your handler must have the following signature: `func Handle(w http.ResponseWriter, r *http.Request)`
- `main` package is reserved: you must not have any package named `main` in your module

Suggested code layout:

```
.
├── go.mod        # your go.mod defines your module
├── go.sum        # not always necessary 
├── myfunc.go     # your handler method (exported) must be defined here
└── subpackage    # you can have subpackages
    └── hello.go  # with files inside
```

## Run

If your code depends on private dependencies, you will need to run `go mod vendor` before deploying your function.

See [Official Go Vendoring reference](https://go.dev/ref/mod#go-mod-vendor).
