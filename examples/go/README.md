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

## Handler name

The `handler name` is the name of your handler function (example: `Handle`).

If your code is in a subfolder, like this:

```
.
└── subfolder
   ├── go.mod
   ├── go.sum
   └── myfunc.go # Handle function in that file
```

The `handler name` must be composed of the folder name and the handler function name, separated by `/`. For the example above, `subfolder/Handle` is the right `handler name`.

## Run

If your code depends on private dependencies, you will need to run `go mod vendor` before deploying your function.

See [Official Go Vendoring reference](https://go.dev/ref/mod#go-mod-vendor).

## Local testing

This examples use the [Go Framework](https://github.com/scaleway/serverless-functions-go) for local testing.
To call you handler locally run `go run cmd/main.go`.
