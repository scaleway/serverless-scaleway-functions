# Go Runtime (>= 1.17)

## Requirements

- your code must be a valid Go module: a `go.mod` file is expected at the root
- your handler function should be in a file at the root of your module
- your handler must be exported: `Handle` is correct, `handle` is not
- `main` package is reserved: you must not have any package named `main` in your module

Example of a right structure:

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
